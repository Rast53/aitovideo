---
# .cursor/WORKFLOW.md — Agent policy for AitoVideo
# Version: 1.0 (2026-03-05)

agent:
  max_turns: 20
  stall_timeout_min: 5        # kill agent if no activity > 5 min
  approval_policy: auto       # auto-approve shell commands in workspace
  branch_pattern: "{type}/#{issue}-{slug}"   # e.g. fix/#45-mini-app-hang
  pr_prefix: "[auto]"
---

# AitoVideo — Agent Prompt Template

## Context (read first)
1. Read `AGENTS.md` — stack, commands, key constraints
2. Read `.openclaw/ARCHITECTURE.md` — module map, patterns, deploy
3. Read `.openclaw/CONSTRAINTS.md` — red lines (DB schema, API format, bot commands)
4. If `.openclaw/BRAND.md` exists and task touches UI — read it too

## Plan
- If `.cursor/plans/issue-{{ issue.id }}.md` exists: follow it step by step
- For M+ tasks without a plan: create `.cursor/plans/issue-{{ issue.id }}.md` first, then implement
- Commit after each completed plan step: `feat: step K of #{{ issue.id }} — description`

## Verification (mandatory before PR)
1. Run `./scripts/check.sh` — must pass with no errors
2. No `console.log` — use pino loggers (`apiLogger`, `botLogger`, `serviceLogger`)
3. No hardcoded secrets — all tokens from `.env`
4. DB changes only via `backend/src/models/migrations/`
5. If task is a retry (attempt >= 1): state what was done in previous attempt and what changed

## Output
- Branch: `{{ branch_pattern }}` (e.g. `fix/#45-mini-app-hang`)
- PR title: `[auto] fix: description (#{{ issue.id }})` or `[auto] feat: ...`
- PR body must include:
  - Closes #{{ issue.id }}
  - Checklist of plan items with file:line references (if plan exists)
  - `./scripts/check.sh` — ✅ passed

## Retry / Continuation
- `attempt: null` — first run, use full prompt above
- `attempt >= 1` — continuation: describe what was done before, continue from where it stopped
  - Do NOT re-read all context from scratch; focus on what remains
  - Check git log for completed steps, then continue

## Constraints (summary — full list in .openclaw/CONSTRAINTS.md)
- ❌ Never drop DB tables/columns without migration
- ❌ Never change `/api/videos` response format without versioning
- ❌ Never use `console.log`
- ❌ Never hardcode tokens/keys
- ✅ Human review required: DB schema changes, deploy config changes, new env vars
