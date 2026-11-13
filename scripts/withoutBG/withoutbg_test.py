# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "onnxruntime>=1.20",
#     "numpy>=1.26",
#     "pillow>=10.0",
#     "huggingface_hub>=0.25",
# ]
# ///
"""Run the withoutBG open-weights ONNX bundle locally on images.

Pipeline (sidecar schema 3, ``routed``), reimplemented from the Apache-2.0
withoutbg-python SDK (``src/withoutbg/routed.py``) so it has no SDK dependency:

  1. Router (ConvNeXt/DINOv3 backbone, 448x448) classifies the image into
     fine_strand / soft_detail / transparency / hard_opaque / flat_scene / vehicle
     and emits features f0..f3.
  2a. Soft categories -> withoutBG matting graph (Depth Anything V2 small at
      518x518 + the router features) -> coarse alpha 448x448.
  2b. Hard categories -> BiRefNet general at 1024x1024 -> alpha 1024x1024.
  3. Alpha is bilinearly upsampled to the native size and applied as the
     cutout's alpha channel.

All graph inputs are float32 RGB in [0, 1], NCHW, square-stretched; the graphs
normalize internally.

Examples:
  uv run withoutbg_test.py photo.jpg
  uv run withoutbg_test.py ./images --preview
  uv run withoutbg_test.py photo.jpg --route both --preview   # compare branches
  uv run withoutbg_test.py photo.jpg --repeat 5               # benchmark
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageOps

HF_REPO_ID = "withoutbg/withoutbg-openweights-onnx"
SIDECAR_FILENAME = "withoutbg-open-weights.onnx.json"
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}
SCRIPT_DIR = Path(__file__).resolve().parent

PROVIDER_ALIASES = {
    "cpu": "CPUExecutionProvider",
    "cuda": "CUDAExecutionProvider",
    "trt": "TensorrtExecutionProvider",
    "dml": "DmlExecutionProvider",
    "coreml": "CoreMLExecutionProvider",
    "xnnpack": "XnnpackExecutionProvider",
    "nnapi": "NnapiExecutionProvider",
}


# --------------------------------------------------------------------------- #
# Model files
# --------------------------------------------------------------------------- #
class Bundle:
    """Resolves bundle files from a local folder or the Hugging Face Hub."""

    def __init__(self, model_dir: Path | None, revision: str) -> None:
        self.model_dir = model_dir
        self.revision = revision
        self.sidecar: dict[str, Any] = json.loads(
            self.resolve(SIDECAR_FILENAME).read_text(encoding="utf-8")
        )
        if self.sidecar.get("schema_version") != 3 or self.sidecar.get("pipeline") != "routed":
            raise SystemExit(
                f"Unsupported sidecar: schema={self.sidecar.get('schema_version')} "
                f"pipeline={self.sidecar.get('pipeline')!r} (this script handles schema 3 'routed')"
            )

    def resolve(self, filename: str) -> Path:
        if self.model_dir is not None:
            path = self.model_dir / filename
            if not path.is_file():
                raise SystemExit(f"Missing model file: {path}")
            return path
        from huggingface_hub import hf_hub_download

        print(f"  resolving {filename} ({HF_REPO_ID}@{self.revision}) ...", flush=True)
        return Path(hf_hub_download(HF_REPO_ID, filename, revision=self.revision))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


# --------------------------------------------------------------------------- #
# Resizing (matches torch F.interpolate / the SDK exactly)
# --------------------------------------------------------------------------- #
def fit_max_size(image: Image.Image, max_w: int, max_h: int) -> Image.Image:
    w, h = image.size
    ar = w / h
    resize = False
    if w > max_w:
        w, h, resize = max_w, int(max_w / ar), True
    if h > max_h:
        h, w, resize = max_h, int(max_h * ar), True
    return image.resize((w, h)) if resize else image


def _bilinear_axis(src: int, dst: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    pos = np.maximum((np.arange(dst) + 0.5) * (src / dst) - 0.5, 0.0)
    i0 = pos.astype(np.int64)
    i1 = np.minimum(i0 + 1, src - 1)
    return i0, i1, (pos - i0).astype(np.float32)


def resize_bilinear(x: np.ndarray, height: int, width: int) -> np.ndarray:
    """(C, H, W) -> (C, height, width), torch bilinear, align_corners=False, no antialias."""
    _, h, w = x.shape
    if (h, w) == (height, width):
        return x
    r0, r1, rl = _bilinear_axis(h, height)
    c0, c1, cl = _bilinear_axis(w, width)
    rows = x[:, r0] * (1.0 - rl)[:, None] + x[:, r1] * rl[:, None]
    return rows[:, :, c0] * (1.0 - cl) + rows[:, :, c1] * cl


def resize_bicubic_antialias(rgb: np.ndarray, size: int) -> np.ndarray:
    """(H, W, 3) -> (3, size, size); PIL float bicubic == torch bicubic antialias."""
    return np.stack(
        [
            np.asarray(
                Image.fromarray(np.ascontiguousarray(rgb[..., c], np.float32)).resize(
                    (size, size), Image.Resampling.BICUBIC
                )
            )
            for c in range(3)
        ]
    )


def graph_inputs(
    rgb: np.ndarray, spec: dict[str, Any], cached: dict[str, np.ndarray] | None = None
) -> dict[str, np.ndarray]:
    feeds: dict[str, np.ndarray] = {}
    for name, s in spec["inputs"].items():
        if cached is not None and name in cached:
            feeds[name] = cached[name]
            continue
        size = int(s["size"])
        if s["interpolation"] == "bicubic" and s["antialias"]:
            x = resize_bicubic_antialias(rgb, size)
        elif s["interpolation"] == "bilinear" and not s["antialias"]:
            x = resize_bilinear(np.ascontiguousarray(rgb.transpose(2, 0, 1)), size, size)
        else:
            raise ValueError(f"Unsupported resize for input {name!r}: {s}")
        feeds[name] = np.ascontiguousarray(x[None], dtype=np.float32)
    return feeds


# --------------------------------------------------------------------------- #
# Pipeline
# --------------------------------------------------------------------------- #
class RoutedPipeline:
    def __init__(self, bundle: Bundle, providers: list[str], verify: bool) -> None:
        import onnxruntime as ort

        self.ort = ort
        self.bundle = bundle
        self.sc = bundle.sidecar
        self.providers = providers
        self.verify = verify
        self.sessions: dict[str, Any] = {}
        router = self.sc["router"]
        self.categories: list[str] = list(router["categories"])
        self.birefnet_categories = set(router["birefnet_categories"])
        self.max_size = tuple(int(v) for v in self.sc["max_inference_size"])

    def session(self, name: str) -> Any:
        if name in self.sessions:
            return self.sessions[name]
        spec = self.sc[name]
        path = self.bundle.resolve(spec["file"])
        t0 = time.perf_counter()
        if self.verify:
            if sha256_file(path) != spec["sha256"]:
                raise SystemExit(
                    f"SHA256 mismatch for {path.name}. The file on the Hub may not match this "
                    f"sidecar; try --revision <commit> or --no-verify."
                )
        opts = self.ort.SessionOptions()
        opts.graph_optimization_level = self.ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        sess = self.ort.InferenceSession(str(path), sess_options=opts, providers=self.providers)
        used = sess.get_providers()
        if used[0] != self.providers[0]:
            print(f"  warning: {name} fell back to {used[0]} (requested {self.providers[0]})")
        print(
            f"  loaded {name:<8} {path.name} ({path.stat().st_size / 1e6:.0f} MB) "
            f"on {used[0]} in {time.perf_counter() - t0:.1f}s"
        )
        self.sessions[name] = sess
        return sess

    def route(self, rgb: np.ndarray):
        spec = self.sc["router"]
        feeds = graph_inputs(rgb, spec)
        logits, *feats = self.session("router").run(
            [spec["logits_name"], *spec["feature_names"]], feeds
        )
        probs = np.exp(logits[0] - logits[0].max())
        probs /= probs.sum()
        category = self.categories[int(np.argmax(logits[0]))]
        return category, probs, feeds, dict(zip(spec["feature_names"], feats))

    def matting(self, rgb, feeds, feats) -> np.ndarray:
        spec = self.sc["coarse"]
        coarse_feeds = graph_inputs(rgb, spec, cached=feeds)
        coarse_feeds.update(feats)
        return self.session("coarse").run([spec["output_name"]], coarse_feeds)[0][0]

    def birefnet(self, rgb) -> np.ndarray:
        spec = self.sc["birefnet"]
        return self.session("birefnet").run([spec["output_name"]], graph_inputs(rgb, spec))[0][0]

    def run(self, image: Image.Image, force: str) -> dict[str, Any]:
        """Returns {'category', 'probs', 'mattes': {branch: L image}, 'timings': {...}}."""
        orig_size = image.size
        work = fit_max_size(image.convert("RGB"), *self.max_size)
        rgb = np.asarray(work, dtype=np.float32) / 255.0
        h, w = rgb.shape[:2]
        timings: dict[str, float] = {}

        t = time.perf_counter()
        category, probs, feeds, feats = self.route(rgb)
        timings["router"] = time.perf_counter() - t

        auto_branch = "birefnet" if category in self.birefnet_categories else "matting"
        branches = {"auto": [auto_branch], "both": ["matting", "birefnet"]}.get(force, [force])

        mattes: dict[str, Image.Image] = {}
        for branch in branches:
            t = time.perf_counter()
            coarse = self.birefnet(rgb) if branch == "birefnet" else self.matting(rgb, feeds, feats)
            timings[branch] = time.perf_counter() - t
            if coarse.ndim != 3 or coarse.shape[0] != 1 or not np.isfinite(coarse).all():
                raise RuntimeError(f"{branch} output must be finite [1, H, W], got {coarse.shape}")
            t = time.perf_counter()
            alpha = np.clip(resize_bilinear(coarse, h, w), 0.0, 1.0)[0]
            matte = Image.fromarray(np.clip(alpha * 255.0 + 0.5, 0, 255).astype(np.uint8), "L")
            if matte.size != orig_size:
                matte = matte.resize(orig_size, Image.Resampling.BILINEAR)
            timings[f"{branch}_post"] = time.perf_counter() - t
            mattes[branch] = matte

        return {
            "category": category,
            "auto_branch": auto_branch,
            "probs": probs,
            "mattes": mattes,
            "timings": timings,
        }


# --------------------------------------------------------------------------- #
# Output helpers
# --------------------------------------------------------------------------- #
def checkerboard(size: tuple[int, int], cell: int = 16) -> Image.Image:
    w, h = size
    yy, xx = np.mgrid[0:h, 0:w]
    board = (((xx // cell) + (yy // cell)) % 2).astype(np.uint8)
    arr = np.where(board[..., None] == 1, 200, 255).astype(np.uint8).repeat(3, axis=2)
    return Image.fromarray(arr, "RGB")


def make_preview(image: Image.Image, mattes: dict[str, Image.Image], max_h: int = 720) -> Image.Image:
    rgb = image.convert("RGB")
    scale = min(1.0, max_h / rgb.height)
    size = (max(1, round(rgb.width * scale)), max(1, round(rgb.height * scale)))
    tiles = [rgb.resize(size, Image.Resampling.LANCZOS)]
    for matte in mattes.values():
        m = matte.resize(size, Image.Resampling.BILINEAR)
        comp = checkerboard(size)
        comp.paste(tiles[0], (0, 0), m)
        tiles += [comp, m.convert("RGB")]
    out = Image.new("RGB", (size[0] * len(tiles), size[1]), "white")
    for i, tile in enumerate(tiles):
        out.paste(tile, (i * size[0], 0))
    return out


def collect_images(paths: list[Path]) -> list[Path]:
    found: list[Path] = []
    for p in paths:
        if p.is_dir():
            found += sorted(f for f in p.rglob("*") if f.suffix.lower() in IMAGE_EXTS)
        elif p.is_file():
            found.append(p)
        else:
            print(f"skip: {p} does not exist", file=sys.stderr)
    return found


def pick_providers(choice: str) -> list[str]:
    import onnxruntime as ort

    available = ort.get_available_providers()
    if choice == "auto":
        for p in ("CUDAExecutionProvider", "DmlExecutionProvider", "CoreMLExecutionProvider"):
            if p in available:
                return [p, "CPUExecutionProvider"]
        return ["CPUExecutionProvider"]
    wanted = PROVIDER_ALIASES.get(choice, choice)
    if wanted == "CUDAExecutionProvider" and hasattr(ort, "preload_dlls"):
        ort.preload_dlls()  # onnxruntime-gpu[cuda,cudnn] ships CUDA/cuDNN as pip packages
    if wanted not in available:
        raise SystemExit(
            f"{wanted} is not available in this onnxruntime build. Available: {available}\n"
            "See README.md for installing a GPU build."
        )
    return [wanted] if wanted == "CPUExecutionProvider" else [wanted, "CPUExecutionProvider"]


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def main() -> None:
    ap = argparse.ArgumentParser(
        description="Test the withoutBG open-weights ONNX background removal bundle locally.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    ap.add_argument("inputs", nargs="+", type=Path, help="image files and/or folders")
    ap.add_argument("-o", "--out", type=Path, default=SCRIPT_DIR / "output", help="output folder")
    ap.add_argument(
        "--route",
        choices=["auto", "matting", "birefnet", "both"],
        default="auto",
        help="auto = use the router's choice; matting/birefnet = force a branch; both = run both to compare",
    )
    ap.add_argument(
        "--provider",
        default="auto",
        help="auto, cpu, cuda, trt, dml, coreml, xnnpack, nnapi, or a full onnxruntime provider name",
    )
    ap.add_argument("--preview", action="store_true", help="also write a side-by-side preview PNG")
    ap.add_argument("--matte", action="store_true", help="also write the grayscale alpha matte PNG")
    ap.add_argument("--repeat", type=int, default=1, help="run each image N times (timing benchmark)")
    ap.add_argument(
        "--model-dir",
        type=Path,
        help="folder with the bundle files (default: the script's folder if the sidecar is there, else the Hub)",
    )
    ap.add_argument("--revision", default="main", help="Hugging Face revision (branch, tag or commit)")
    ap.add_argument("--no-verify", action="store_true", help="skip SHA256 checks of the ONNX files")
    args = ap.parse_args()

    images = collect_images(args.inputs)
    if not images:
        raise SystemExit("No input images found.")

    import onnxruntime as ort

    providers = pick_providers(args.provider)
    print(f"onnxruntime {ort.__version__}; providers available: {ort.get_available_providers()}")
    print(f"using: {providers}")

    model_dir = args.model_dir
    if model_dir is None and (SCRIPT_DIR / SIDECAR_FILENAME).is_file():
        model_dir = SCRIPT_DIR  # bundle downloaded next to the script
    print(f"model files: {model_dir or f'Hugging Face Hub ({HF_REPO_ID}@{args.revision})'}")
    bundle = Bundle(model_dir, args.revision)
    print(f"bundle: withoutBG {bundle.sidecar.get('variant')} v{bundle.sidecar.get('model_version')}")
    pipe = RoutedPipeline(bundle, providers, verify=not args.no_verify)
    args.out.mkdir(parents=True, exist_ok=True)

    for path in images:
        try:
            image = ImageOps.exif_transpose(Image.open(path))
            image.load()
        except Exception as exc:  # noqa: BLE001
            print(f"\n{path}: cannot open ({exc})", file=sys.stderr)
            continue

        print(f"\n{path.name}  {image.width}x{image.height}")
        runs: list[dict[str, Any]] = []
        for _ in range(max(1, args.repeat)):
            runs.append(pipe.run(image, args.route))
        res = runs[-1]

        top = np.argsort(res["probs"])[::-1][:3]
        route_txt = ", ".join(f"{pipe.categories[i]} {res['probs'][i]:.2f}" for i in top)
        print(f"  router: {res['category']} -> {res['auto_branch']}   ({route_txt})")

        # Skip run 0 when benchmarking: it includes session warm-up.
        timed = runs[1:] if len(runs) > 1 else runs
        for key in res["timings"]:
            vals = [r["timings"][key] for r in timed]
            print(f"  {key:<14} {np.median(vals) * 1000:8.1f} ms" + (" (median)" if len(timed) > 1 else ""))
        if len(runs) == 1:
            print("  (first run includes warm-up; use --repeat 3+ for steady-state timing)")

        rgba_src = image.convert("RGBA")
        for branch, matte in res["mattes"].items():
            suffix = "" if args.route == "auto" else f".{branch}"
            cutout = rgba_src.copy()
            cutout.putalpha(matte)
            out_path = args.out / f"{path.stem}{suffix}.png"
            cutout.save(out_path)
            print(f"  wrote {out_path}")
            if args.matte:
                matte.save(args.out / f"{path.stem}{suffix}.matte.png")

        if args.preview:
            prev_path = args.out / f"{path.stem}.preview.png"
            make_preview(image, res["mattes"]).save(prev_path)
            print(f"  wrote {prev_path}  (original | cutout | matte per branch)")

    peak = peak_memory_mb()
    if peak is not None:
        print(f"\npeak process memory: {peak:.0f} MB")


def peak_memory_mb() -> float | None:
    try:
        import resource  # Linux / Android / macOS

        rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        return rss / (1024 * 1024) if sys.platform == "darwin" else rss / 1024
    except ImportError:
        pass
    try:
        import psutil  # Windows, if installed

        return psutil.Process().memory_info().peak_wset / 1e6
    except Exception:  # noqa: BLE001
        return None


if __name__ == "__main__":
    main()
