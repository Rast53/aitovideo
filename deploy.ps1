# Build and push Docker images to Docker Hub
# Usage: .\deploy.ps1 [version]
# Example: .\deploy.ps1 1.0.0

param(
    [string]$Version = "latest"
)

$ErrorActionPreference = "Stop"

$DOCKER_HUB_USER = "rast53"
$BACKEND_IMAGE = "$DOCKER_HUB_USER/aitovideo-backend"
$MINIAPP_IMAGE = "$DOCKER_HUB_USER/aitovideo-miniapp"

Write-Host "Building AitoVideo Docker images (version: $Version)..." -ForegroundColor Cyan

# Build backend
Write-Host "`nBuilding backend..." -ForegroundColor Yellow
docker build -t "${BACKEND_IMAGE}:${Version}" ./backend
if ($LASTEXITCODE -ne 0) { throw "Backend build failed" }

if ($Version -ne "latest") {
    docker tag "${BACKEND_IMAGE}:${Version}" "${BACKEND_IMAGE}:latest"
}

# Build miniapp
Write-Host "`nBuilding miniapp..." -ForegroundColor Yellow
docker build -t "${MINIAPP_IMAGE}:${Version}" ./miniapp
if ($LASTEXITCODE -ne 0) { throw "Miniapp build failed" }

if ($Version -ne "latest") {
    docker tag "${MINIAPP_IMAGE}:${Version}" "${MINIAPP_IMAGE}:latest"
}

# Push to Docker Hub
Write-Host "`nPushing to Docker Hub..." -ForegroundColor Yellow
docker push "${BACKEND_IMAGE}:${Version}"
docker push "${MINIAPP_IMAGE}:${Version}"

if ($Version -ne "latest") {
    docker push "${BACKEND_IMAGE}:latest"
    docker push "${MINIAPP_IMAGE}:latest"
}

Write-Host "`nDone! Images pushed to Docker Hub:" -ForegroundColor Green
Write-Host "  $BACKEND_IMAGE`:$Version"
Write-Host "  $MINIAPP_IMAGE`:$Version"
Write-Host "`nIn Portainer: redeploy the stack 'aitovideo' to pull the new images."
