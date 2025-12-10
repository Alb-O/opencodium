# git-narration

Replaces the built-in `edit` and `write` tools with versions that commit after every change. The agent provides a `description` parameter explaining what it's doing, and that description becomes the commit message.

## Configuration

Create a config file at `.opencode/git-narration.json` (project-local) or `~/.config/opencode/git-narration.json` (global):

```json
{
  "lowercaseMessages": true,
  "strictCommit": false
}
```

Both options are optional. Project-local config takes precedence over global.

`lowercaseMessages` controls whether commit messages get their first letter lowercased (unless it's a code symbol like `parseConfig` or `API_KEY`). Defaults to true for conventional commit style.

`strictCommit` controls failure behavior. When false (the default), edit/write operations succeed even if git isn't available or the commit fails. When true, missing repo or failed commit throws an error and the file operation is aborted.

## Why Atomic Commits

When the agent makes a dozen file changes in one session, the typical workflow produces a single "implement feature X" commit at the end. This loses the reasoning behind individual changes. With git-narration, each edit creates its own commit with a message the agent wrote at decision time. You can `git log` through the session and see what the agent was thinking at each step.

## How It Works

The plugin exports `edit` and `write` tools that shadow the built-in ones. Both accept an optional `description` argument:

```typescript
edit({
  filePath: "/path/to/file.ts",
  oldString: "foo",
  newString: "bar",
  description: "rename foo to bar for clarity in parseConfig return type"
})
```

After the file operation succeeds, the plugin stages the file and commits with the description as the message. The `tool.execute.after` hook patches the result metadata so OpenCode displays the relative path and diff.

## Fallback Behavior (strictCommit: false)

| Situation | Behavior |
|-----------|----------|
| Not in a git repo | Edit/write succeeds, no commit attempted |
| No description provided | Edit/write succeeds, commit skipped |
| Commit fails | Edit/write succeeds, error noted in output |

## Strict Mode (strictCommit: true)

| Situation | Behavior |
|-----------|----------|
| Not in a git repo | Error thrown, file not modified |
| No description provided | Edit/write succeeds, commit skipped |
| Commit fails | Error thrown (file already written) |

## Exported API

```typescript
import { 
  GitNarrationPlugin,     // The plugin itself
  createEditTool,         // Factory for edit tool with custom config
  createWriteTool,        // Factory for write tool with custom config
  editTool,               // Edit tool with default config
  writeTool,              // Write tool with default config
  commitFile,             // Stage and commit a single file
  isGitRepo,              // Check if a path is in a git repo
  getGitRoot,             // Get repo root (null if not in repo)
  type GitNarrationConfig,
  type CommitResult,
} from "./plugins/git-narration";
```
