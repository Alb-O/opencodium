# opencodium

A collection of OpenCode plugins and skills. Plugins provide core functionality like worktrees, commit automation, and external directory symlinks. Skills are specialized tools for specific tasks.

## Packages

[**auto-worktree**](packages/auto-worktree/README.md) creates a git worktree per session and silently rewrites all file operation paths to point there. The agent works in an isolated branch; your main working directory stays untouched.

[**git-narration**](packages/git-narration/README.md) replaces the built-in edit and write tools with versions that commit after each change. The agent's description parameter becomes the commit message. Bash commands that modify files also trigger commits, capturing a granular history of every modification.

[**bash-wrapper**](packages/bash-wrapper/README.md) wraps all bash tool invocations using a configurable template. Useful for injecting environment setup, shell wrappers like `nix develop`, or logging around every command the agent runs.

[**dyn-sym**](packages/dyn-sym/README.md) creates a `.sym` directory at the worktree root containing symlinks to external directories. OpenCode's ripgrep-based file discovery follows these symlinks, making external paths visible to the agent without copying files.

[**skills**](packages/skills/README.md) discovers Anthropic-style `SKILL.md` files from config, home, and project directories, then exposes each as a tool that silently injects the skill content into the session.

**shared** provides `loadConfig()`, which searches `.opencode/{filename}` in the project root then falls back to `~/.config/opencode/{filename}`. Other plugins use this for consistent configuration loading.

## Skills

[**affinity-extractor**](skills/affinity-extractor/) extracts data and assets from Affinity v3 (.af) files using specialized scripts.

## Usage

Install from npm:

```bash
npm install @opencodium/auto-worktree
```

Configure OpenCode to load the plugin in your `.opencode/config.json`:

```json
{
  "plugins": ["@opencodium/auto-worktree"]
}
```

Each plugin looks for its own JSON config file (e.g., `auto-worktree.json`, `git-narration.json`) in `.opencode/` or the global config directory.

## Development

```bash
bun install
bun run build
bun run test
```

The monorepo uses bun workspaces. Each package under `packages/` builds independently and publishes to npm under the `@opencodium` scope. Skills under `skills/` are standalone tools for specific use cases.
