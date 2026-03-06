# Plan: TASK-46 — Player UX fix

## Overview
Three focused changes to `Player.tsx` (and minor `App.tsx`). No architectural changes.

---

## Step 1: Remove forced fullscreen on mount

**File:** `miniapp/src/components/Player.tsx`

Remove the `useEffect` that calls:
- `window.Telegram.WebApp.requestFullscreen()`
- `el.requestFullscreen()` / `el.webkitRequestFullscreen()`
- `screen.orientation.lock('landscape')`

And the cleanup that calls:
- `window.Telegram.WebApp.exitFullscreen()`
- `document.exitFullscreen()`
- `screen.orientation.unlock()`

**Result:** Player opens inline (non-fullscreen) by default. User sees the video within the Mini App boundaries, with our own controls visible. YouTube native controls still appear when user taps the video element — this is fine and expected.

**Acceptance:** Open player → no fullscreen, video fills container, our back button and title bar are visible.

---

## Step 2: Fix back button visibility for iframes (RuTube/VK)

**File:** `miniapp/src/components/Player.tsx`

**Problem:** iframe touch events don't bubble, so `handlePlayerInteraction` (which shows back button) never fires when user taps inside iframe.

**Solution:** Add a transparent overlay `div` above the iframe that captures the first tap, shows the back button, then hides itself to pass subsequent touches through.

Implementation approach:
- Add state: `const [iframeOverlayActive, setIframeOverlayActive] = useState(true)`
- When iframe is rendered (not YouTube), render a transparent absolute-positioned div on top with `pointer-events: all`
- On click/tap of this overlay: call `handlePlayerInteraction()`, then `setIframeOverlayActive(false)` to hide the overlay and allow real interaction with the iframe
- When `isBackButtonVisible` becomes false (after 3s timeout): reset `iframeOverlayActive` back to `true` so next tap will show the button again

**Alternative simpler approach:** Instead of a toggle overlay, just ALWAYS show the back button for iframe platforms (RuTube/VK). Since we're no longer in fullscreen mode, the button won't be hidden behind Telegram's ✕. Make `isBackButtonVisible` always `true` when platform is rutube/vk.

**Use the simpler approach** — always-visible back button for iframes. The hide timer (`BACK_BUTTON_HIDE_MS`) only applies to YouTube native video.

**Acceptance:** Open RuTube or VK video → back button always visible in top-left. Can return to list.

---

## Step 3: Wire up Telegram BackButton API

**Files:** `miniapp/src/App.tsx` and/or `miniapp/src/components/Player.tsx`

Telegram Mini App has a native `BackButton` that handles the device back gesture / Telegram's in-app back action. Currently it's not used.

**Implementation in `App.tsx`:**
```typescript
// When player opens:
useEffect(() => {
  if (!selectedVideo) return;
  const tg = window.Telegram?.WebApp;
  if (!tg?.BackButton) return;
  
  tg.BackButton.show();
  const handler = () => { setSelectedVideo(null); };
  tg.BackButton.onClick(handler);
  
  return () => {
    tg.BackButton.offClick(handler);
    tg.BackButton.hide();
  };
}, [selectedVideo]);
```

This means:
- When player is open: Telegram shows a native back button / handles back gesture → calls `setSelectedVideo(null)` → closes player, returns to list
- When player is closed: Telegram back button is hidden → back gesture closes Mini App (default behavior)

**Acceptance:** Open player → press Telegram back (swipe or button) → returns to video list (not closes Mini App).

---

## Step 4: Verify & cleanup

- Run `./scripts/check.sh` — must pass typecheck
- Verify no `console.log` added
- Verify zoom (pinch) still works (we didn't touch that logic)
- Verify resume modal still works (we didn't touch that logic)

---

## Acceptance Criteria (from issue #46)
- [ ] Video does NOT open in fullscreen by default
- [ ] User can enter fullscreen manually (YouTube controls have their own fullscreen button)
- [ ] Back button is visible and functional on all devices/platforms
- [ ] Pressing Telegram back gesture returns to video list, not closes Mini App
- [ ] Safe area / Telegram UI elements don't obscure player controls (fixed by removing forced fullscreen)
- [ ] RuTube / VK: back button visible without needing to tap (always shown)
- [ ] `./scripts/check.sh` passes
