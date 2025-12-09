# Bash Wrapper Plugin

Wraps all bash commands executed by the agent using a configurable template. Useful for running commands inside containers, nix shells, remote hosts, etc.

## Configuration

Create a config file at:
- `.opencode/bash-wrapper.json` (project-local, takes priority)
- `~/.config/opencode/bash-wrapper.json` (global fallback)

### Simple Template

Always applies the same wrapper:

```json
{
  "template": "docker exec -it mycontainer ${command}"
}
```

### Conditional Templates with Fallback

Use a chain of templates with conditions. The first matching template wins:

```json
{
  "templates": [
    {
      "template": "nix develop --quiet -c bash -c \"${command:quoted}\"",
      "when": { "file": "flake.nix", "command": "nix" }
    },
    {
      "template": "${command}"
    }
  ]
}
```

## Placeholders

| Placeholder | Description |
|-------------|-------------|
| `${command}` | Raw command, no escaping |
| `${command:quoted}` | Escaped for double quotes (`\`, `"`, `` ` ``, `$` are backslash-escaped) |
| `${command:single}` | Escaped for single quotes (`'` becomes `'\''`) |

## Conditions

| Condition | Description |
|-----------|-------------|
| `file` | Check if file exists relative to project root |
| `command` | Check if command is available in PATH |

Conditions are AND'd together. A template without `when` always matches (use as final fallback).

## Examples

### Docker

```json
{
  "template": "docker exec -it mycontainer ${command}"
}
```

### SSH

```json
{
  "template": "ssh myhost '${command:single}'"
}
```

### Nix Develop with Fallback

```json
{
  "templates": [
    {
      "template": "nix develop --quiet -c bash -c \"${command:quoted}\"",
      "when": { "file": "flake.nix", "command": "nix" }
    },
    {
      "template": "${command}"
    }
  ]
}
```

> **Note:** Use `--quiet` with `nix develop` to suppress nix output. Shell hooks defined in your flake may still produce output.

### Devcontainer

```json
{
  "templates": [
    {
      "template": "devcontainer exec --workspace-folder . bash -c \"${command:quoted}\"",
      "when": { "file": ".devcontainer/devcontainer.json", "command": "devcontainer" }
    },
    {
      "template": "${command}"
    }
  ]
}
```

## Behavior

- Templates are evaluated in order at plugin initialization
- First template whose conditions all pass is selected for the session
- If template is `${command}`, no wrapping occurs (explicit no-op)
- If no config file exists, commands run unwrapped
