#!/usr/bin/env bash
# check-result.sh — Cursor afterShellExecution hook
# Analyzes shell command output for common errors and provides hints.
# Input: JSON from stdin with { command, stdout, stderr, exit_code }
# Output: JSON with optional followup_message containing hints.
#
# Place in: .cursor/hooks/check-result.sh
# Configure in: .cursor/hooks.json under "afterShellExecution" event

set -euo pipefail

INPUT=$(cat)
EXIT_CODE=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('exit_code',0))" 2>/dev/null || echo "0")
STDERR=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('stderr',''))" 2>/dev/null || echo "")

# Only act on failures
if [ "$EXIT_CODE" = "0" ]; then
  echo '{}'
  exit 0
fi

HINTS=""

# Common error patterns
if echo "$STDERR" | grep -qi "ENOENT\|not found\|No such file"; then
  HINTS="$HINTS\n- Missing file or command. Check paths and that dependencies are installed."
fi

if echo "$STDERR" | grep -qi "EADDRINUSE\|address already in use"; then
  HINTS="$HINTS\n- Port already in use. Kill the process: lsof -ti:PORT | xargs kill"
fi

if echo "$STDERR" | grep -qi "ECONNREFUSED\|connection refused"; then
  HINTS="$HINTS\n- Connection refused. Is the target service running? Check with ./scripts/health.sh"
fi

if echo "$STDERR" | grep -qi "permission denied\|EACCES"; then
  HINTS="$HINTS\n- Permission denied. Check file permissions or run with appropriate privileges."
fi

if echo "$STDERR" | grep -qi "Cannot find module\|MODULE_NOT_FOUND"; then
  HINTS="$HINTS\n- Missing module. Run 'npm ci' or 'npm install' to restore dependencies."
fi

if [ -n "$HINTS" ]; then
  # Escape for JSON
  HINTS_ESCAPED=$(echo -e "$HINTS" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo '""')
  echo "{\"followup_message\": \"Shell command failed (exit $EXIT_CODE). Hints: $HINTS\"}"
else
  echo '{}'
fi
