#!/usr/bin/env bash
# run-agent.sh — запуск Cursor Agent в headless режиме (--print)
#
# Usage: ./scripts/run-agent.sh "Task description" [branch-name]
#
# Output: читается через process(log) в OpenClaw — вывод в реальном времени
# Log:    /tmp/agent-aitovideo.log (дублируется для истории)
#
# Режим:  --print (headless, stdout) + --worktree (изолированный worktree)
#         Агент работает в ~/.cursor/worktrees/aitovideo/<branch>,
#         не трогает master. По завершении — коммит и PR.

set -e

export PATH="$PATH:/root/.local/bin"
export CURSOR_API_KEY=$(grep CURSOR_API_KEY /root/.openclaw/credentials/cursor.env | cut -d'=' -f2)

TASK="${1:-}"
BRANCH="${2:-}"

if [ -z "$TASK" ]; then
  echo "Usage: $0 'Task description' [branch-name]"
  exit 1
fi

REPO="Rast53/aitovideo"
LOG_FILE="/tmp/agent-aitovideo.log"
STATUS_FILE="/tmp/agent-status.txt"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Agent started: ${TASK:0:80}" > "$STATUS_FILE"
echo "🤖 Запускаю агента (headless --print mode)..."
echo "   Лог: $LOG_FILE"

# Формируем аргументы worktree
WORKTREE_ARGS=""
if [ -n "$BRANCH" ]; then
  WORKTREE_ARGS="--worktree $BRANCH --worktree-base master"
fi

# Запуск: --print даёт stdout, tee дублирует в файл
agent --trust --print $WORKTREE_ARGS -p "$TASK" 2>&1 | tee "$LOG_FILE"

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

echo "✅ Готово. Лог: $LOG_FILE"
