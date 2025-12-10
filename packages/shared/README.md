# @opencodium/shared

Shared utilities for OpenCode plugins.

## Config Loading

The `loadConfig` and `loadPluginConfig` functions load JSON configuration files for plugins.

### Usage

```typescript
import { loadPluginConfig } from "@opencodium/shared";
import pkg from "../package.json";

export const MyPlugin: Plugin = async (input) => {
  const config = await loadPluginConfig<MyConfig>(pkg.name, input.directory);
  // ...
};
```

### Search Order

Config files are searched in the following order:
1. `.opencode/{filename}` (project root)
2. `.opencode/plugin/{filename}` (project plugin directory)
3. `~/.config/opencode/{filename}` (global root, or `$XDG_CONFIG_HOME/opencode`)
4. `~/.config/opencode/plugin/{filename}` (global plugin directory)

### Filename Derivation

When using `loadPluginConfig` with a package name, the filename is automatically derived:
- `@opencodium/bash-wrapper` → `bash-wrapper.json`
- `@scope/my-plugin` → `my-plugin.json`
- `my-plugin` → `my-plugin.json`

You can also use `loadConfig` directly with an explicit filename:
```typescript
const config = await loadConfig<MyConfig>("my-config.json", input.directory);
```

## API

### `loadConfig<T>(filenameOrPackage: string, projectDir: string): Promise<T | null>`

Load a config file. Accepts either a filename (e.g., `"bash-wrapper.json"`) or package name (e.g., `"@opencodium/bash-wrapper"`).

### `loadPluginConfig<T>(packageName: string, projectDir: string): Promise<T | null>`

Alias for `loadConfig` that makes it clear you're loading config for a plugin using its package name.

### `getGlobalConfigDir(): string | null`

Get the global OpenCode config directory path (`~/.config/opencode` or `$XDG_CONFIG_HOME/opencode`).
