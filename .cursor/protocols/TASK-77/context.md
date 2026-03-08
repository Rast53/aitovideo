# Context: TASK-77 — Player Header Controls

## Project Stack
- **Frontend:** React + TypeScript + Vite (`miniapp/`)
- **Backend:** Node.js 20 + TypeScript + Express (`backend/`)
- **Deploy:** Docker Swarm
- **Styles:** Plain CSS (no CSS frameworks), dark theme, `#1a1a2e` bg

## Key Files
- `miniapp/src/components/Player.tsx` — главный компонент плеера
- `miniapp/src/components/Player.css` — стили
- `miniapp/src/api.ts` — API клиент
- `miniapp/src/types/api.ts` — TypeScript типы
- `backend/src/api/routes/youtube.ts` — YouTube stream proxy
- `backend/src/api/routes/videos.ts` — Videos API

## Current State (player)

### YouTube воспроизведение
- Backend: `GET /api/youtube/stream/:videoId` → yt-dlp → stream
- Format selector (youtube.ts line 36): `best[height<=1080][ext=mp4][vcodec!=none][acodec!=none]/best[height<=1080][ext=mp4]/best[ext=mp4]/best`
- Качество **жёстко захардкожено** в `getStreamUrl()`, кэш по videoId
- URL кэшируется 1 час (`urlCache`, TTL = `CACHE_TTL_MS`)

### Альтернативные источники
- Видео с `parent_id != null` — это альтернативы (Rutube/VK)
- Текущая логика в App.tsx: если video.platform = youtube → native video через proxy; иначе iframe
- Нет явного toggle — всегда показывается та платформа которая в `video` объекте
- Выбор альтернативы происходит **выше** (в списке видео, не в плеере) через кнопку "найти альтернативу"

### Шапка плеера
- `isTopControlsVisible` — скрывается через 3 сек
- Содержит только кнопку "назад" (←)

## localStorage Keys (существующие)
- `aitovideo.player.zoom` — zoom scale

## localStorage Keys (новые, для этой задачи)
- `aitovideo.player.quality` — предпочитаемое качество: `360` | `480` | `720` | `1080` | `1440` | `2160`
- `aitovideo.player.speed` — скорость: `0.5` | `0.75` | `1` | `1.25` | `1.5` | `1.75` | `2`
- `aitovideo.player.useAlt` — `true` | `false`

## Architectural decision: How quality works
1. Frontend читает `localStorage.quality` (default: `1080`)
2. Передаёт в URL: `/api/youtube/stream/:videoId?quality=720`
3. Backend: новый аргумент `quality` в `getStreamUrl(videoId, quality)`
4. yt-dlp format selector меняется под запрошенное качество
5. После получения первого chunk'а — сервер знает реальное качество
6. Возвращает header `X-Actual-Quality: 720` (или `unknown`)
7. Frontend читает этот header из первого range-request ответа

**Проблема с header:** Range-request — fetch без credentials, ответ читается через `<video>` тег, не через fetch. Поэтому X-Actual-Quality не доступен напрямую.

**Решение:** Добавить `GET /api/youtube/info/:videoId?quality=720` endpoint, который возвращает `{ actualQuality: number, availableQualities: number[] }` — вызвать его при открытии плеера.

## Alt-source toggle: implementation
- App.tsx выбирает `video` для плеера из списка
- Если у video есть альтернативы (другие видео с `parent_id = video.id`), то toggle позволяет выбрать: показать YouTube (оригинал) или Alt (alt видео)
- Нужно передавать оригинал + его альтернативы в Player или хэндлить в App
- Проще: в App.tsx при открытии — определять "оригинальный" и "альтернативный" видео объекты, передавать оба в Player как props

## Constraints
- Не использовать console.log — только pino logger на backend
- ES modules: imports с .js extension в backend
- Не ломать существующий API `/api/videos` response format
- Стили — только .css файлы, без CSS-in-JS
