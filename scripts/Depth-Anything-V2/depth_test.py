# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "torch>=2.9",
#     "torchvision>=0.24",
#     "opencv-python>=4.9",
#     "matplotlib>=3.8",
#     "numpy>=1.26",
# ]
#
# [tool.uv.sources]
# torch = { index = "pytorch-cpu" }
# torchvision = { index = "pytorch-cpu" }
#
# [[tool.uv.index]]
# name = "pytorch-cpu"
# url = "https://download.pytorch.org/whl/cpu"
# explicit = true
# ///
"""Run Depth Anything V2 (small and large) on test images.

Uses the official repo code in this folder (``depth_anything_v2/``) and the
checkpoints in ``checkpoints/``. With no image arguments it downloads a test
photo from Wikimedia Commons into ``test_images/``.

Examples:
  uv run depth_test.py                                # default test image, vits + vitl
  uv run depth_test.py photo.jpg https://example.com/img.jpg
  uv run depth_test.py --encoders vits --runs 1
  uv run depth_test.py --input-size 1036              # higher-res inference (multiple of 14)

Outputs go to ``output/``:
  <name>_<encoder>.png        colored depth (Spectral_r, near = red)
  <name>_<encoder>_16bit.png  relative inverse depth, min-max normalized to uint16
  <name>_compare.png          original | one panel per encoder
"""

from __future__ import annotations

import argparse
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import cv2
import matplotlib
import numpy as np
import torch
import torch.nn.functional as F

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from depth_anything_v2.dpt import DepthAnythingV2  # noqa: E402

MODEL_CONFIGS = {
    "vits": {"encoder": "vits", "features": 64, "out_channels": [48, 96, 192, 384]},
    "vitb": {"encoder": "vitb", "features": 128, "out_channels": [96, 192, 384, 768]},
    "vitl": {"encoder": "vitl", "features": 256, "out_channels": [256, 512, 1024, 1024]},
}
MODEL_NAMES = {"vits": "Small", "vitb": "Base", "vitl": "Large"}

# "Tower Bridge from Shad Thames" by Colin, CC BY-SA 4.0 (Wikimedia Commons).
DEFAULT_IMAGE_URL = (
    "https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/"
    "Tower_Bridge_from_Shad_Thames.jpg/1280px-Tower_Bridge_from_Shad_Thames.jpg"
)
USER_AGENT = "depth-anything-v2-test/1.0"


def fetch_image(src: str) -> Path:
    """Return a local path for ``src``, downloading it into test_images/ if it is a URL."""
    if not src.startswith(("http://", "https://")):
        path = Path(src)
        if not path.is_file():
            sys.exit(f"Not a file: {src}")
        return path
    name = Path(urllib.parse.urlparse(src).path).name or "image.jpg"
    dest = HERE / "test_images" / name
    if not dest.exists():
        dest.parent.mkdir(parents=True, exist_ok=True)
        print(f"Downloading {src}")
        req = urllib.request.Request(src, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=60) as resp:
            dest.write_bytes(resp.read())
    return dest


def load_model(encoder: str, device: str) -> DepthAnythingV2:
    ckpt = HERE / "checkpoints" / f"depth_anything_v2_{encoder}.pth"
    if not ckpt.exists():
        sys.exit(f"Missing checkpoint: {ckpt}")
    model = DepthAnythingV2(**MODEL_CONFIGS[encoder])
    model.load_state_dict(torch.load(ckpt, map_location="cpu", weights_only=True))
    return model.to(device).eval()


@torch.inference_mode()
def infer(model: DepthAnythingV2, bgr: np.ndarray, input_size: int, device: str) -> np.ndarray:
    """Same as DepthAnythingV2.infer_image, but honors an explicit device."""
    image, (h, w) = model.image2tensor(bgr, input_size)
    depth = model(image.to(device))
    depth = F.interpolate(depth[:, None], (h, w), mode="bilinear", align_corners=True)[0, 0]
    return depth.float().cpu().numpy()


def sync(device: str) -> None:
    if device == "cuda":
        torch.cuda.synchronize()


def colorize(depth: np.ndarray, cmap) -> np.ndarray:
    norm = (depth - depth.min()) / max(float(depth.max() - depth.min()), 1e-8)
    return (cmap(norm)[:, :, :3] * 255)[:, :, ::-1].astype(np.uint8)  # RGB -> BGR


