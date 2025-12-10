# bash-wrapper

Wraps every bash command the agent executes through a configurable template. Put your commands inside a docker container, nix shell, SSH session, or anything else that accepts a command string.

## Configuration

The plugin looks for `.opencode/bash-wrapper.json` in your project, falling back to `~/.config/opencode/bash-wrapper.json`. A simple config wraps everything the same way:

```json
{
  "template": "docker exec -it mycontainer ${command}"
}
```

Use `${command}` for raw insertion, `${command:quoted}` when the command sits inside double quotes (escapes `\`, `"`, `` ` ``, `$`), or `${command:single}` for single quotes (turns `'` into `'\''`).

## Conditional Templates

When different projects need different wrappers, use a `templates` array. The plugin evaluates each template's `when` conditions at init and selects the first match for the session:

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

The `file` condition searches upward from the project root, matching how `nix develop` finds its `flake.nix`. The `command` condition checks PATH availability. Both must pass if specified. A template without `when` always matches, so put it last as a fallback.

If the winning template is literally `${command}`, no wrapping occurs. No config file means commands run bare.

## Common Setups

SSH to a remote host, quoting for the remote shell:

```json
{ "template": "ssh myhost '${command:single}'" }
```

Devcontainer with fallback to bare execution:

```json
{
  "templates": [
    {
      "template": "devcontainer exec --workspace-folder . bash -c \"${command:quoted}\"",
      "when": { "file": ".devcontainer/devcontainer.json", "command": "devcontainer" }
    },
    { "template": "${command}" }
  ]
}
```

Nix flakes with `--quiet` to suppress nix output (shell hooks may still print):

```json
{
  "templates": [
    {
      "template": "nix develop --quiet -c bash -c \"${command:quoted}\"",
      "when": { "file": "flake.nix", "command": "nix" }
    },
    { "template": "${command}" }
  ]
}
```
