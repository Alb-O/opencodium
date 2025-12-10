import { promises as fs } from "node:fs";
import path from "node:path";
import { xdgConfig } from "xdg-basedir";

const OPENCODE_DIR = "opencode";

/**
 * Load a JSON config file, checking project-local first, then global.
 * 
 * Search order:
 *   1. ./.opencode/{filename}
 *   2. ~/.config/opencode/{filename} (or $XDG_CONFIG_HOME/opencode/{filename})
 * 
 * @param filename - The config filename (e.g., "bash-wrapper.json")
 * @param projectDir - The project directory (from PluginInput.directory)
 * @returns The parsed config object, or null if not found
 */
export async function loadConfig<T>(filename: string, projectDir: string): Promise<T | null> {
  const paths = [
    path.join(projectDir, ".opencode", filename),
    ...(xdgConfig ? [path.join(xdgConfig, OPENCODE_DIR, filename)] : []),
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
