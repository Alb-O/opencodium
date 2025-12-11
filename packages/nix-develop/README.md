# @opencodium/nix-develop

An OpenCode plugin that automatically activates nix flakes when `.nix` files are written or edited.

## Features

- **Auto-activation**: When the agent writes or edits any `.nix` file, the plugin finds the nearest `flake.nix` and runs `nix develop` to activate/cache the devShell
- **Parent directory search**: Finds `flake.nix` up the directory tree, so editing `nix/modules/dev.nix` activates the root flake

## Installation

Add to your `.opencode/plugin/index.ts`:

```typescript
export { default } from "@opencodium/nix-develop";
```

## Configuration

Add to your `.opencode/nix-develop.json`:

```json
{
  "enabled": true,
  "devShell": "default"
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable the plugin |
| `devShell` | string | `undefined` | Specific devShell to use (e.g., `"dev"`, `"ci"`) |

## Command Wrapping

For wrapping bash commands with `nix develop`, use `@opencodium/bash-wrapper` with this config in `.opencode/bash-wrapper.json`:

```json
{
  "templates": [
    {
      "template": "nix develop -c bash -c \"${command:escape}\"",
      "when": { "file": "flake.nix" },
      "exclude": ["nix", "git", "ls", "cd", "pwd", "echo", "cat"]
    }
  ]
}
```

This separates concerns:
- **nix-develop**: Handles flake activation on file changes
- **bash-wrapper**: Handles command wrapping

## How It Works

1. Agent writes/edits a `.nix` file (e.g., `flake.nix`, `shell.nix`, `nix/modules/dev.nix`)
2. Plugin detects the file change via `tool.execute.after` hook
3. Searches up directory tree for nearest `flake.nix`
4. Runs `nix develop --command true` to activate/build the devShell
5. Appends activation status to tool output

## Example Output

```
File written successfully.

[Flake activated: /home/user/project]
```

Or on failure:

```
File written successfully.

[Flake activation failed: error: flake 'path:/home/user/project' does not provide attribute...]
```
