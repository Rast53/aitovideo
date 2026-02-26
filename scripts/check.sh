#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILED=0

hint() {
  echo "Hint: $1"
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: required command '$cmd' is not installed."
    case "$cmd" in
      node) hint "Install Node.js 20+ and retry." ;;
      npm) hint "Install npm (bundled with Node.js) and retry." ;;
    esac
    exit 1
  fi
}

require_dir() {
  local dir="$1"
  if [[ ! -d "$dir" ]]; then
    echo "ERROR: missing directory '$dir'."
    hint "Run this script from the repository root where backend/ and miniapp/ exist."
    exit 1
  fi
}

run_check() {
  local name="$1"
  local cmd="$2"
  local fail_hint="$3"

  echo ""
  echo "==> ${name}"
  set +e
  bash -lc "$cmd"
  local rc=$?
  set -e
  if [[ $rc -ne 0 ]]; then
    echo "FAILED: ${name}"
    hint "$fail_hint"
    FAILED=1
  else
    echo "OK: ${name}"
  fi
}

echo "[check] Validating prerequisites..."
require_cmd node
require_cmd npm
require_dir "$ROOT_DIR/backend"
require_dir "$ROOT_DIR/miniapp"

if [[ ! -d "$ROOT_DIR/backend/node_modules" || ! -d "$ROOT_DIR/miniapp/node_modules" ]]; then
  echo "WARNING: one or more node_modules directories are missing."
  hint "Run 'cd backend && npm install' and 'cd miniapp && npm install' before type-checking."
fi

run_check \
  "Backend TypeScript type-check" \
  "cd \"$ROOT_DIR/backend\" && npm exec -- tsc -p tsconfig.json --noEmit" \
  "Fix backend TypeScript errors, then rerun ./scripts/check.sh."

run_check \
  "Miniapp TypeScript type-check" \
  "cd \"$ROOT_DIR/miniapp\" && npm exec -- tsc --noEmit" \
  "Fix miniapp TypeScript errors (currently known around Telegram WebApp types), then rerun ./scripts/check.sh."

echo ""
if [[ $FAILED -ne 0 ]]; then
  echo "[check] One or more checks failed."
  exit 1
fi

echo "[check] All checks passed."
