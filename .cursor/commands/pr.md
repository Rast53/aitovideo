Create a pull request for the current changes.

1. Run `git diff` to see staged and unstaged changes
2. Run `git log --oneline -5` to see recent commit style
3. Write a clear commit message following the project's conventional commits style (feat:, fix:, docs:, etc.)
4. Commit all changes and push to the current branch
5. Use `gh pr create` with a descriptive title and body
6. Return the PR URL when done

If there are no changes to commit, say so and stop.
