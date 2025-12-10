# auto-worktree

Creates a git worktree for each OpenCode session and rewrites all file operation paths to point there. Every tool call that touches the filesystem gets silently redirected, so the agent works in an isolated branch without modifying your main working directory.

```json
{
  "baseDir": ".opencode",
  "worktreesDir": "worktrees"
}
```

The worktree lands at `.opencode/worktrees/<name>-<hash>/` where the name and hash derive deterministically from the session ID. A SHA-256 hash of the session ID seeds faker to generate a human-readable middle name (e.g., "reagan", "quinn"), producing branches like `auto-worktree/reagan-5ee954b6`.

On the first tool call of a session, the plugin creates the branch if it doesn't exist, adds the worktree, and writes a `.gitignore` containing `*` to the worktrees directory so git ignores all nested worktree contents. Subsequent tool calls in the same session skip this setup.

Path rewriting covers read, write, edit, glob, grep, list, and bash. For file tools, absolute paths within the project root become relative paths under the worktree; paths outside the root pass through unchanged. For bash, the plugin sets `workdir` to the worktree equivalent and wraps the command in `cd <worktree> && (...)` as a belt-and-suspenders measure.

The plugin does nothing outside git repositories. If `isGitRepo()` returns false during initialization, it returns an empty hook set and all tool calls proceed normally.

After the session ends, the worktree persists on disk. You can inspect the agent's changes, merge them, or delete them with `git worktree remove`. The branch remains available for cherry-picking or rebasing into your main branch.
