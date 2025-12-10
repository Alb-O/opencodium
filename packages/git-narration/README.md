# git-narration

Commits after every file change. Replaces `edit` and `write` tools with versions that commit immediately, and hooks into `bash` to commit any files modified by shell commands. The agent's description becomes the commit message.

## Configuration

Create a config file at `.opencode/git-narration.json` (project-local) or `~/.config/opencode/git-narration.json` (global):

```json
{
  "lowercaseMessages": true,
  "strictCommit": false,
  "trackBash": true
}
```

All options are optional. Project-local config takes precedence.

`lowercaseMessages` lowercases the first letter of commit messages unless it's a code symbol like `parseConfig` or `API_KEY`. Defaults to true.

`strictCommit` controls failure behavior. When false (default), file operations succeed even if git isn't available. When true, missing repo or failed commit throws an error.

`trackBash` enables committing file changes made by bash commands. Defaults to true. Set to false to only commit edit/write operations.

## How It Works

### edit/write Tools

The plugin shadows the built-in tools with versions that accept an optional `description` parameter:

```typescript
edit({
  filePath: "/path/to/file.ts",
  oldString: "foo",
  newString: "bar",
  description: "rename foo to bar in parseConfig return type"
})
```

After the file operation, the plugin stages and commits with the description as the message.

### bash Tool

OpenCode's bash tool already requires a `description` parameter. The plugin hooks into bash execution:

1. **Before**: Captures git status (modified, untracked, staged files)
2. **After**: Compares current status to snapshot, commits any new changes

If a bash command creates, modifies, or deletes files, those changes get committed with the command's description. The commit message appears in the tool output:

```
[Committed 3 file(s): install dependencies and generate lockfile]
```

## Fallback Behavior

| Situation | edit/write | bash |
|-----------|------------|------|
| Not in git repo | Succeeds, no commit | Succeeds, no commit |
| No description | Succeeds, skip commit | No snapshot taken |
| Commit fails | Succeeds, error in output | Succeeds, no commit |
| No files changed | N/A | No commit |

With `strictCommit: true`, edit/write throw on missing repo or failed commit. Bash commits remain best-effort.

## Exported API

```typescript
import { 
  GitNarrationPlugin,
  createEditTool,
  createWriteTool,
  captureBeforeBash,
  commitAfterBash,
  clearSnapshot,
  type GitNarrationConfig,
  type CommitResult,
} from "./plugins/git-narration";
```
