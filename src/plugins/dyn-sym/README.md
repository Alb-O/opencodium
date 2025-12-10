# dyn-sym (Dynamic Symlinks Plugin)

Enables OpenCode to discover and search files in external directories by creating symlinks within a managed `.sym` directory in your project root.

## How It Works

1. **On plugin initialization**, creates a `.sym` directory in your project's worktree root
2. **Adds `.sym/` to local git exclude** (`.git/info/exclude`) - keeps `git status` clean
3. **Adds a negation pattern to `.rgignore`** (`!/.sym/`) - makes `.sym` visible to ripgrep despite the git exclude
4. **Symlinks in `.sym/` are followed** by OpenCode's ripgrep (via `--follow` flag)

This allows the AI agent to discover, search, and read files in directories outside your project, such as:
- Shared libraries or SDKs
- Reference implementations
- Documentation repos
- Monorepo sibling packages

## Why `.rgignore`?

Ripgrep has an ignore file hierarchy with different precedence levels. We use `.rgignore` because it has higher precedence than `.ignore` and `.gitignore`, ensuring our negation pattern takes effect.

**Ripgrep ignore precedence (highest to lowest):**
1. `.rgignore` - ripgrep-specific, highest precedence
2. `.ignore` - tool-agnostic ignore
3. `.gitignore` - git ignore
4. `.git/info/exclude` - local git exclude

## Why Two Ignore Files?

OpenCode uses ripgrep for file discovery, which respects both `.git/info/exclude` and `.rgignore` files. We use both:

| File | Purpose |
|------|---------|
| `.git/info/exclude` | Hide `.sym` from `git status` (local-only, not tracked) |
| `.rgignore` | Override the exclusion with `!/.sym/` negation pattern |

This gives us both:
- **Clean `git status`** - `.sym` doesn't show as untracked
- **Full visibility** - ripgrep sees `.sym` contents for tools and `@` mention autocomplete

## Why Add `.rgignore` at Init (Not Per-Tool)?

OpenCode caches the file list at startup for the `@` mention autocomplete feature. This cache is built using ripgrep before any tool calls happen. By adding the `.rgignore` section at plugin init:

- `.sym` files appear in `@` mention suggestions
- `.sym` files are discoverable by all tools (read, grep, glob, list)
- No need for before/after hooks on every tool call

## Usage

### Automatic Initialization

The plugin automatically:
- Creates `.sym/` if it doesn't exist
- Configures git to ignore `.sym/` locally
- Adds `.rgignore` section for ripgrep visibility
- Logs existing symlinks on startup

### Managing Symlinks

Currently, symlinks are managed manually or via external tooling:

```bash
# Add a symlink
ln -s /path/to/external/dir .sym/external-name

# Remove a symlink
rm .sym/external-name

# List symlinks
ls -la .sym/
```

### Programmatic API

The plugin exports functions for managing symlinks programmatically:

```typescript
import { 
  addSymlink, 
  removeSymlink, 
  listSymlinks, 
  clearSymlinks 
} from "./plugins/dyn-sym";

// Add a symlink
const entry = await addSymlink(worktreeRoot, "/path/to/target", "custom-name");

// List all symlinks
const symlinks = await listSymlinks(worktreeRoot);
for (const sym of symlinks) {
  console.log(`${sym.name} -> ${sym.targetPath} (exists: ${sym.targetExists})`);
}

// Remove a symlink
await removeSymlink(worktreeRoot, "custom-name");

// Clear all symlinks
const removed = await clearSymlinks(worktreeRoot);
```

## File Markers

Both `.git/info/exclude` and `.rgignore` use markers to identify plugin-managed content:

```
# dyn-sym plugin (DO NOT EDIT)
!/.sym/
# end dyn-sym
```

User content outside these markers is preserved when adding or removing sections.

## Ripgrep Discovery

OpenCode uses ripgrep with the following relevant flags:

- `--follow` - Follows symbolic links
- `--hidden` - Includes hidden directories (like `.sym`)
- `--glob=!.git/*` - Excludes `.git` directory

Ripgrep also respects (in precedence order):
1. `.rgignore` - Ripgrep-specific, highest precedence (where we negate with `!/.sym/`)
2. `.ignore` - Tool-agnostic ignore
3. `.gitignore` - Standard git ignore
4. `.git/info/exclude` - Local git exclude (where we hide `.sym`)

## Limitations

- **Target must exist** when adding a symlink
- **Broken symlinks** are detected but not auto-cleaned
- **Git worktrees** are supported (`.git` file instead of directory)
- **`.rgignore` persists** for the session (no cleanup on exit)

## Future Enhancements

Potential future features:
- Configuration file for auto-linking paths on init
- OpenCode tool/command for managing symlinks from chat
- Auto-cleanup of broken symlinks
- Relative path support in config
