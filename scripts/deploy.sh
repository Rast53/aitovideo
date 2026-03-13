#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCKER_USER="${DOCKER_USER:-rast53}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.yml}"
VPS_HOST="${VPS_HOST:-root@83.217.220.3}"
VPS_DIR="${VPS_DIR:-/opt/aitovideo}"
HEALTH_URL="${HEALTH_URL:-https://video.ragpt.ru/api/health}"
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

Environment variables:
  DOCKER_USER    Docker Hub namespace (default: rast53)
  COMPOSE_FILE   Compose file path from repo root (default: docker-compose.yml)
  VPS_HOST       SSH target host (default: root@83.217.220.3)
  VPS_DIR        Project directory on VPS (default: /opt/aitovideo)
  HEALTH_URL     Health-check URL (default: https://video.ragpt.ru/api/health)
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
      ssh)    hint "Install OpenSSH client and retry." ;;
      curl)   hint "Install curl and retry." ;;
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

# --- Pre-flight checks ---
echo "[deploy] Pre-flight checks..."
if [[ $DRY_RUN -eq 0 ]]; then
  require_cmd docker
  require_cmd ssh
  require_cmd curl
else
  if ! command -v docker >/dev/null 2>&1; then
    echo "WARNING: docker command is not available; running in structure-only dry-run mode."
    hint "Install Docker to execute real build/push operations."
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

# --- Build ---
echo "[deploy] Building Docker images (version: $VERSION)..."
run_or_print "cd \"$ROOT_DIR\" && docker build -t \"${BACKEND_IMAGE}:${VERSION}\" ./backend"
run_or_print "cd \"$ROOT_DIR\" && docker build -t \"${MINIAPP_IMAGE}:${VERSION}\" ./miniapp"

if [[ "$VERSION" != "latest" ]]; then
  run_or_print "docker tag \"${BACKEND_IMAGE}:${VERSION}\" \"${BACKEND_IMAGE}:latest\""
  run_or_print "docker tag \"${MINIAPP_IMAGE}:${VERSION}\" \"${MINIAPP_IMAGE}:latest\""
fi

# --- Push ---
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

# --- Deploy via SSH + Docker Compose ---
echo "[deploy] Deploying on VPS ($VPS_HOST)..."
run_or_print "ssh $VPS_HOST 'cd $VPS_DIR && docker compose pull && docker compose up -d'"

# --- Health check ---
echo "[deploy] Running health check ($HEALTH_URL)..."
if [[ $DRY_RUN -eq 0 ]]; then
  sleep 5
  set +e
  status="$(curl -sS -m 15 -o /dev/null -w "%{http_code}" "$HEALTH_URL")"
  curl_rc=$?
  set -e

  if [[ $curl_rc -ne 0 ]]; then
    echo "WARNING: could not reach health endpoint ($HEALTH_URL)."
    hint "Check VPS connectivity and backend logs."
  elif [[ "$status" == "200" ]]; then
    echo "[deploy] Health check passed (HTTP $status)."
  else
    echo "WARNING: health check returned HTTP $status."
    hint "Inspect logs: ssh $VPS_HOST 'cd $VPS_DIR && docker compose logs --tail 50'"
  fi
else
  echo "[dry-run] curl -sS -m 15 $HEALTH_URL"
fi

# --- Tail logs ---
echo "[deploy] Tailing logs..."
run_or_print "ssh $VPS_HOST 'cd $VPS_DIR && docker compose logs --tail 30'"

echo "[deploy] Done."
