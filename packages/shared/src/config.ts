import { promises as fs } from "node:fs";
import path from "node:path";
import { xdgConfig } from "xdg-basedir";

const OPENCODE_DIR = "opencode";

/**
 * Derives a config filename from a package name.
 * Examples:
 *   @opencodium/bash-wrapper → bash-wrapper.json
 *   bash-wrapper → bash-wrapper.json
 *   @scope/my-plugin → my-plugin.json
 */
function deriveFilename(packageName: string): string {
  // Remove scope if present (e.g., @opencodium/bash-wrapper → bash-wrapper)
  const name = packageName.includes('/') 
    ? packageName.split('/')[1] 
    : packageName;
  
  return `${name}.json`;
}

/**
 * Load a JSON config file, checking project-local first, then global.
 * 
 * Search order:
 *   1. ./.opencode/{filename}
 *   2. ./.opencode/plugin/{filename}
 *   3. ~/.config/opencode/{filename} (or $XDG_CONFIG_HOME/opencode/{filename})
 *   4. ~/.config/opencode/plugin/{filename}
 * 
 * @param filenameOrPackage - Either a filename (e.g., "bash-wrapper.json") or package name (e.g., "@opencodium/bash-wrapper")
 * @param projectDir - The project directory (from PluginInput.directory)
 * @returns The parsed config object, or null if not found
 */
export async function loadConfig<T>(filenameOrPackage: string, projectDir: string): Promise<T | null> {
  // If it's a package name (has @ or /), derive the filename
  const filename = (filenameOrPackage.includes('@') || !filenameOrPackage.endsWith('.json'))
    ? deriveFilename(filenameOrPackage)
    : filenameOrPackage;

  const paths = [
    path.join(projectDir, ".opencode", filename),
    path.join(projectDir, ".opencode", "plugin", filename),
    ...(xdgConfig ? [
      path.join(xdgConfig, OPENCODE_DIR, filename),
      path.join(xdgConfig, OPENCODE_DIR, "plugin", filename),
    ] : []),
  ];

  for (const configPath of paths) {
    try {
      const content = await fs.readFile(configPath, "utf-8");
      return JSON.parse(content) as T;
    } catch {
      // File doesn't exist or isn't valid JSON, try next path
    }
  }

  return null;
}

/**
 * Get the global OpenCode config directory path.
 * Returns ~/.config/opencode or $XDG_CONFIG_HOME/opencode
 */
export function getGlobalConfigDir(): string | null {
  return xdgConfig ? path.join(xdgConfig, OPENCODE_DIR) : null;
}

/**
 * Helper to load config for a plugin using its package.json name.
 * Just pass in the name from your package.json.
 * 
 * @example
 * ```ts
 * import pkg from "../package.json";
 * const config = await loadPluginConfig<MyConfig>(pkg.name, input.directory);
 * ```
 */
export async function loadPluginConfig<T>(packageName: string, projectDir: string): Promise<T | null> {
  return loadConfig<T>(packageName, projectDir);
}
