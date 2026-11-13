# Installs the Python dependencies for depth_test.py inside Termux (F-Droid build).
# Usage (in Termux):  bash /sdcard/Download/Depth-Anything-V2/termux/setup.sh
# Output goes to termux_setup.log next to the script folder; the last line is SETUP_OK or SETUP_FAILED.
DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$DIR/termux_setup.log"
(
  set -e
  echo "== start $(date)"
  export DEBIAN_FRONTEND=noninteractive
  pkg update -y
  pkg install -y python python-numpy python-torch python-torchvision matplotlib
  # OpenCV lives in the official x11-repo, not termux-main.
  pkg install -y x11-repo
  pkg update -y
  # dbus: cv2 links Qt6DBus, but the package does not pull in libdbus-1.so.
  pkg install -y opencv-python dbus
  python - <<'EOF'
import platform, numpy, torch, torchvision, cv2, matplotlib
print("python", platform.python_version(), platform.machine())
print("numpy", numpy.__version__, "| torch", torch.__version__, "| torchvision", torchvision.__version__)
print("opencv", cv2.__version__, "| matplotlib", matplotlib.__version__)
print("torch threads", torch.get_num_threads())
EOF
) > "$LOG" 2>&1 && echo "== SETUP_OK" >> "$LOG" || echo "== SETUP_FAILED" >> "$LOG"
tail -5 "$LOG"
