# Progress: TASK-77 — Player Header Controls

## Status: IN_PROGRESS

## Steps
- [x] Step 1: Backend — quality param + /info endpoint
- [x] Step 2: Frontend — API client update
- [x] Step 3: App.tsx — alt-source logic
- [x] Step 4: Player.tsx — три контрола в шапке
- [x] Step 5: Player.css — стили контролов
- [ ] Step 6: Verify + commit + PR

## Next step
Step 6: Verify + commit + PR

## Notes
- Shell access restricted (only `ls` works) — cannot run `./scripts/check.sh`, `git`, `npm`, or `node`
- All code changes implemented and manually verified for type correctness
- Need user to run `./scripts/check.sh` and then commit/PR

## Changes made

### Backend: `backend/src/api/routes/youtube.ts`
- Refactored `getStreamUrl(videoId)` → `getStreamUrl(videoId, quality)` with cache key `${videoId}:${quality}`
- Added `buildFormatSelector(quality)` — dynamic yt-dlp format selector
- Added `parseQuality(raw)` — validates quality param (360/480/720/1080/1440/2160)
- Added `getAvailableQualities(videoId)` — queries yt-dlp --list-formats, cached 1h
- Added `GET /api/youtube/info/:videoId?quality=N` — returns `{ availableQualities, requestedQuality, actualQuality }`
- Updated `GET /api/youtube/stream/:videoId` to accept `?quality=N`
- Replaced all `console.log/warn/error` with `apiLogger`

### Frontend: `miniapp/src/types/api.ts`
- Added `YoutubeInfoResponse` interface

### Frontend: `miniapp/src/api.ts`
- Added `getYoutubeInfo(videoId, quality)` method

### Frontend: `miniapp/src/App.tsx`
- Added `useAltSource` state (persisted in localStorage)
- Updated `handleVideoClick` — detects original/alt video pairs
- Added `handleToggleAlt` — swaps selectedVideo ↔ altVideoForPlayer
- Passes `altVideo`, `useAlt`, `onToggleAlt` props to Player

### Frontend: `miniapp/src/components/Player.tsx`
- Added `preferredQuality`, `actualQuality`, `availableQualities`, `playbackSpeed`, `openMenu` state
- Added localStorage helpers for quality and speed
- Added YouTube info fetch effect
- Added playback speed apply effect
- Quality change triggers stream reload
- Updated stream URL to include `?quality=` param
- Added three controls in top bar (right side):
  - Quality selector with popup (YouTube only)
  - Speed selector with popup (YouTube only)
  - Alt-source toggle button (when altVideo exists)

### Frontend: `miniapp/src/components/Player.css`
- `.player-controls-right` — flex row container
- `.player-control-btn` — pill button (rgba bg, blur, 13px)
- `.player-control-wrap` — relative wrapper for popup positioning
- `.player-control-popup` — dropdown menu (#1a1a2e bg, 12px radius)
- `.player-control-popup__item` — 44px min tap target
- `.player-control-popup__item--active` — accent color highlight
- `.player-control-popup-overlay` — transparent overlay to close popup
