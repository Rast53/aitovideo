# TASK-71 Context — Unified Native Player + HLS Streaming

## What
Replace iframe-based video playback with a unified native `<video>` player using hls.js for HLS streams, add smart source selection (rutube > vk > youtube), and dual-icon platform badges on VideoCard.

## Stack
- Backend: Node.js 20 + TypeScript + Express + SQLite
- Frontend: React + TypeScript + Vite
- Deploy: Docker Swarm via Portainer

## Key files
- `backend/src/api/routes/stream.ts` — yt-dlp HLS proxy endpoint
- `backend/src/api/index.ts` — stream router registration
- `miniapp/src/components/Player.tsx` — native video + hls.js player
- `miniapp/src/components/VideoCard.tsx` — dual-icon badge, removed alt chips
- `miniapp/src/api.ts` — resolveStream API method
- `miniapp/src/types/api.ts` — StreamInfo type
- `miniapp/package.json` — hls.js dependency

## Constraints
- No iframe anymore — native `<video>` only
- Smart source: rutube(3) > vk(2) > youtube(1)
- HLS proxy with SSRF-safe allowlist
- Progress tracking (seek, resume) must keep working
