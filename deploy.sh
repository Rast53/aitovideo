#!/bin/bash
# Build and push Docker images to Docker Hub
# Usage: ./deploy.sh [version]
# Example: ./deploy.sh 1.0.0

set -e

VERSION="${1:-latest}"
DOCKER_HUB_USER="rast53"
BACKEND_IMAGE="$DOCKER_HUB_USER/aitovideo-backend"
MINIAPP_IMAGE="$DOCKER_HUB_USER/aitovideo-miniapp"

echo "🚀 Building AitoVideo Docker images (version: $VERSION)..."

# Build backend
echo ""
echo "🔨 Building backend..."
docker build -t "${BACKEND_IMAGE}:${VERSION}" ./backend

if [ "$VERSION" != "latest" ]; then
  docker tag "${BACKEND_IMAGE}:${VERSION}" "${BACKEND_IMAGE}:latest"
fi

# Build miniapp
echo ""
echo "🔨 Building miniapp..."
docker build -t "${MINIAPP_IMAGE}:${VERSION}" ./miniapp

if [ "$VERSION" != "latest" ]; then
  docker tag "${MINIAPP_IMAGE}:${VERSION}" "${MINIAPP_IMAGE}:latest"
fi

# Push to Docker Hub
echo ""
echo "📤 Pushing to Docker Hub..."
docker push "${BACKEND_IMAGE}:${VERSION}"
docker push "${MINIAPP_IMAGE}:${VERSION}"

if [ "$VERSION" != "latest" ]; then
  docker push "${BACKEND_IMAGE}:latest"
  docker push "${MINIAPP_IMAGE}:latest"
fi

echo ""
echo "✅ Done! Images pushed to Docker Hub:"
echo "   ${BACKEND_IMAGE}:${VERSION}"
echo "   ${MINIAPP_IMAGE}:${VERSION}"
echo ""
echo "➡️  In Portainer: force-update services 'backend', 'bot' and 'miniapp' in stack 'aitovideo'."
