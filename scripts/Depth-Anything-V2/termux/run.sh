# Runs depth_test.py in Termux and logs to termux_run.log (last line: RUN_EXIT=<code>).
# Usage (in Termux):  bash /sdcard/Download/Depth-Anything-V2/termux/run.sh --encoders vits
DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$DIR/termux_run.log"
cd "$DIR"
{
  echo "== start $(date) :: $*"
  python depth_test.py "$@"
  echo "== RUN_EXIT=$?"
} >> "$LOG" 2>&1
tail -3 "$LOG"
