#!/usr/bin/env bash
set -euo pipefail

# --- CONFIGURATION ---
VPS_HOST="${VPS_HOST:-root@5.35.88.34}"
DOCKER_USER="${DOCKER_USER:-rast53}"
STACK_NAME="${STACK_NAME:-aitovideo}"
COMPOSE_FILE="docker-compose.yml"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "🚀 Starting autonomous deployment for $STACK_NAME..."

# 1. Pre-flight checks
if ! command -v docker >/dev/null 2>&1; then
  echo "❌ ERROR: docker not found locally."
  exit 1
fi

# 2. Build and Push
echo "📦 Building images..."
docker build -t "${DOCKER_USER}/aitovideo-backend:latest" "$ROOT_DIR/backend"
docker build -t "${DOCKER_USER}/aitovideo-miniapp:latest" "$ROOT_DIR/miniapp"

echo "📤 Pushing images..."
docker push "${DOCKER_USER}/aitovideo-backend:latest"
docker push "${DOCKER_USER}/aitovideo-miniapp:latest"

# 3. Remote Swarm Update
echo "🌐 Updating Swarm stack at $VPS_HOST..."
# Send the compose file via stdin to docker stack deploy
ssh -o StrictHostKeyChecking=no "$VPS_HOST" "docker stack deploy -c - $STACK_NAME" < "$ROOT_DIR/$COMPOSE_FILE"

# 4. Force restart to pull new images
echo "🔄 Force updating services to pull latest images..."
ssh -o StrictHostKeyChecking=no "$VPS_HOST" "
  docker service update --force --with-registry-auth ${STACK_NAME}_backend && \
  docker service update --force --with-registry-auth ${STACK_NAME}_bot && \
  docker service update --force --with-registry-auth ${STACK_NAME}_miniapp
"

# 5. Verification: Logs
echo "🔍 Waiting 20s for services to stabilize..."
sleep 20
echo "📜 Recent backend logs from VPS:"
ssh -o StrictHostKeyChecking=no "$VPS_HOST" "docker service logs ${STACK_NAME}_backend --tail 50"

echo "✅ Deployment complete!"
