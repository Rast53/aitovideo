# Deployment: aitovideo

## Infrastructure
- **Type**: Docker Swarm (Production)
- **Host**: `root@5.35.88.34` (VPS)
- **Monitoring**: `docker service ls`, `docker service logs`

## Deployment Flow
1. **Trigger**: Automatic merge to `master` branch.
2. **Action**: GitHub Actions (`deploy.yml`) builds and pushes images to Docker Hub (`rast53/`).
3. **Execution**: GitHub Actions connects via SSH to VPS and runs `docker stack deploy`.
4. **Verification**: CI verify deployment status.

## Secrets
All production secrets are stored in **GitHub Secrets**:
- `DOCKER_USERNAME` / `DOCKER_PASSWORD`
- `VPS_SSH_KEY` (used for SSH deployment)
- `BOT_TOKEN`, `AITOVIDEO_DOMAIN` (passed to containers)

## Manual Intervention
If CI fails, use `./scripts/deploy-remote.sh` ONLY if you have local credentials.
