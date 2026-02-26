#!/usr/bin/env bash
set -euo pipefail

# --- CONFIGURATION ---
VPS_HOST="${VPS_HOST:-root@5.35.88.34}"
DOCKER_USER="${DOCKER_USER:-rast53}"
STACK_NAME="${STACK_NAME:-aitovideo}"
COMPOSE_FILE="docker-compose.yml"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/backend/.env"

echo "🚀 Starting autonomous deployment for $STACK_NAME..."

# 1. Pre-flight checks
if ! command -v docker >/dev/null 2>&1; then
  echo "❌ ERROR: docker not found locally."
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ ERROR: .env file not found at $ENV_FILE"
  echo "FIX: Create $ENV_FILE with BOT_TOKEN, AITOVIDEO_DOMAIN, etc."
  exit 1
fi

# 2. Export environment variables from .env
echo "🔐 Loading secrets from $ENV_FILE..."
# Read .env, ignore comments, export each variable
set -a
source "$ENV_FILE"
set +a

# 3. Validation: Check if critical vars are set
: "${BOT_TOKEN:?ERROR: BOT_TOKEN is not set in $ENV_FILE}"
: "${AITOVIDEO_DOMAIN:?ERROR: AITOVIDEO_DOMAIN is not set in $ENV_FILE}"

# 4. Build and Push
echo "📦 Building images..."
docker build -t "${DOCKER_USER}/aitovideo-backend:latest" "$ROOT_DIR/backend"
docker build -t "${DOCKER_USER}/aitovideo-miniapp:latest" "$ROOT_DIR/miniapp"

echo "📤 Pushing images..."
docker push "${DOCKER_USER}/aitovideo-backend:latest"
docker push "${DOCKER_USER}/aitovideo-miniapp:latest"

# 5. Remote Swarm Update
echo "🌐 Updating Swarm stack at $VPS_HOST..."
# Pass environment variables to the remote command so docker stack deploy can see them
# We use env to pass only the needed variables
ENV_VARS="BOT_TOKEN='$BOT_TOKEN' AITOVIDEO_DOMAIN='$AITOVIDEO_DOMAIN' VK_SERVICE_TOKEN='${VK_SERVICE_TOKEN:-}' YTDLP_PROXY='${YTDLP_PROXY:-}'"

ssh -o StrictHostKeyChecking=no "$VPS_HOST" "$ENV_VARS docker stack deploy -c - $STACK_NAME" < "$ROOT_DIR/$COMPOSE_FILE"

# 6. Force restart to pull new images
echo "🔄 Force updating services to pull latest images..."
ssh -o StrictHostKeyChecking=no "$VPS_HOST" "
  $ENV_VARS docker service update --force --with-registry-auth ${STACK_NAME}_backend && \
  $ENV_VARS docker service update --force --with-registry-auth ${STACK_NAME}_bot && \
  $ENV_VARS docker service update --force --with-registry-auth ${STACK_NAME}_miniapp
"

# 7. Verification: Logs
echo "🔍 Waiting 20s for services to stabilize..."
sleep 20
echo "📜 Recent backend logs from VPS:"
ssh -o StrictHostKeyChecking=no "$VPS_HOST" "docker service logs ${STACK_NAME}_backend --tail 50"

# 8. Final Health Check (local to VPS)
echo "🏥 Checking health endpoint..."
ssh -o StrictHostKeyChecking=no "$VPS_HOST" "curl -s http://localhost:3000/health || echo 'Backend local port 3000 not reachable'"

echo "✅ Deployment complete!"
