# Context: TASK-46 — Player UX fix (no forced fullscreen + back button)

## Issue
https://github.com/Rast53/aitovideo/issues/46

## Problem (from user)
The app is now used on phone, PC (via Telegram), tablet at home AND car tablet — not just the car tablet it was originally designed for.

### YouTube player (all devices)
- Player opens in **forced fullscreen** immediately on mount
- When fullscreen, YouTube's own native controls are shown on top of our UI:
  - Our back button gets hidden behind the Telegram Mini App's close (✕) button
  - The bottom title bar blocks YouTube's progress bar (seek bar)
- When user taps the screen, back button appears for 3 sec but then disappears again → hard to exit player

### RuTube / VK iframes
- Back button appears initially but does NOT reappear on subsequent taps
- Otherwise acceptable — user says don't change the iframes themselves, just fix back button visibility

## Root Cause (identified in code)
`miniapp/src/components/Player.tsx`:

1. **Forced fullscreen** — `useEffect` on mount calls:
   - `window.Telegram.WebApp.requestFullscreen()`
   - `el.requestFullscreen()` (native browser fullscreen)
   - `screen.orientation.lock('landscape')`
   This runs unconditionally for all platforms and devices.

2. **Back button reliability** — `isBackButtonVisible` hides the button after `BACK_BUTTON_HIDE_MS = 3000ms`.
   - The button restores on `handlePlayerInteraction` (pointerdown on container)
   - For iframes (RuTube/VK), touch events inside the iframe don't bubble out → tapping the iframe never triggers `handlePlayerInteraction` → button stays hidden

3. **Back button action** — calls `onClose` → `setSelectedVideo(null)` in App.tsx.
   - Telegram `BackButton` API is NOT used. Telegram's own BackButton (which handles Telegram's back gesture/button) is never set up.
   - This means: on phone, pressing the system/Telegram back gesture closes the whole Mini App instead of going back to the list.

## Constraints
- Do NOT change iframe src URLs or embed logic for RuTube/VK
- Keep zoom (pinch-to-zoom) working
- Keep resume-from-position modal working
- Keep progress save logic working
- No console.log — use logger if needed (but Player is frontend, so minimal logging)
- No hardcoded secrets

## Files to touch
- `miniapp/src/components/Player.tsx` — main changes
- `miniapp/src/components/Player.css` — minor layout adjustments if needed
- `miniapp/src/App.tsx` — Telegram BackButton setup when player is open

## Architecture note
Player is a full-screen overlay (`.player-overlay` fixed inset:0). 
YouTube uses `<video>` tag with our backend proxy stream.
RuTube/VK use `<iframe>` embeds.
