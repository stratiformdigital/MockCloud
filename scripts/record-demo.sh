#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TEMP_DIR=~/temp
MOCKCLOUD_DIR="${TEMP_DIR}/MockCloud"
PORT=4444
ENDPOINT="http://localhost:${PORT}"

cleanup() {
  echo ""
  echo "==> Cleaning up..."
  lsof -ti :${PORT} | xargs kill -9 2>/dev/null || true
  pkill -f DynamoDBLocal 2>/dev/null || true
  rm -rf "${MOCKCLOUD_DIR}"
}
trap cleanup EXIT

echo "==> Step 1: Cleaning up previous state"
lsof -ti :${PORT} | xargs kill -9 2>/dev/null || true
pkill -f DynamoDBLocal 2>/dev/null || true
rm -rf "${MOCKCLOUD_DIR}"
rm -rf "${REPO_DIR}/demo-video"
rm -f "${REPO_DIR}/demo.mp4"
mkdir -p "$TEMP_DIR"

echo "==> Step 2: Recording terminal demo with VHS"
cd "$TEMP_DIR"
export YARN_ENABLE_PROGRESS_BARS=false
export AWS_PAGER=
vhs "$REPO_DIR/scripts/record-terminal-demo.tape"

if [ ! -f "${TEMP_DIR}/demo.mp4" ]; then
  echo "ERROR: VHS did not produce ${TEMP_DIR}/demo.mp4" >&2
  exit 1
fi
echo "    Terminal recording saved to ${TEMP_DIR}/demo.mp4"

echo "==> Step 3: Verifying server is running"
if ! curl -sf "$ENDPOINT/health" > /dev/null 2>&1; then
  echo "ERROR: Server is not running after VHS recording" >&2
  exit 1
fi
echo "    Server healthy"

echo "==> Step 4: Recording console demo with Playwright"
cd "$REPO_DIR"
MOCKCLOUD_URL="$ENDPOINT" npx tsx scripts/record-console-demo.ts

CONSOLE_VIDEO=$(find "${REPO_DIR}/demo-video" -name '*.webm' -type f | head -1)
if [ -z "$CONSOLE_VIDEO" ]; then
  echo "ERROR: No WebM file found in demo-video/" >&2
  exit 1
fi
echo "    Console recording saved to ${CONSOLE_VIDEO}"

echo "==> Step 5: Combining videos with ffmpeg"
TERMINAL_VIDEO="${TEMP_DIR}/demo.mp4"
COMBINED_OUTPUT="${REPO_DIR}/demo.mp4"

TERMINAL_SCALED=$(mktemp /tmp/terminal-scaled.XXXXXX.mp4)
CONSOLE_SCALED=$(mktemp /tmp/console-scaled.XXXXXX.mp4)
CONCAT_LIST=$(mktemp /tmp/concat-list.XXXXXX.txt)

ffmpeg -y -loglevel warning -i "$TERMINAL_VIDEO" \
  -vf "scale=1280:800:force_original_aspect_ratio=decrease,pad=1280:800:(ow-iw)/2:(oh-ih)/2,setsar=1" \
  -r 30 -c:v libx264 -preset fast -crf 18 -an \
  "$TERMINAL_SCALED"

ffmpeg -y -loglevel warning -i "$CONSOLE_VIDEO" \
  -vf "scale=1280:800:force_original_aspect_ratio=decrease,pad=1280:800:(ow-iw)/2:(oh-ih)/2,setsar=1" \
  -r 30 -c:v libx264 -preset fast -crf 18 -an \
  "$CONSOLE_SCALED"

cat > "$CONCAT_LIST" <<EOF
file '${TERMINAL_SCALED}'
file '${CONSOLE_SCALED}'
EOF

ffmpeg -y -loglevel warning -f concat -safe 0 -i "$CONCAT_LIST" \
  -c copy \
  "$COMBINED_OUTPUT"

rm -f "$TERMINAL_SCALED" "$CONSOLE_SCALED" "$CONCAT_LIST"

echo "==> Step 6: Final cleanup"
lsof -ti :${PORT} | xargs kill -9 2>/dev/null || true
pkill -f DynamoDBLocal 2>/dev/null || true
rm -rf "${MOCKCLOUD_DIR}"

echo ""
echo "Done! Combined demo video: ${COMBINED_OUTPUT}"
