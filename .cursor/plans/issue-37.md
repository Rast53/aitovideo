# Plan: Tabs — Videos / Watched / Subscriptions (Issue #37)

## Goal
Add tab navigation above the video list:
- **Видео** — unwatched videos (current default behavior)
- **Просмотрено** — videos with `is_watched = true`
- **Подписки** — placeholder tab (stub, feature TBD)

Switching watched state on a card moves it between tabs immediately.

## UI Layout
```
┌─────────────────────────────────┐
│  Видео        [user name]       │  ← app-header (existing)
├─────────────────────────────────┤
│  [Видео]  [Просмотрено]  [Подписки] │  ← NEW: tab bar
├─────────────────────────────────┤
│  VideoList (filtered by tab)    │
└─────────────────────────────────┘
```

## Steps

### Step 1 — Backend: split videos endpoint OR filter on frontend
Decision: **filter on frontend** — all videos already loaded, just filter by `is_watched`.
No backend changes needed for tabs themselves.

### Step 2 — Frontend: TabBar component
New file: `miniapp/src/components/TabBar.tsx` + `TabBar.css`

```typescript
type Tab = 'videos' | 'watched' | 'subscriptions';

interface TabBarProps {
  activeTab: Tab;
  onChange: (tab: Tab) => void;
}
```

Style per BRAND.md:
- Full-width row, sticky below header (z-index: 90)
- Background: `var(--tg-theme-bg-color)`
- Border-bottom: `1px solid var(--tg-theme-secondary-bg-color)`
- Tab item: `flex: 1`, centered text, `14px / font-weight 500`
- Active tab: `var(--tg-theme-button-color)` text + 2px bottom border indicator
- Inactive: `var(--tg-theme-hint-color)`
- Active state: `opacity: 0.8`, transition 0.15s
- No icons — text only

Commit: `feat: step 2 of #37 — TabBar component`

### Step 3 — App.tsx: add tab state + filtering
File: `miniapp/src/App.tsx`

```typescript
const [activeTab, setActiveTab] = useState<Tab>('videos');

const visibleVideos = useMemo(() => {
  if (activeTab === 'videos') return videos.filter(v => !v.is_watched);
  if (activeTab === 'watched') return videos.filter(v => v.is_watched);
  return []; // subscriptions — empty stub
}, [videos, activeTab]);
```

- Insert `<TabBar activeTab={activeTab} onChange={setActiveTab} />` between header and main content
- Pass `visibleVideos` (not `videos`) to VideoList

Commit: `feat: step 3 of #37 — tab state and filtering in App.tsx`

### Step 4 — Watched tab: move video on toggle
When user taps "Просмотрено" on a card:
- `handleMarkWatched` already updates `video.is_watched` in state
- Because `visibleVideos` is derived from `videos` via filter, the card **automatically disappears** from current tab and appears in the other
- No extra logic needed — works via useMemo reactivity

Verify this works correctly.

Commit: `feat: step 4 of #37 — verify watched toggle moves cards between tabs`
(May be a docs/comment commit if no code changes needed)

### Step 5 — Subscriptions tab: stub
When `activeTab === 'subscriptions'`:
- Empty state with message: «Подписки появятся здесь» + icon 🔔
- Reuse existing `.video-list-empty` style from VideoList.css

Handle in VideoList.tsx OR App.tsx — agent decides cleanest approach.

Commit: `feat: step 5 of #37 — subscriptions stub empty state`

### Step 6 — Verification
```bash
./scripts/check.sh  # must pass
```

## Files touched
- `miniapp/src/components/TabBar.tsx` — NEW
- `miniapp/src/components/TabBar.css` — NEW
- `miniapp/src/App.tsx` — add tab state, filter, render TabBar
- `miniapp/src/App.css` — minor layout if needed
- `miniapp/src/components/VideoList.tsx` — subscriptions empty state (optional)

## Constraints
- Follow `.openclaw/BRAND.md` for all styles
- No backend changes
- No changes to `VideoCard.tsx`, `Player.tsx`
- TypeScript strict — no `any`, no `// @ts-ignore`
- `./scripts/check.sh` must pass

## Acceptance criteria
- [ ] Tab bar visible, sticky below header
- [ ] "Видео" tab: shows only `is_watched = false` videos
- [ ] "Просмотрено" tab: shows only `is_watched = true` videos
- [ ] Marking video as watched → card moves from "Видео" to "Просмотрено" instantly
- [ ] Unmarking → card moves back to "Видео"
- [ ] "Подписки" tab: shows empty state with message
- [ ] Active tab highlighted with button-color
- [ ] check.sh passes