def label(img: np.ndarray, text: str) -> np.ndarray:
    out = img.copy()
    scale = max(img.shape[1] / 900, 0.6)
    thick = max(int(scale * 2), 1)
    (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, scale, thick)
    cv2.rectangle(out, (0, 0), (tw + 20, th + 20), (0, 0, 0), -1)
    cv2.putText(out, text, (10, th + 10), cv2.FONT_HERSHEY_SIMPLEX, scale, (255, 255, 255), thick, cv2.LINE_AA)
    return out


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("images", nargs="*", help="image paths or URLs (default: a Wikimedia test photo)")
    p.add_argument("--encoders", nargs="+", default=["vits", "vitl"], choices=list(MODEL_CONFIGS))
    p.add_argument("--input-size", type=int, default=518, help="short side fed to the model (default 518)")
    p.add_argument("--device", default="cpu", choices=["auto", "cuda", "cpu"],
                   help="default cpu; cuda needs a CUDA build of torch")
    p.add_argument("--runs", type=int, default=3, help="timed runs per image after one warm-up (default 3)")
    p.add_argument("--outdir", type=Path, default=HERE / "output")
    args = p.parse_args()

    device = ("cuda" if torch.cuda.is_available() else "cpu") if args.device == "auto" else args.device
    if device == "cuda" and not torch.cuda.is_available():
        sys.exit("CUDA requested but torch.cuda.is_available() is False")
    print(f"torch {torch.__version__} | device: {device}"
          + (f" ({torch.get_num_threads()} threads)" if device == "cpu" else "")
          + (f" ({torch.cuda.get_device_name(0)})" if device == "cuda" else ""))

    paths = [fetch_image(s) for s in (args.images or [DEFAULT_IMAGE_URL])]
    images = {}
    for path in paths:
        bgr = cv2.imread(str(path))
        if bgr is None:
            sys.exit(f"Could not read image: {path}")
        images[path] = bgr

    args.outdir.mkdir(parents=True, exist_ok=True)
    cmap = matplotlib.colormaps.get_cmap("Spectral_r")
    results: dict[Path, dict[str, np.ndarray]] = {p: {} for p in paths}

    for enc in args.encoders:
        t0 = time.perf_counter()
        model = load_model(enc, device)
        n_params = sum(p.numel() for p in model.parameters()) / 1e6
        print(f"\n[{enc}] Depth-Anything-V2-{MODEL_NAMES[enc]} ({n_params:.1f}M params) "
              f"loaded in {time.perf_counter() - t0:.1f}s")

        for path, bgr in images.items():
            infer(model, bgr, args.input_size, device)  # warm-up
            sync(device)
            t0 = time.perf_counter()
            for _ in range(args.runs):
                depth = infer(model, bgr, args.input_size, device)
            sync(device)
            ms = (time.perf_counter() - t0) / max(args.runs, 1) * 1000
            results[path][enc] = depth

            stem = f"{path.stem}_{enc}"
            cv2.imwrite(str(args.outdir / f"{stem}.png"), colorize(depth, cmap))
            norm = (depth - depth.min()) / max(float(depth.max() - depth.min()), 1e-8)
            cv2.imwrite(str(args.outdir / f"{stem}_16bit.png"), (norm * 65535).astype(np.uint16))
            print(f"  {path.name} {bgr.shape[1]}x{bgr.shape[0]}: {ms:.1f} ms/img, "
                  f"raw range [{depth.min():.3f}, {depth.max():.3f}]")

        del model
        if device == "cuda":
            torch.cuda.empty_cache()

    for path, bgr in images.items():
        panels = [label(bgr, "Input")]
        panels += [label(colorize(d, cmap), f"V2-{MODEL_NAMES[e]}") for e, d in results[path].items()]
        sep = np.full((bgr.shape[0], 10, 3), 255, np.uint8)
        row = panels[0]
        for panel in panels[1:]:
            row = np.hstack([row, sep, panel])
        out = args.outdir / f"{path.stem}_compare.png"
        cv2.imwrite(str(out), row)
        print(f"\nComparison: {out}")

    if len(args.encoders) > 1:
        a, b = args.encoders[:2]
        for path in paths:
            da, db = results[path][a].ravel(), results[path][b].ravel()
            print(f"Pearson correlation {a} vs {b} on {path.name}: {np.corrcoef(da, db)[0, 1]:.4f}")

    try:  # Linux/Android only; ru_maxrss is in KB there
        import resource
        print(f"peak process memory: {resource.getrusage(resource.RUSAGE_SELF).ru_maxrss // 1024} MB")
    except ImportError:
        pass


if __name__ == "__main__":
    main()
