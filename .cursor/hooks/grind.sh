#!/usr/bin/env bash
# grind.sh — Cursor stop hook
# Continues agent loop if scratchpad doesn't contain DONE marker.
# Input: JSON from stdin with { conversation_id, status, loop_count }
# Output: JSON with optional followup_message to continue the loop.
#
# Place in: .cursor/hooks/grind.sh
# Configure in: .cursor/hooks.json under "stop" event

set -euo pipefail

INPUT=$(cat)
STATUS=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null || echo "")
LOOP_COUNT=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('loop_count',0))" 2>/dev/null || echo "0")

MAX_ITERATIONS=${MAX_ITERATIONS:-5}

# Don't continue if aborted, errored, or max iterations reached
if [ "$STATUS" != "completed" ] || [ "$LOOP_COUNT" -ge "$MAX_ITERATIONS" ]; then
  echo '{}'
  exit 0
fi

# Check scratchpad for DONE marker
SCRATCHPAD=".cursor/scratchpad.md"
if [ -f "$SCRATCHPAD" ] && grep -q "DONE" "$SCRATCHPAD"; then
  echo '{}'
  exit 0
fi

# Continue the loop
cat <<EOF
{"followup_message": "[Iteration $((LOOP_COUNT + 1))/$MAX_ITERATIONS] Goal not yet reached. Review .cursor/scratchpad.md for current state. Continue working. Write DONE in scratchpad when complete."}
EOF
