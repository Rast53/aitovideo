# Plan: Retrofit aitovideo — AI-Native Infrastructure

Date: 2026-02-28
Author: PM (OpenClaw)

## Context

Already present in repo:
- `.openclaw/` — ARCHITECTURE, CONSTRAINTS, DECISIONS
- `.cursor/rules/` — project-context.mdc, debug-workflow.mdc, context-sync.mdc
- `.cursor/agents/` — debug-fixer.md, verifier.md
- `scripts/` — check, build, deploy, health, logs
- `DEBUG.md` — verified 2026-02-26
- `.env.example`

Missing by new standard:
- `AGENTS.md` in repo root (Progressive Disclosure Level 1)
- `.cursor/hooks.json` + hook scripts
- `.cursor/commands/` — pr.md, fix-issue.md, deploy.md
- `.cursor/plans/` directory (this file creates it)
- `.cursor/rules/cleanup-refactor.mdc`

## Steps

### Step 1: Create AGENTS.md (repo root)
- Compact (≤50 lines), Progressive Disclosure Level 1
- Sections: What is this, Stack, Commands, Constraints summary, pointer to .openclaw/
- Acceptance: any agent understands project in 30 seconds

### Step 2: Create .cursor/rules/cleanup-refactor.mdc
- Copy from: skills/project-manager/cursor-rules-base/cleanup-refactor.mdc
- No project-specific changes
- frontmatter: alwaysApply: false

### Step 3: Create .cursor/hooks.json + hook scripts
- hooks.json: afterShellExecution → check-result.sh, stop → grind.sh
- .cursor/hooks/check-result.sh (from hooks-templates)
- .cursor/hooks/grind.sh (from hooks-templates)
- Scripts must be executable (chmod +x)

### Step 4: Create .cursor/commands/
- pr.md, fix-issue.md, deploy.md from commands-templates
- No project-specific changes

### Step 5: Verify and commit
- ./scripts/check.sh must still pass
- git commit: "docs: retrofit AI-native infrastructure (hooks, commands, AGENTS.md)"
- PR: [auto] docs: retrofit AI-native infrastructure

## Risks
- AGENTS.md must NOT duplicate .openclaw/ — summary + pointer only
- Additive only — no existing files modified

## Acceptance Criteria
- [ ] AGENTS.md at repo root, ≤50 lines
- [ ] .cursor/hooks.json with both hooks
- [ ] .cursor/hooks/check-result.sh + grind.sh executable
- [ ] .cursor/commands/ with pr.md, fix-issue.md, deploy.md
- [ ] .cursor/rules/cleanup-refactor.mdc
- [ ] .cursor/plans/ exists
- [ ] ./scripts/check.sh passes
