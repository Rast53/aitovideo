#!/usr/bin/env bash
set -euo pipefail

STACK_NAME="${STACK_NAME:-aitovideo}"
TAIL_LINES="${TAIL_LINES:-100}"
DURATION_SECONDS="${DURATION_SECONDS:-30}"
PRINT_ONLY=0
SERVICE_SUFFIX=""

usage() {
  cat <<'EOF'
Usage:
  ./scripts/logs.sh [service-suffix] [--print-only]

Examples:
  ./scripts/logs.sh
  ./scripts/logs.sh backend
  DURATION_SECONDS=120 ./scripts/logs.sh bot
  ./scripts/logs.sh --print-only

Notes:
  - This script is for Docker Swarm and requires VPS manager access.
  - Service names are expected as: <stack>_<suffix>, e.g. aitovideo_backend.
EOF
}

hint() {
  echo "Hint: $1"
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "ERROR: required command '$cmd' is not installed."
    case "$cmd" in
      docker) hint "Install Docker CLI and retry." ;;
      timeout) hint "Install coreutils (timeout command) for bounded log tailing." ;;
    esac
    exit 1
  fi
}

for arg in "$@"; do
  case "$arg" in
    -h|--help)
      usage
      exit 0
      ;;
    --print-only)
      PRINT_ONLY=1
      ;;
    *)
      if [[ -z "$SERVICE_SUFFIX" ]]; then
        SERVICE_SUFFIX="$arg"
      else
        echo "ERROR: unexpected argument '$arg'."
        usage
        exit 1
      fi
      ;;
  esac
done

print_command() {
  local service_name="$1"
  if [[ "$DURATION_SECONDS" -gt 0 ]]; then
    echo "timeout ${DURATION_SECONDS}s docker service logs \"$service_name\" --tail \"$TAIL_LINES\" -f"
  else
    echo "docker service logs \"$service_name\" --tail \"$TAIL_LINES\" -f"
  fi
}

run_logs() {
  local service_name="$1"
  if [[ "$DURATION_SECONDS" -gt 0 ]]; then
    timeout "$DURATION_SECONDS"s docker service logs "$service_name" --tail "$TAIL_LINES" -f
  else
    docker service logs "$service_name" --tail "$TAIL_LINES" -f
  fi
}

if [[ $PRINT_ONLY -eq 1 ]]; then
  echo "requires VPS access: command structure only"
  if [[ -n "$SERVICE_SUFFIX" ]]; then
    print_command "${STACK_NAME}_${SERVICE_SUFFIX}"
  else
    print_command "${STACK_NAME}_backend"
    print_command "${STACK_NAME}_bot"
    print_command "${STACK_NAME}_miniapp"
  fi
  exit 0
fi

require_cmd docker
require_cmd timeout

if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker daemon is not reachable."
  hint "Run this script on the VPS with Docker configured."
  exit 1
fi

if ! docker node ls >/dev/null 2>&1; then
  echo "ERROR: docker node ls failed. Swarm manager access is required."
  echo "requires VPS access: this command must run on a Swarm manager node."
  hint "SSH to VPS manager and rerun ./scripts/logs.sh there."
  exit 1
fi

echo "requires VPS access: running on Swarm manager"
if [[ -n "$SERVICE_SUFFIX" ]]; then
  run_logs "${STACK_NAME}_${SERVICE_SUFFIX}"
else
  run_logs "${STACK_NAME}_backend"
  run_logs "${STACK_NAME}_bot"
  run_logs "${STACK_NAME}_miniapp"
fi
