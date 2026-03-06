#!/usr/bin/env bash
# watch-pr.sh — Monitor PR CI and auto-merge on success.
# Usage: ./scripts/watch-pr.sh <PR_NUMBER> [REPO]
# Example: ./scripts/watch-pr.sh 25 Rast53/aitovideo
#
# Runs as a one-shot cron job every 2 minutes.
# On CI pass → auto-merges → notifies via openclaw → self-destructs cron.
# On CI fail → notifies via openclaw → self-destructs cron.
#
# Setup (called automatically by PM after agent launch):
#   ./scripts/watch-pr.sh 25 Rast53/aitovideo --install
#   → installs itself as cron job every 2 min

set -euo pipefail

PR_NUMBER="${1:-}"
REPO="${2:-}"
INSTALL="${3:-}"

if [[ -z "$PR_NUMBER" || -z "$REPO" ]]; then
  echo "Usage: $0 <pr_number> <owner/repo> [--install]"
  exit 1
fi

SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
CRON_TAG="watch-pr-${REPO//\//-}-${PR_NUMBER}"
LOG_FILE="/tmp/${CRON_TAG}.log"

# ── Install as cron job ────────────────────────────────────────────────────
if [[ "$INSTALL" == "--install" ]]; then
  CRON_LINE="*/2 * * * * bash $SCRIPT_PATH $PR_NUMBER $REPO >> $LOG_FILE 2>&1 # $CRON_TAG"
  # Remove old entry for same PR if exists
  (crontab -l 2>/dev/null | grep -v "$CRON_TAG" || true; echo "$CRON_LINE") | crontab -
  echo "✅ Installed cron watcher for PR #${PR_NUMBER} (${REPO}). Checking every 2 min."
  echo "   Log: $LOG_FILE"
  exit 0
fi

# ── Self-destruct helper ───────────────────────────────────────────────────
remove_cron() {
  (crontab -l 2>/dev/null | grep -v "$CRON_TAG" || true) | crontab -
  echo "[watch-pr] Cron job removed."
}

# ── Notify OpenClaw (writes to a file that OpenClaw heartbeat picks up) ───
notify() {
  local msg="$1"
  local notify_file="/root/.openclaw/workspace/memory/pr-notify.md"
  echo "$(date -u '+%Y-%m-%d %H:%M UTC') | PR #${PR_NUMBER} | ${REPO} | ${msg}" >> "$notify_file"
}

# ── Check PR state ────────────────────────────────────────────────────────
echo "[watch-pr] $(date -u '+%H:%M:%S UTC') Checking PR #${PR_NUMBER} in ${REPO}..."

# Is PR still open?
PR_STATE=$(gh pr view "$PR_NUMBER" --repo "$REPO" --json state -q '.state' 2>/dev/null || echo "UNKNOWN")

if [[ "$PR_STATE" == "MERGED" ]]; then
  echo "[watch-pr] PR #${PR_NUMBER} already merged. Removing watcher."
  remove_cron
  exit 0
fi

if [[ "$PR_STATE" == "CLOSED" ]]; then
  echo "[watch-pr] PR #${PR_NUMBER} closed without merge. Removing watcher."
  notify "❌ PR закрыт без мержа"
  remove_cron
  exit 0
fi

# Check CI
CHECKS_OUTPUT=$(gh pr checks "$PR_NUMBER" --repo "$REPO" 2>&1 || true)
echo "$CHECKS_OUTPUT"

# Count statuses
PENDING=$(echo "$CHECKS_OUTPUT" | grep -c "pending\|in_progress\|queued" || true)
FAILED=$(echo "$CHECKS_OUTPUT"  | grep -c "^.*fail" || true)
PASSED=$(echo "$CHECKS_OUTPUT"  | grep -c "^.*pass" || true)

if [[ "$PENDING" -gt 0 ]]; then
  echo "[watch-pr] CI still running ($PENDING pending). Will check again in 2 min."
  exit 0
fi

if [[ "$FAILED" -gt 0 ]]; then
  echo "[watch-pr] ❌ CI FAILED ($FAILED checks). Notifying PM."
  notify "❌ CI упал ($FAILED проверок). Нужен фикс."
  remove_cron
  exit 0
fi

if [[ "$PASSED" -gt 0 ]]; then
  echo "[watch-pr] ✅ All CI checks passed. Auto-merging PR #${PR_NUMBER}..."

  PR_TITLE=$(gh pr view "$PR_NUMBER" --repo "$REPO" --json title -q '.title' 2>/dev/null || echo "PR #${PR_NUMBER}")

  gh pr merge "$PR_NUMBER" --repo "$REPO" --squash \
    --subject "${PR_TITLE}" \
    --delete-branch 2>&1 || {
    echo "[watch-pr] Merge failed. Notifying PM."
    notify "⚠️ CI зелёный, но мерж упал. Проверь вручную."
    remove_cron
    exit 1
  }

  echo "[watch-pr] ✅ Merged! Notifying PM."
  notify "✅ Смержено: ${PR_TITLE}"
  remove_cron
  exit 0
fi

echo "[watch-pr] No conclusive status yet. Will retry."
