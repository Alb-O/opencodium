# git-narration

Replaces the built-in `edit` and `write` tools with versions that commit after every change. The agent provides a `description` parameter explaining what it's doing, and that description becomes the commit message.

## Why Atomic Commits

When the agent makes a dozen file changes in one session, the typical workflow produces a single "implement feature X" commit at the end. This loses the reasoning behind individual changes. With git-narration, each edit creates its own commit with a message the agent wrote at decision time. You can `git log` through the session and see what the agent was thinking at each step.

The description parameter also encourages the agent to articulate its intent before making a change.

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

After the file operation succeeds, the plugin stages the file and commits with the description as the message. Commit messages are normalized to lowercase unless they start with a code symbol like `parseConfig` or `API_KEY`.

The `tool.execute.after` hook patches the result metadata so OpenCode displays the relative path and diff.

## Fallback Behavior

The plugin degrades gracefully when git isn't available or configured:

| Situation | Behavior |
|-----------|----------|
| Not in a git repo | Edit/write succeeds, no commit attempted |
| No description provided | Edit/write succeeds, commit skipped |
| Commit fails (e.g., nothing staged) | Edit/write succeeds, error noted in output |

The file operation always completes if possible. Git problems don't block the agent's work.

## Exported API

```typescript
import { 
  GitNarrationPlugin,  // The plugin itself
  editTool,            // The wrapped edit tool
  writeTool,           // The wrapped write tool
  commitFile,          // Stage and commit a single file
  isGitRepo,           // Check if a path is in a git repo
  getGitRoot,          // Get repo root for a path (null if not in repo)
  type CommitResult,   // { committed: boolean; diff: string; error?: string }
} from "./plugins/git-narration";
```
