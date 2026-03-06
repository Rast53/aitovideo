#!/usr/bin/env bash
# run-agent.sh — запуск Cursor Agent с правильным окружением
# Usage: ./scripts/run-agent.sh "Task description"

set -e

export PATH="$PATH:/root/.local/bin"
export CURSOR_API_KEY=$(grep CURSOR_API_KEY /root/.openclaw/credentials/cursor.env | cut -d'=' -f2)

TASK="${1:-}"
if [ -z "$TASK" ]; then
  echo "Usage: $0 'Task description'"
  exit 1
fi

REPO="Rast53/aitovideo"
STATUS_FILE="/tmp/agent-status.txt"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Agent started: ${TASK:0:80}" > "$STATUS_FILE"
echo "🤖 Запускаю агента..."

agent -p "$TASK" --trust

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Agent finished" >> "$STATUS_FILE"

# Найти открытый PR и поставить watch
PR_NUMBER=$(gh pr list --repo "$REPO" --state open --json number --jq '.[0].number' 2>/dev/null || echo "")
if [ -n "$PR_NUMBER" ] && [ "$PR_NUMBER" != "null" ]; then
  echo "📡 Ставлю watch на PR #${PR_NUMBER}..."
  WATCH_SCRIPT="$(dirname "$0")/watch-pr.sh"
  if [ -f "$WATCH_SCRIPT" ]; then
    "$WATCH_SCRIPT" "$PR_NUMBER" "$REPO" --install
  else
    /root/.openclaw/workspace/scripts/watch-pr.sh "$PR_NUMBER" "$REPO" --install
  fi
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] watch-pr installed for PR #${PR_NUMBER}" >> "$STATUS_FILE"
else
  echo "ℹ️  Открытых PR не найдено, watch не ставлю"
fi

echo "✅ Готово. Статус: $STATUS_FILE"
