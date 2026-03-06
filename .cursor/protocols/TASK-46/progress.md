# Progress: TASK-46

## Status: IN_PROGRESS

## Steps
- [x] Step 1: Remove forced fullscreen on mount (Player.tsx)
- [x] Step 2: Fix back button for iframes — always visible for RuTube/VK
- [x] Step 3: Wire up Telegram BackButton API (App.tsx)
- [ ] Step 4: check.sh + cleanup + commit + branch + PR

## Completed steps
- Step 1: Removed fullscreen useEffect and unused types (ExtendedDocument, ExtendedHTMLElement, ExtendedScreenOrientation)
- Step 2: Added `isIframePlatform` check — `restartBackButtonHideTimer()` returns early for rutube/vk, keeping back button always visible
- Step 3: Added BackButton type to telegram-webapp.d.ts, added useEffect in App.tsx with show/hide + onClick/offClick

## Next step
Step 4: Run check.sh, commit, create branch, push, create PR

## Blocked
Shell/git commands are restricted in current session. User needs to run commands manually.
