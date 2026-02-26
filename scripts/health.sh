#!/usr/bin/env bash
set -euo pipefail

TARGET_URL="${1:-${HEALTH_URL:-http://127.0.0.1:3000/health}}"

hint() {
  echo "Hint: $1"
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: required command '$cmd' is not installed."
    case "$cmd" in
      curl) hint "Install curl and retry." ;;
    esac
    exit 1
  fi
}

echo "[health] Pre-flight checks..."
require_cmd curl

tmp_body="$(mktemp)"
trap 'rm -f "$tmp_body"' EXIT

echo "[health] Probing: $TARGET_URL"
set +e
status="$(curl -sS -m 10 -o "$tmp_body" -w "%{http_code}" "$TARGET_URL")"
curl_rc=$?
set -e

if [[ $curl_rc -ne 0 ]]; then
  echo "ERROR: failed to reach health endpoint."
  hint "Start backend first: cd backend && BOT_TOKEN=<token> npm run dev"
  hint "If backend uses another port, pass URL explicitly: ./scripts/health.sh http://127.0.0.1:3001/health"
  exit 1
fi

body="$(<"$tmp_body")"
echo "[health] HTTP status: $status"
echo "[health] Response body: $body"

if [[ "$status" != "200" ]]; then
  echo "ERROR: non-200 status from health endpoint."
  hint "Inspect backend logs and verify env vars (BOT_TOKEN, PORT, DATABASE_URL)."
  exit 1
fi

if [[ "$body" == *'"status":"ok"'* || "$body" == *'"status": "ok"'* ]]; then
  echo "[health] SUCCESS: backend reports status=ok."
  exit 0
fi

echo "ERROR: health endpoint responded 200 but body does not contain status=ok."
hint "Confirm /health contract in backend/src/api/index.ts and any reverse-proxy rewrites."
exit 1
