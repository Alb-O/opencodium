# skills

Discovers `SKILL.md` files that follow Anthropic's Agent Skills spec and exposes each one as a tool named `skills_<path>`. The plugin scans, in priority order, `~/.config/opencode/skills/` (or `$XDG_CONFIG_HOME/opencode/skills`), `~/.opencode/skills/`, and `<project>/.opencode/skills/`. Directory names must match the `name` field in the SKILL.md frontmatter.

When you call a generated tool, the plugin silently injects the skill content into the session via `noReply` prompts, preserving the base directory so relative paths work as expected. YAML frontmatter is validated with zod; invalid or mismatched skills are skipped with console warnings. Symlinked skill directories are supported, and later discovery paths override earlier ones if they produce the same tool name.
