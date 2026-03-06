# Progress: TASK-46

## Status: SUCCESS

## Steps
- [x] Step 1: Remove forced fullscreen on mount (Player.tsx)
- [x] Step 2: Fix back button for iframes — always visible for RuTube/VK
- [x] Step 3: Wire up Telegram BackButton API (App.tsx)
- [x] Step 4: check.sh passed, commit 1bb78d5, PR #68 created

## Completed steps
- Step 1: Removed fullscreen useEffect and unused types (ExtendedDocument, ExtendedHTMLElement, ExtendedScreenOrientation)
- Step 2: Added `isIframePlatform` check — `restartBackButtonHideTimer()` returns early for rutube/vk, keeping back button always visible
- Step 3: Added BackButton type to telegram-webapp.d.ts, added useEffect in App.tsx with show/hide + onClick/offClick
- Step 4: check.sh passed, committed on fix/#46-player-ux, PR #68 opened

## PR
https://github.com/Rast53/aitovideo/pull/68
