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

run_build() {
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

echo "[build] Validating prerequisites..."
require_cmd node
require_cmd npm

if [[ ! -f "$ROOT_DIR/backend/package.json" || ! -f "$ROOT_DIR/miniapp/package.json" ]]; then
  echo "ERROR: backend/package.json or miniapp/package.json not found."
  hint "Run this script from inside the aitovideo repository."
  exit 1
fi

if [[ ! -d "$ROOT_DIR/backend/node_modules" || ! -d "$ROOT_DIR/miniapp/node_modules" ]]; then
  echo "WARNING: one or more node_modules directories are missing."
  hint "Run npm install in backend and miniapp before build."
fi

run_build \
  "Backend build (tsc -p tsconfig.build.json)" \
  "cd \"$ROOT_DIR/backend\" && npm run build" \
  "Inspect backend TypeScript errors and ensure BOT_TOKEN-dependent code compiles."

run_build \
  "Miniapp build (vite build)" \
  "cd \"$ROOT_DIR/miniapp\" && npm run build" \
  "Check miniapp source and Vite config, then rerun ./scripts/build.sh."

echo ""
if [[ $FAILED -ne 0 ]]; then
  echo "[build] One or more builds failed."
  exit 1
fi

echo "[build] All builds completed successfully."
