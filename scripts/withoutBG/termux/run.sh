# Runs withoutbg_test.py in Termux and logs to termux_run.log (last line: RUN_EXIT=<code>).
# Usage (in Termux):  bash /sdcard/Download/withoutBG/termux/run.sh test_images --route matting --preview --repeat 3
DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$DIR/termux_run.log"
cd "$DIR"
{
  echo "== start $(date) :: $*"
  python withoutbg_test.py "$@"
  echo "== RUN_EXIT=$?"
} >> "$LOG" 2>&1
tail -3 "$LOG"
