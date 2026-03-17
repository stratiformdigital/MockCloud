#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

cleanup() {
  if [ -n "${SERVER_PID:-}" ]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

PORT="${MOCKCLOUD_TEST_PORT:-$(node -e "const net=require('node:net'); const server=net.createServer(); server.listen(0, 'localhost', () => { const address=server.address(); console.log(address.port); server.close(); });")}"
ENDPOINT="http://localhost:${PORT}"

export MOCKCLOUD_TEST_PORT="$PORT"
export MOCKCLOUD_TEST_ENDPOINT="$ENDPOINT"

yarn tsx src/cli.ts serve --port "$PORT" &
SERVER_PID=$!

for i in $(seq 1 30); do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "Server process died" >&2
    exit 1
  fi
  if curl -sf "$ENDPOINT/health" > /dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if ! curl -sf "$ENDPOINT/health" > /dev/null 2>&1; then
  echo "Server failed to become ready" >&2
  exit 1
fi

for i in $(seq 1 60); do
  if curl -sf -X POST -H "X-Amz-Target: DynamoDB_20120810.ListTables" -H "Content-Type: application/x-amz-json-1.0" -d '{}' "$ENDPOINT" > /dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

"$@"
