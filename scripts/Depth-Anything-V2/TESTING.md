# Depth Anything V2 local test

This folder is a shallow clone of [DepthAnything/Depth-Anything-V2](https://github.com/DepthAnything/Depth-Anything-V2)
(commit `a561b849`). `depth_test.py` was added on top of it. It runs the official
`depth_anything_v2` code on test images with the Small and Large checkpoints.

| Checkpoint | Params | License |
|---|---|---|
| `checkpoints/depth_anything_v2_vits.pth` (Small) | 24.8M | Apache-2.0 |
| `checkpoints/depth_anything_v2_vitl.pth` (Large) | 335.3M | CC-BY-NC-4.0 (non-commercial) |

## Run

Requires [uv](https://docs.astral.sh/uv/). The dependencies are declared inline in the script, including the
CPU-only PyTorch build. It runs on the CPU by default. To use a GPU, point the `[tool.uv.sources]` index in the script
header at a CUDA wheel index (for example `https://download.pytorch.org/whl/cu130` for the RTX 50-series) and pass
`--device cuda`.

```bash
uv run depth_test.py
```

With no image arguments, the script downloads the test photo listed in `test_images/SOURCES.md` and runs both models
on it. Other options:

```bash
uv run depth_test.py photo.jpg https://example.com/street.jpg   # your own files or URLs
uv run depth_test.py --encoders vits                            # Small only
uv run depth_test.py --input-size 1036                          # bigger input (multiple of 14), slower
```

Outputs go to `output/`:
- `<name>_<encoder>.png`: colored depth map (Spectral_r, near is red)
- `<name>_<encoder>_16bit.png`: raw relative inverse depth, min-max normalized to 16-bit grayscale
- `<name>_compare.png`: input | Small | Large, side by side

## Run on Android (Termux)

Tested on a Galaxy S25+ (SM-S936U, Snapdragon 8 Elite) with the F-Droid build of Termux 0.118.3, which already had
storage access. Push the code, the Small checkpoint and the test image to the phone:

```bash
adb shell mkdir -p /sdcard/Download/Depth-Anything-V2/checkpoints
adb push depth_anything_v2 depth_test.py LICENSE termux test_images /sdcard/Download/Depth-Anything-V2/
adb push checkpoints/depth_anything_v2_vits.pth /sdcard/Download/Depth-Anything-V2/checkpoints/
```

Then in Termux:

```bash
bash /sdcard/Download/Depth-Anything-V2/termux/setup.sh
bash /sdcard/Download/Depth-Anything-V2/termux/run.sh --encoders vits
```

`setup.sh` installs `python-torch`, `python-torchvision` and `matplotlib` from termux-main. It installs `opencv-python`
from the official `x11-repo`, plus `dbus`, because cv2 links `libQt6DBus` but the package doesn't pull in
`libdbus-1.so`. The logs go to `termux_setup.log` and `termux_run.log` in the same folder.

Results on the 1280x640 test image (518px input, CPU, 3 timed runs after one warm-up):

| Device | Small (vits) | Peak memory |
|---|---|---|
| PC, 24 threads | ~0.48 s | |
| Galaxy S25+, 8 threads, torch 2.15.0 | ~7.7 s | 1.3 GB |

The phone's depth map matches the PC output (max abs difference 2e-5 after normalization, correlation 1.0).
`output_phone/` has the files pulled back from the phone.

## Output

The model predicts relative inverse depth (disparity-like: larger means closer). It is not metric depth. For metric
depth, see `metric_depth/`.
