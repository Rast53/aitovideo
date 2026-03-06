#!/usr/bin/env bash
# watch-agent.sh — Monitor Cursor Agent progress via .cursor/protocols/TASK-N/progress.md
# Sends immediate Telegram notifications on status changes + fallback to pr-notify.md
#
# Usage:
#   ./scripts/watch-agent.sh <TASK_N> <REPO_DIR> [AGENT_PID]
#   ./scripts/watch-agent.sh <TASK_N> <REPO_DIR> [AGENT_PID] --install
#
# Examples:
#   ./scripts/watch-agent.sh 42 /opt/aitovideo 12345 --install
#   ./scripts/watch-agent.sh 42 /opt/aitovideo          --install  (no PID = skip stall check)
#
# Behavior:
#   - Polls progress.md every 30s for status changes and new completed steps
#   - Sends Telegram directly via openclaw agent CLI (instant)
#   - Falls back to pr-notify.md if openclaw unavailable (picked up on next heartbeat)
#   - Detects stall: agent PID alive but no progress.md changes > STALL_TIMEOUT_MIN
#   - Self-destructs cron when terminal status reached (SUCCESS / HALT_* / agent dead)
#
# --install registers this script as a cron job (every 30s via two staggered entries).

set -euo pipefail

TASK_N="${1:-}"
REPO_DIR="${2:-}"
AGENT_PID="${3:-}"
INSTALL="${4:-}"

# If third arg is --install (no PID provided)
if [[ "$AGENT_PID" == "--install" ]]; then
  INSTALL="--install"
  AGENT_PID=""
fi

if [[ -z "$TASK_N" || -z "$REPO_DIR" ]]; then
  echo "Usage: $0 <task_number> <repo_dir> [agent_pid] [--install]"
  exit 1
fi

PROGRESS_FILE="${REPO_DIR}/.cursor/protocols/TASK-${TASK_N}/progress.md"
NOTIFY_FILE="/root/.openclaw/workspace/memory/pr-notify.md"
CRON_TAG="watch-agent-task-${TASK_N}"
STATE_FILE="/tmp/${CRON_TAG}.state"
STALL_TIMEOUT_MIN="${STALL_TIMEOUT_MIN:-10}"
SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"

# ── Install as cron (two entries offset by 30s to approximate 30s polling) ─
if [[ "$INSTALL" == "--install" ]]; then
  PID_ARG="${AGENT_PID:-}"
  CRON_CMD="bash $SCRIPT_PATH $TASK_N $REPO_DIR $PID_ARG"
  CRON_LINE_0="* * * * * $CRON_CMD >> /tmp/${CRON_TAG}.log 2>&1 # ${CRON_TAG}"
  CRON_LINE_30="* * * * * sleep 30 && $CRON_CMD >> /tmp/${CRON_TAG}.log 2>&1 # ${CRON_TAG}"
  (crontab -l 2>/dev/null | grep -v "$CRON_TAG" || true
   echo "$CRON_LINE_0"
   echo "$CRON_LINE_30") | crontab -
  echo "✅ Installed agent watcher for TASK-${TASK_N} (repo: ${REPO_DIR})"
  echo "   Polling every ~30s | Stall timeout: ${STALL_TIMEOUT_MIN} min"
  echo "   Progress file: ${PROGRESS_FILE}"
  echo "   Log: /tmp/${CRON_TAG}.log"
  # Init state file
  if [[ ! -f "$STATE_FILE" ]]; then
    echo "LAST_STATUS=UNKNOWN" > "$STATE_FILE"
    echo "LAST_STEP_COUNT=0"   >> "$STATE_FILE"
    echo "LAST_CHANGE_TS=$(date +%s)" >> "$STATE_FILE"
  fi
  exit 0
fi

# ── Self-destruct helper ────────────────────────────────────────────────────
remove_cron() {
  (crontab -l 2>/dev/null | grep -v "$CRON_TAG" || true) | crontab -
  rm -f "$STATE_FILE"
  echo "[watch-agent] Watcher removed."
}

# ── Dual-channel notify ────────────────────────────────────────────────────
# Primary: direct Telegram via openclaw agent
# Fallback: append to pr-notify.md for heartbeat pickup
notify() {
  local msg="$1"
  local full_msg="🤖 TASK-${TASK_N}: ${msg}"
  local ts
  ts="$(date -u '+%Y-%m-%d %H:%M UTC')"

  # Primary: openclaw direct message
  if command -v openclaw &>/dev/null; then
    openclaw agent \
      --message "$full_msg" \
      --deliver \
      --channel telegram \
      --timeout 15 \
      2>/dev/null && echo "[watch-agent] Notified via Telegram: $msg" && return
  fi

  # Fallback: pr-notify.md
  echo "${ts} | TASK-${TASK_N} | ${msg}" >> "$NOTIFY_FILE"
  echo "[watch-agent] Fallback notify written to pr-notify.md"
}

# ── Load state ──────────────────────────────────────────────────────────────
LAST_STATUS="UNKNOWN"
LAST_STEP_COUNT=0
LAST_CHANGE_TS=$(date +%s)

