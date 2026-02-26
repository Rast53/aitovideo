#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCKER_USER="${DOCKER_USER:-rast53}"
STACK_NAME="${STACK_NAME:-aitovideo}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
EXECUTE_SWARM="${EXECUTE_SWARM:-0}"
DRY_RUN=0
VERSION="latest"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/deploy.sh [version] [--dry-run]

Examples:
  ./scripts/deploy.sh
  ./scripts/deploy.sh 1.2.3
  ./scripts/deploy.sh --dry-run
  EXECUTE_SWARM=1 ./scripts/deploy.sh latest

Environment variables:
  DOCKER_USER    Docker Hub namespace (default: rast53)
  STACK_NAME     Docker Swarm stack name (default: aitovideo)
  COMPOSE_FILE   Swarm compose file path from repo root (default: docker-compose.yml)
  EXECUTE_SWARM  Set to 1 to run Swarm commands on a VPS manager node
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
      docker) hint "Install Docker CLI/Engine and retry." ;;
      timeout) hint "Install coreutils (timeout command) or run Swarm logs manually." ;;
    esac
    exit 1
  fi
}

run_or_print() {
  local cmd="$1"
  if [[ $DRY_RUN -eq 1 ]]; then
    echo "[dry-run] $cmd"
  else
    echo "+ $cmd"
    bash -lc "$cmd"
  fi
}

for arg in "$@"; do
  case "$arg" in
    -h|--help)
      usage
      exit 0
      ;;
    --dry-run)
      DRY_RUN=1
      ;;
    *)
      if [[ "$VERSION" == "latest" ]]; then
        VERSION="$arg"
      else
        echo "ERROR: unexpected argument '$arg'."
        usage
        exit 1
      fi
      ;;
  esac
done

BACKEND_IMAGE="${DOCKER_USER}/aitovideo-backend"
MINIAPP_IMAGE="${DOCKER_USER}/aitovideo-miniapp"

echo "[deploy] Pre-flight checks..."
if [[ $DRY_RUN -eq 0 ]]; then
  require_cmd docker
  require_cmd timeout
else
  if ! command -v docker >/dev/null 2>&1; then
    echo "WARNING: docker command is not available; running in structure-only dry-run mode."
    hint "Install Docker to execute real build/push operations."
  fi
  if ! command -v timeout >/dev/null 2>&1; then
    echo "WARNING: timeout command is not available; log tail timeout won't be executable outside dry-run."
    hint "Install coreutils to enable bounded log tailing."
  fi
fi

if [[ ! -f "$ROOT_DIR/$COMPOSE_FILE" ]]; then
  echo "ERROR: compose file '$COMPOSE_FILE' not found in repository root."
  hint "Set COMPOSE_FILE correctly (for example COMPOSE_FILE=docker-compose.yml)."
  exit 1
fi

if [[ ! -f "$ROOT_DIR/backend/Dockerfile" || ! -f "$ROOT_DIR/miniapp/Dockerfile" ]]; then
  echo "ERROR: backend/Dockerfile or miniapp/Dockerfile is missing."
  hint "Ensure both Dockerfiles exist before deployment."
  exit 1
fi

if [[ $DRY_RUN -eq 0 ]]; then
  if ! docker info >/dev/null 2>&1; then
    echo "ERROR: Docker daemon is not reachable."
    hint "Start Docker and make sure current user can run docker commands."
    exit 1
  fi
fi

echo "[deploy] Building Docker images (version: $VERSION)..."
run_or_print "cd \"$ROOT_DIR\" && docker build -t \"${BACKEND_IMAGE}:${VERSION}\" ./backend"
run_or_print "cd \"$ROOT_DIR\" && docker build -t \"${MINIAPP_IMAGE}:${VERSION}\" ./miniapp"

if [[ "$VERSION" != "latest" ]]; then
  run_or_print "docker tag \"${BACKEND_IMAGE}:${VERSION}\" \"${BACKEND_IMAGE}:latest\""
  run_or_print "docker tag \"${MINIAPP_IMAGE}:${VERSION}\" \"${MINIAPP_IMAGE}:latest\""
fi

echo "[deploy] Pushing Docker images to registry..."
echo "Target registry namespace: ${DOCKER_USER}"
if [[ $DRY_RUN -eq 0 ]]; then
  hint "If push fails with auth error, run 'docker login' first."
fi
run_or_print "docker push \"${BACKEND_IMAGE}:${VERSION}\""
run_or_print "docker push \"${MINIAPP_IMAGE}:${VERSION}\""

if [[ "$VERSION" != "latest" ]]; then
  run_or_print "docker push \"${BACKEND_IMAGE}:latest\""
  run_or_print "docker push \"${MINIAPP_IMAGE}:latest\""
fi

echo "[deploy] Swarm update/restart step (requires VPS access)."
if [[ "$EXECUTE_SWARM" == "1" ]]; then
  echo "EXECUTE_SWARM=1 detected, applying stack update and forcing service restart..."
  run_or_print "cd \"$ROOT_DIR\" && docker stack deploy -c \"$COMPOSE_FILE\" \"$STACK_NAME\""
  run_or_print "docker service update --force \"${STACK_NAME}_backend\""
  run_or_print "docker service update --force \"${STACK_NAME}_bot\""
  run_or_print "docker service update --force \"${STACK_NAME}_miniapp\""

  echo "[deploy] Tailing service logs for 30s each..."
  run_or_print "timeout 30s docker service logs \"${STACK_NAME}_backend\" --tail 100 -f"
  run_or_print "timeout 30s docker service logs \"${STACK_NAME}_bot\" --tail 100 -f"
  run_or_print "timeout 30s docker service logs \"${STACK_NAME}_miniapp\" --tail 100 -f"
else
  echo "requires VPS access: run these commands on the Swarm manager:"
  echo "  docker stack deploy -c \"$COMPOSE_FILE\" \"$STACK_NAME\""
  echo "  docker service update --force \"${STACK_NAME}_backend\""
  echo "  docker service update --force \"${STACK_NAME}_bot\""
  echo "  docker service update --force \"${STACK_NAME}_miniapp\""
  echo "  timeout 30s docker service logs \"${STACK_NAME}_backend\" --tail 100 -f"
  echo "  timeout 30s docker service logs \"${STACK_NAME}_bot\" --tail 100 -f"
  echo "  timeout 30s docker service logs \"${STACK_NAME}_miniapp\" --tail 100 -f"
  hint "Use EXECUTE_SWARM=1 only when running on VPS manager with Swarm access."
fi

echo "[deploy] Done."
