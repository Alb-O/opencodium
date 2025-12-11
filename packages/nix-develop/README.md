# @opencodium/nix-develop

An OpenCode plugin that automatically wraps bash commands in `nix develop` when a `flake.nix` is present in the working directory.

## How it works

When enabled, this plugin intercepts bash tool calls and:

1. Checks if `flake.nix` exists in the command's working directory
2. If so, wraps the command with `nix develop -c bash -c "..."`
3. Excludes certain commands (like `git`, `nix`, `ls`) that don't need the nix environment

This means the agent can simply run commands normally, and they'll automatically execute within the nix develop shell environment.

## Configuration

Add to your `.opencode/opencode.json`:

```json
{
  "plugins": {
    "@opencodium/nix-develop": {
      "enabled": true,
      "exclude": ["my-custom-command"],
      "flakePath": ".",
      "devShell": "default"
    }
  }
}
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable the plugin |
| `exclude` | string[] | See below | Commands to exclude from wrapping |
| `flakePath` | string | `"."` | Path to flake (relative to workdir) |
| `devShell` | string | `undefined` | Specific devShell to use (e.g., `"dev"`) |

### Default excluded commands

These commands are not wrapped by default:
- `nix`, `git`, `cd`, `ls`, `pwd`, `echo`, `cat`, `head`, `tail`, `which`, `env`, `export`, `source`, `.`

## Example

Without plugin:
```bash
# Agent has to remember to wrap every command
nix develop -c cargo build
nix develop -c cargo test
```

With plugin:
```bash
# Agent just runs commands naturally
cargo build  # → automatically wrapped as: nix develop -c bash -c "cargo build"
cargo test   # → automatically wrapped as: nix develop -c bash -c "cargo test"
```