if [[ -f "$STATE_FILE" ]]; then
  source "$STATE_FILE"
fi

echo "[watch-agent] $(date -u '+%H:%M:%S UTC') Checking TASK-${TASK_N}..."

# ── Progress file missing ──────────────────────────────────────────────────
if [[ ! -f "$PROGRESS_FILE" ]]; then
  echo "[watch-agent] progress.md not found yet at: $PROGRESS_FILE"
  # Don't alarm for first 5 minutes (agent may still be setting up)
  ELAPSED=$(( $(date +%s) - LAST_CHANGE_TS ))
  if [[ "$ELAPSED" -gt 300 ]]; then
    notify "⚠️ progress.md не создан через 5 мин. Агент завис или не стартовал?"
    remove_cron
  fi
  exit 0
fi

# ── Parse progress.md ──────────────────────────────────────────────────────
CURRENT_STATUS=$(grep -oP '## Status:\s*\K\S+' "$PROGRESS_FILE" 2>/dev/null || echo "UNKNOWN")
COMPLETED_STEPS=$(grep -c '^\- \[x\]' "$PROGRESS_FILE" 2>/dev/null || true)
NEXT_STEP=$(grep -A1 '### Next step' "$PROGRESS_FILE" 2>/dev/null | tail -1 | sed 's/^[[:space:]]*//' || echo "")
BLOCKING_Q=$(grep -A2 '### Blocking question' "$PROGRESS_FILE" 2>/dev/null | tail -1 | sed 's/^[[:space:]]*//' || echo "")

echo "[watch-agent] Status: ${CURRENT_STATUS} | Steps done: ${COMPLETED_STEPS} | Last known: ${LAST_STATUS}/${LAST_STEP_COUNT}"

# ── Detect changes ─────────────────────────────────────────────────────────
STATUS_CHANGED=false
STEP_PROGRESSED=false

[[ "$CURRENT_STATUS" != "$LAST_STATUS" ]] && STATUS_CHANGED=true
[[ "$COMPLETED_STEPS" -gt "$LAST_STEP_COUNT" ]] && STEP_PROGRESSED=true

# Update last-change timestamp if something moved
if $STATUS_CHANGED || $STEP_PROGRESSED; then
  LAST_CHANGE_TS=$(date +%s)
fi

# ── Notify on new completed step ───────────────────────────────────────────
if $STEP_PROGRESSED; then
  NEW_STEPS=$(( COMPLETED_STEPS - LAST_STEP_COUNT ))
  NEXT_INFO=""
  [[ -n "$NEXT_STEP" ]] && NEXT_INFO=" → далее: ${NEXT_STEP}"
  notify "✅ +${NEW_STEPS} шаг(а) выполнено (всего ${COMPLETED_STEPS})${NEXT_INFO}"
fi

# ── Terminal states ────────────────────────────────────────────────────────
if $STATUS_CHANGED; then
  case "$CURRENT_STATUS" in
    SUCCESS)
      notify "🎉 Завершено успешно! Все шаги выполнены."
      remove_cron
      exit 0
      ;;
    HALT_BLOCKING)
      Q_INFO=""
      [[ -n "$BLOCKING_Q" ]] && Q_INFO=": ${BLOCKING_Q}"
      notify "🚧 Агент заблокирован${Q_INFO}. Нужно твоё решение."
      remove_cron
      exit 0
      ;;
    HALT_FAILURE)
      notify "💥 Агент завершился с ошибкой. Проверь progress.md и логи."
      remove_cron
      exit 0
      ;;
  esac
fi

# ── Stall detection ────────────────────────────────────────────────────────
NOW=$(date +%s)
ELAPSED_MIN=$(( (NOW - LAST_CHANGE_TS) / 60 ))

if [[ "$ELAPSED_MIN" -ge "$STALL_TIMEOUT_MIN" ]]; then
  # Check if agent process is still alive (if PID known)
  AGENT_ALIVE=false
  if [[ -n "$AGENT_PID" ]] && kill -0 "$AGENT_PID" 2>/dev/null; then
    AGENT_ALIVE=true
  fi

  if $AGENT_ALIVE; then
    notify "⏳ Агент жив (PID ${AGENT_PID}), но нет прогресса уже ${ELAPSED_MIN} мин. Возможный зависон — проверь логи агента."
  else
    # Process dead and no terminal status — likely crashed
    if [[ "$CURRENT_STATUS" != "SUCCESS" && "$CURRENT_STATUS" != "HALT_BLOCKING" && "$CURRENT_STATUS" != "HALT_FAILURE" ]]; then
      notify "💀 Агент завершился (PID ${AGENT_PID:-unknown}) без финального статуса. Статус: ${CURRENT_STATUS}. Проверь git status и progress.md."
    fi
  fi
  remove_cron
  exit 0
fi

# ── Save updated state ─────────────────────────────────────────────────────
{
  echo "LAST_STATUS=${CURRENT_STATUS}"
  echo "LAST_STEP_COUNT=${COMPLETED_STEPS}"
  echo "LAST_CHANGE_TS=${LAST_CHANGE_TS}"
} > "$STATE_FILE"

echo "[watch-agent] Next check in ~30s. No notification needed."
