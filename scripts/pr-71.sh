#!/usr/bin/env bash
# Run this script to complete PR #71 workflow (branch, check, commit, push, PR)
# Usage: chmod +x scripts/pr-71.sh && ./scripts/pr-71.sh
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

echo "=== Step 1: Create branch feat/#71-unified-player ==="
git checkout -b "feat/#71-unified-player"

echo ""
echo "=== Step 2: Install npm dependencies ==="
cd "$ROOT/backend" && npm install
cd "$ROOT/miniapp" && npm install

echo ""
echo "=== Step 3: Type-check ==="
cd "$ROOT" && ./scripts/check.sh

echo ""
echo "=== Step 4: Stage and commit ==="
cd "$ROOT"
git add -A
git commit -m "feat: unified native player + HLS streaming + smart source icons

- Add /api/stream/:platform/:id endpoint with yt-dlp HLS proxy for rutube/vk
- Replace iframe with native video + hls.js for all platforms
- Smart source selection: prefer rutube > vk > youtube by availability score
- Add dual-icon platform badge on VideoCard (YT+RU, YT+VK etc.)
- Remove clickable alt-source buttons from card
- Keep seek, resume, progress tracking working

Closes #71"

echo ""
echo "=== Step 5: Push branch ==="
git push -u origin "feat/#71-unified-player"

echo ""
echo "=== Step 6: Create PR ==="
gh pr create \
  --title "[auto] feat: unified native player + HLS streaming + smart source icons" \
  --body "## Summary
- Backend: added /api/stream/:platform/:id endpoint — yt-dlp resolves direct/HLS URLs, proxies through backend (SSRF-safe allowlist)
- Frontend Player: removed iframe, native <video> + hls.js for HLS streams, smart source selection (rutube > vk > youtube)
- Frontend VideoCard: dual-icon platform badge, removed clickable alt buttons
- Progress tracking (seek, resume, periodic save) preserved

## Test plan
- [ ] Open mini app, play a YouTube video — should use native player
- [ ] Play a Rutube video — should stream via HLS proxy
- [ ] Play a VK video — should stream via HLS proxy
- [ ] Verify seek/resume works across all platforms
- [ ] Check dual-icon badge shows correctly for videos with alternatives
- [ ] Verify back button and zoom still work

Closes #71"

echo ""
echo "=== Done. PR URL should appear above. ==="
