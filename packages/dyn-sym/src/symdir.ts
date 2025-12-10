import { promises as fs } from "node:fs";
import path from "node:path";

export const SYM_DIR_NAME = ".sym";

/**
 * Ensures the .sym directory exists in the worktree root.
 * Creates it if it doesn't exist.
 * @returns The absolute path to the .sym directory
 */
export async function ensureSymDir(worktreeRoot: string): Promise<string> {
  const symDir = path.join(worktreeRoot, SYM_DIR_NAME);
  
  try {
    await fs.mkdir(symDir, { recursive: true });
  } catch (err: any) {
    // EEXIST is fine - directory already exists
    if (err.code !== "EEXIST") {
      throw err;
    }
  }
  
  return symDir;
}

/**
 * Check if the .sym directory exists.
 */
export async function symDirExists(worktreeRoot: string): Promise<boolean> {
  const symDir = path.join(worktreeRoot, SYM_DIR_NAME);
  
  try {
    const stat = await fs.stat(symDir);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Get the absolute path to the .sym directory.
 */
export function getSymDirPath(worktreeRoot: string): string {
  return path.join(worktreeRoot, SYM_DIR_NAME);
}
