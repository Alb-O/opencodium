# dyn-sym

Makes external directories visible to OpenCode by symlinking them into a `.sym` directory at your project root. OpenCode's file discovery runs ripgrep at startup to populate `@` mention autocomplete, so any symlinked paths appear alongside your normal project files.

## The Ignore File Dance

Getting `.sym` visible to ripgrep while hidden from git requires two ignore files working against each other.

First, `.git/info/exclude` hides `.sym` from git so it never shows as untracked. But ripgrep respects git excludes, so `.sym` would be invisible to file discovery too. The fix is `.rgignore` with a negation pattern `!/.sym/`. Ripgrep checks `.rgignore` before `.git/info/exclude`, so the negation wins.

Both files use markers to preserve user content:

```
# dyn-sym plugin (DO NOT EDIT)
!/.sym/
# end dyn-sym
```

The plugin writes these at init because OpenCode caches the file list before any tool calls run.

## Adding Symlinks

```bash
ln -s /path/to/external/code .sym/my-lib
```

Or programmatically:

```typescript
import { addSymlink, listSymlinks, removeSymlink } from "./plugins/dyn-sym";

await addSymlink(worktreeRoot, "/path/to/target", "my-lib");

for (const sym of await listSymlinks(worktreeRoot)) {
  console.log(`${sym.name} -> ${sym.targetPath}`);
}

await removeSymlink(worktreeRoot, "my-lib");
```

The target must exist when adding. Broken symlinks are detected by `listSymlinks` (check `sym.targetExists`) but not auto-cleaned.

## Why This Works

OpenCode invokes ripgrep with `--follow --hidden --glob=!.git/*`. The `--follow` flag traverses symlinks, so anything in `.sym` is discoverable. The `--hidden` flag includes dotfile directories. Combined with the `.rgignore` negation overriding the git exclude, symlinked content appears in searches and file listings.

Git worktrees work correctly since the plugin checks for both `.git` directories and `.git` files (worktrees use a file pointing to the real git dir).
