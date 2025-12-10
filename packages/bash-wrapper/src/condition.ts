import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Condition types for template selection.
 */
export interface Condition {
  /** Check if file exists (searches upward from project root) */
  file?: string;
  /** Check if command is available in PATH */
  command?: string;
}

/**
 * Search for a file starting from baseDir and walking up to root.
 * Returns the directory containing the file, or null if not found.
 */
async function findFileUpward(fileName: string, baseDir: string): Promise<string | null> {
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

/**
 * Check if a file exists, searching upward from baseDir.
 */
async function checkFileExists(filePath: string, baseDir: string): Promise<boolean> {
  // Absolute paths are checked directly
  if (path.isAbsolute(filePath)) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  // Relative paths trigger upward search
  const found = await findFileUpward(filePath, baseDir);
  return found !== null;
}

/**
 * Check if a command is available in PATH.
 */
async function checkCommandExists(command: string): Promise<boolean> {
  try {
    const proc = Bun.spawn(["which", command], {
      stdout: "ignore",
      stderr: "ignore",
    });
    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Evaluate a condition against the current environment.
 * Returns true if all specified checks pass.
 * An empty/undefined condition always returns true.
 */
export async function evaluateCondition(
  condition: Condition | undefined,
  baseDir: string
): Promise<boolean> {
  if (!condition) {
    return true;
  }

  if (condition.file !== undefined) {
    const exists = await checkFileExists(condition.file, baseDir);
    if (!exists) {
      return false;
    }
  }

  if (condition.command !== undefined) {
    const exists = await checkCommandExists(condition.command);
    if (!exists) {
      return false;
    }
  }

  return true;
}

/**
 * Find a file searching upward from baseDir.
 * Exported for use when the template needs the file's directory.
 */
export { findFileUpward };
