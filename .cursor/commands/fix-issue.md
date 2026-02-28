Fix GitHub issue. Usage: /fix-issue NUMBER

1. Read AGENTS.md for project context and constraints
2. Run `gh issue view $NUMBER` to understand the issue
3. Create branch: `git checkout -b fix/#$NUMBER-short-description`
4. Find relevant code using grep and semantic search
5. Implement the fix following project patterns
6. Run `./scripts/check.sh` to verify no regressions
7. Commit with message: `fix: description (#$NUMBER)`
8. Push and create PR with `gh pr create --title "[auto] fix: description (#$NUMBER)"`
9. Return the PR URL

Constraints:
- Read .openclaw/CONSTRAINTS.md before making changes
- Do not refactor unrelated code
- If fix touches DB schema or public API — stop and ask for human review
