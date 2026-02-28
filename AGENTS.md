# AitoVideo

## Что это
Telegram Mini App для управления очередью видео с YouTube, Rutube, VK Video. Архитектура: Backend на Node.js + Frontend (Mini App) на React + локальная SQLite + Bot на Node.js.

## Tech stack
Node.js 20, TypeScript, Express, SQLite (better-sqlite3), React, Vite, Docker Swarm

## Commands
- `./scripts/check.sh` — typecheck + validate everything
- `./scripts/build.sh` — build Docker images
- `./scripts/deploy.sh` — deploy to Swarm (production)
- `./scripts/health.sh` — check health of deployed services
- `./scripts/logs.sh` — show recent service logs

## Constraints
- ES modules only (import with .js extension in TS)
- No console.log — use `backend/src/logger.ts`
- No hardcoded secrets (use `.env.example` to see what's needed)
- DB migrations only via `backend/src/models/migrations/`
- DO NOT change public API `/api/videos` without explicit permission

## Architecture & Context
See `.openclaw/ARCHITECTURE.md` and `.openclaw/CONSTRAINTS.md`
