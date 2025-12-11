import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Search for a file starting from baseDir and walking up to root.
 * Returns the directory containing the file, or null if not found.
 * Stops at filesystem root or user home directory.
 */
export async function findFileUpward(fileName: string, baseDir: string): Promise<string | null> {
  let current = path.resolve(baseDir);
  const root = path.parse(current).root;
  const home = os.homedir();

  while (current !== root && current !== home) {
    const filePath = path.join(current, fileName);
    try {
      await fs.access(filePath);
      return current;
    } catch {
      // Continue searching upward
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}
