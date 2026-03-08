# Plan: TASK-77 — Player Header Controls

## Размер: L (сложная задача, затрагивает и фронт и бэк)

## Files to touch
### Backend
- `backend/src/api/routes/youtube.ts` — добавить quality param + X-Actual-Quality header + /info endpoint

### Frontend  
- `miniapp/src/components/Player.tsx` — добавить 3 контрола в шапку
- `miniapp/src/components/Player.css` — стили для контролов
- `miniapp/src/api.ts` — добавить `getYoutubeInfo(videoId, quality)`
- `miniapp/src/App.tsx` — передать altVideo prop в Player, обрабатывать useAlt

---

## Steps

### Step 1: Backend — quality param + /info endpoint
**File:** `backend/src/api/routes/youtube.ts`

1.1. Рефакторинг `getStreamUrl(videoId)` → `getStreamUrl(videoId, quality: number = 1080)`
   - Cache key меняется: `${videoId}:${quality}`
   - Format selector меняется под качество:
     - 360 → `best[height<=360][ext=mp4][vcodec!=none][acodec!=none]/worst[ext=mp4]/worst`
     - 480 → `best[height<=480][ext=mp4]...`
     - 720 → `best[height<=720][ext=mp4]...`
     - 1080 → `best[height<=1080][ext=mp4]...` (текущий)
     - 1440 → `best[height<=1440][ext=mp4]...`
     - 2160 → `best[height<=2160][ext=mp4]...`
   - Fallback всегда присутствует

1.2. `/stream/:videoId` принимает `?quality=720` (default 1080)
   - Парсинг: `const quality = parseInt(req.query.quality as string) || 1080`
   - Валидация: только [360, 480, 720, 1080, 1440, 2160]

1.3. Добавить endpoint `GET /api/youtube/info/:videoId`
   - Запрашивает у yt-dlp список доступных форматов: `yt-dlp --list-formats --no-playlist`
   - Парсит вывод, определяет доступные высоты
   - Возвращает: `{ availableQualities: number[], requestedQuality: number, actualQuality: number }`
   - Кэшировать на 1 час (отдельный кэш `infoCache`)

**Acceptance:** endpoint возвращает корректный JSON, stream принимает quality param

### Step 2: Frontend — API client update
**File:** `miniapp/src/api.ts`

- Добавить `getYoutubeInfo(videoId: string, quality: number): Promise<YoutubeInfoResponse>`
- Обновить тип URL для stream: добавить `?quality=N` к stream URL

**File:** `miniapp/src/types/api.ts`
- Добавить `YoutubeInfoResponse: { availableQualities: number[], requestedQuality: number, actualQuality: number }`

**Acceptance:** TypeScript компилируется без ошибок

### Step 3: App.tsx — alt-source logic
**File:** `miniapp/src/App.tsx`

3.1. Добавить state `useAltSource: boolean` (default: true, из localStorage)
3.2. При `handleVideoClick(video)` — определить:
   - Если `video.parent_id !== null` — это уже альтернатива, получить оригинал из `videos`
   - Если `video.parent_id === null` — это оригинал, найти его альтернативы
3.3. Передавать в `<Player>`:
   - `video` — текущий (с учётом useAltSource)
   - `altVideo?: Video` — альтернативный (если есть)
   - `useAlt: boolean`
   - `onToggleAlt: () => void`

**Acceptance:** Player получает altVideo prop

### Step 4: Player.tsx — три контрола в шапке
**File:** `miniapp/src/components/Player.tsx`

4.1. localStorage helpers для quality (default 1080), speed (default 1), useAlt (default true)

4.2. State:
   - `preferredQuality: number` — из localStorage
   - `actualQuality: number | null` — из /info endpoint
   - `availableQualities: number[]` — из /info endpoint
   - `playbackSpeed: number` — из localStorage
   - `openMenu: 'quality' | 'speed' | null` — какой попап открыт

4.3. Effects:
   - При смене video + качества → вызвать `api.getYoutubeInfo(videoId, preferredQuality)` → обновить actualQuality + availableQualities
   - При смене speed → `nativeVideoRef.current.playbackRate = speed`
   - При смене preferredQuality → reload stream (сбросить playbackReady, изменить youtubeStreamUrl с новым quality)

4.4. Stream URL: `${API_URL}/api/youtube/stream/${video.external_id}?quality=${preferredQuality}`

4.5. UI — три кнопки в player-top-controls (справа):

**Quality button** (только YouTube):
```
[720p ▾]  ← показывает actualQuality или preferredQuality
```
По тапу → попап со списком availableQualities

**Speed button** (только YouTube native video):
```
[1× ▾]
```
По тапу → попап с вариантами скоростей

**Alt toggle** (только если есть altVideo):
```
[ALT ●]  или  [ALT ○]
```
Иконка: закрашенный/пустой круг = вкл/выкл

4.6. Попапы:
   - Рендерятся прямо в player-container (не через portal)
   - Закрываются по тапу вне (onPointerDown на overlay)
   - Не перехватывают события видео

4.7. Сохранение в localStorage при изменении

**Acceptance:** контролы рендерятся, попапы работают, speed применяется мгновенно

### Step 5: Player.css — стили контролов
**File:** `miniapp/src/components/Player.css`

- `.player-controls-right` — flex row, gap 8px, right-side of top controls
- `.player-control-btn` — pill-кнопка: bg rgba(0,0,0,0.6), padding 4px 10px, border-radius 20px, font-size 13px, color white
- `.player-control-popup` — попап снизу кнопки: absolute, bg #1a1a2e, border-radius 12px, shadow
- `.player-control-popup__item` — строка в попапе: padding 10px 16px, tap-target минимум 44px
- `.player-control-popup__item--active` — подсветка выбранного: accent color
- Контролы видимы/скрыты вместе с isTopControlsVisible

**Acceptance:** выглядит чисто, не перекрывает видео, работает на мобильном

### Step 6: Verify + commit
- `./scripts/check.sh` — TypeScript check должен пройти
- Проверить что нет console.log (только pino logger на бэке)
- Commit всех файлов

---

## Risks
- `/api/youtube/info/:videoId` может быть медленным (yt-dlp list-formats ~5-10 сек) → кэшировать агрессивно, показывать loading state
- stream quality может не совпасть с запрошенным (YouTube не всегда даёт все качества) → fallback, показывать actualQuality
- Для iframe (Rutube/VK) speed и quality не применимы → hide controls, не crash

## Out of scope
- Adaptive bitrate / HLS streaming
- Сохранение качества на сервере (только localStorage)
- Форматы кроме MP4
