# AitoVideo — Agent Entry Point

## What is this
Telegram Mini App for managing a video queue (YouTube, Rutube, VK Video).
Backend serves API + bot; Mini App is the UI inside Telegram.

## Stack
- **Backend:** Node.js 20 + TypeScript + Express + SQLite (better-sqlite3)
- **Frontend:** React + TypeScript + Vite
- **Bot:** node-telegram-bot-api
- **Logging:** pino (structured JSON); use child loggers, NOT console.log
- **Deploy:** Docker Swarm via Portainer; images pushed to `rast53/*` on Docker Hub

## Commands
| Script | Purpose |
|---|---|
| `./scripts/check.sh` | TypeScript type-check (backend + miniapp) |
| `./scripts/build.sh` | Build Docker images |
| `./scripts/deploy.sh` | Deploy stack to Swarm |
| `./scripts/logs.sh` | Tail service logs |
| `./scripts/health.sh` | Health-check endpoints |

## Constraints
1. **DB schema is sacred** — never drop tables/columns without a migration; never change `videoId` type or DB file path.
2. **No `console.log`** — use pino loggers (`apiLogger`, `botLogger`, `serviceLogger`, `dbLogger`).
3. **No hardcoded secrets** — tokens and keys come from `.env` only.
4. **API stability** — do not change `/api/videos` response format without versioning.

## Architecture
```
Telegram Bot ──▶ Backend (Express) ──▶ SQLite
                       │
                       ▼
                 Mini App (React)
```
Full architecture, patterns, and deploy details: **`.openclaw/ARCHITECTURE.md`**
Constraints and red lines: **`.openclaw/CONSTRAINTS.md`**
