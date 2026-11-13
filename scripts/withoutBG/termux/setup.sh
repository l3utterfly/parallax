# Installs the Python dependencies for withoutbg_test.py inside Termux (F-Droid build).
# Usage (in Termux):  bash /sdcard/Download/withoutBG/termux/setup.sh
# Output goes to termux_setup.log next to the script folder; the last line is SETUP_OK or SETUP_FAILED.
DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$DIR/termux_setup.log"
(
  set -e
  echo "== start $(date)"
  export DEBIAN_FRONTEND=noninteractive
  pkg update -y
  apt-get -y -o Dpkg::Options::=--force-confnew upgrade
  pkg install -y python python-numpy python-pillow python-onnxruntime
  python - <<'EOF'
import platform, numpy, PIL, onnxruntime as ort
print("python", platform.python_version(), platform.machine())
print("numpy", numpy.__version__, "| pillow", PIL.__version__, "| onnxruntime", ort.__version__)
print("providers", ort.get_available_providers())
EOF
) > "$LOG" 2>&1 && echo "== SETUP_OK" >> "$LOG" || echo "== SETUP_FAILED" >> "$LOG"
tail -5 "$LOG"
