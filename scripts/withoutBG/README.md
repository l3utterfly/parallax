# withoutBG local test

`withoutbg_test.py` runs the [withoutBG open-weights ONNX bundle](https://huggingface.co/withoutbg/withoutbg-openweights-onnx)
(v10.12.4, sidecar schema 3) on your own images with onnxruntime. It needs neither the withoutBG SDK nor PyTorch.

## How the model works

```
image ─► router (ConvNeXt/DINOv3, 448²) ─► category + features f0..f3
            │
            ├─ fine_strand / soft_detail / transparency ─► withoutBG matting (Depth Anything V2-S 518² + f0..f3) ─► alpha 448²
            └─ hard_opaque / flat_scene / vehicle      ─► BiRefNet general (1024²)                                ─► alpha 1024²
                                                                                    ─► bilinear upsample to native size
```

| File | Size | When it's needed |
|---|---|---|
| `withoutbg-open-weights-backbone.onnx` | ~350 MB | always |
| `withoutbg-open-weights.onnx` | ~104 MB | soft or matting categories |
| `birefnet-general.onnx` | ~1.04 GB | hard-edged categories |

The bundle has already been downloaded into this folder, next to the script, along with `LICENSE` and
`THIRD_PARTY_NOTICES.md`. The script uses these local files automatically. If they're missing, it falls back to
downloading from the Hub into the Hugging Face cache, and it only fetches BiRefNet when an image is routed to it. Every
file is checked against the SHA256 listed in the sidecar.

Test images and their licenses are listed in `test_images/SOURCES.md`.

## Run (CPU)

Requires [uv](https://docs.astral.sh/uv/). It installs the dependencies listed inline in the script.

```bash
uv run scripts/withoutBG/withoutbg_test.py path/to/photo.jpg --preview
```

Outputs go to `scripts/withoutBG/output/`:
- `<name>.png`: RGBA cutout
- `<name>.preview.png`: original | cutout on a checkerboard | matte (`--preview`)
- `<name>.matte.png`: grayscale alpha (`--matte`)

Useful flags:
- `--route both`: runs both branches so you can compare matting and BiRefNet on the same image
- `--route matting` or `--route birefnet`: forces one branch
- `--repeat 5`: benchmark mode; reports median timings with warm-up excluded
- `--provider cpu|cuda|dml|trt`: picks the execution provider (default `auto`)
- `--model-dir DIR`: uses files you already downloaded
- `--revision <commit>`: pins a Hub revision (try this if the SHA256 check fails)

A folder works as input too: `uv run scripts/withoutBG/withoutbg_test.py ./my_images --route both --preview`

## GPU

The inline dependencies install the CPU build. GPU builds of onnxruntime replace the `onnxruntime` package, so use a
venv:

NVIDIA (CUDA):
```bash
uv venv scripts/withoutBG/.venv
uv pip install --python scripts/withoutBG/.venv "onnxruntime-gpu[cuda,cudnn]" numpy pillow huggingface_hub
scripts/withoutBG/.venv/Scripts/python scripts/withoutBG/withoutbg_test.py photo.jpg --provider cuda --repeat 3
```

Any DX12 GPU on Windows (DirectML): install `onnxruntime-directml` instead of `onnxruntime-gpu[...]`, then pass
`--provider dml`.

## Android (Termux)

Tested on a Galaxy S25+ (Snapdragon 8 Elite, 12 GB RAM) with the F-Droid build of Termux (0.118.3). Termux's own
`python-onnxruntime` 1.31.1 package runs the script as-is, with no C++ build.

1. Install Termux from F-Droid, then grant it storage access:
   ```bash
   adb shell pm grant com.termux android.permission.READ_EXTERNAL_STORAGE
   ```
   (or run `termux-setup-storage` inside Termux).
2. Push this folder to the phone:
   ```bash
   adb push <files> /sdcard/Download/withoutBG/
   ```
3. In Termux, install the packages:
   ```bash
   bash /sdcard/Download/withoutBG/termux/setup.sh
   ```
   This installs python, numpy, pillow and onnxruntime and logs to `termux_setup.log`.
4. In Termux, run the script:
   ```bash
   bash /sdcard/Download/withoutBG/termux/run.sh test_images --route matting --preview --repeat 3 -o output_phone/matting
   ```
   It logs to `termux_run.log`.
5. Pull the results back:
   ```bash
   adb pull /sdcard/Download/withoutBG/output_phone
   ```

Measured on CPU (median of 3 runs):

| | Router | Matting | BiRefNet | Peak memory |
|---|---|---|---|---|
| S25+ (Termux) | ~0.8–1.4 s | ~0.8 s | ~25 s | 1.1 GB (matting) / 6.8 GB (BiRefNet) |
| Laptop CPU | ~0.8 s | ~0.9 s | ~4.6 s | 0.9 GB / 4.9 GB |

The phone's mattes match the PC's to within 1/255 per pixel. The Termux onnxruntime build also offers the `xnnpack` and
`nnapi` providers (`--provider xnnpack`); these haven't been benchmarked yet.

## Notes for mobile evaluation

- These graphs are fp32 and large: the backbone plus matting graph come to ~450 MB, plus another ~1 GB for BiRefNet.
  For phones you'd need fp16/int8 conversion, or you'd need to drop the BiRefNet branch.
- The matting branch infers at 448² and upsamples the result. Very fine hair on large images will be softer than the
  BiRefNet output at 1024².
- The paid "edge refine" stage isn't included in the open weights.
- License: the bundle uses the withoutBG Open Weights license, which combines DINOv3-derived weights (Meta DINOv3
  License), Depth Anything V2-S (Apache-2.0) and BiRefNet (MIT). Check
  [the license](https://withoutbg.com/open-model/license) before shipping.
