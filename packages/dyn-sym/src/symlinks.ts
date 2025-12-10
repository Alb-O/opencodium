import { promises as fs } from "node:fs";
import path from "node:path";

import { getSymDirPath, ensureSymDir } from "./symdir";

/**
 * Represents a symlink in the .sym directory.
 */
export interface SymlinkEntry {
  /** Name of the symlink (basename in .sym directory) */
  name: string;
  /** Absolute path to the symlink */
  linkPath: string;
  /** Absolute path the symlink points to */
  targetPath: string;
  /** Whether the target exists */
  targetExists: boolean;
}

/**
 * Add a symlink to the .sym directory.
 * @param worktreeRoot The root of the worktree
 * @param targetPath The path to link to (absolute or relative to cwd)
 * @param name Optional custom name for the symlink (defaults to target basename)
 * @returns The created symlink entry
 */
export async function addSymlink(
  worktreeRoot: string,
  targetPath: string,
  name?: string
): Promise<SymlinkEntry> {
  const symDir = await ensureSymDir(worktreeRoot);
  
  // Resolve target to absolute path
  const absoluteTarget = path.isAbsolute(targetPath)
    ? targetPath
    : path.resolve(targetPath);
  
  // Verify target exists
  try {
    await fs.stat(absoluteTarget);
  } catch (err: any) {
    if (err.code === "ENOENT") {
      throw new Error(`Target does not exist: ${absoluteTarget}`);
    }
    throw err;
  }
  
  // Determine symlink name
  const linkName = name || path.basename(absoluteTarget);
  const linkPath = path.join(symDir, linkName);
  
  // Check if symlink already exists
  try {
    const existingStat = await fs.lstat(linkPath);
    if (existingStat.isSymbolicLink()) {
      const existingTarget = await fs.readlink(linkPath);
      if (existingTarget === absoluteTarget) {
        // Already linked to same target
        return {
          name: linkName,
          linkPath,
          targetPath: absoluteTarget,
          targetExists: true,
        };
      }
      // Different target - remove and recreate
      await fs.unlink(linkPath);
    } else {
      throw new Error(`Path exists and is not a symlink: ${linkPath}`);
    }
  } catch (err: any) {
    if (err.code !== "ENOENT") {
      throw err;
    }
  }
  
  // Create the symlink
  await fs.symlink(absoluteTarget, linkPath);
  
  return {
    name: linkName,
    linkPath,
    targetPath: absoluteTarget,
    targetExists: true,
  };
}

/**
 * Remove a symlink from the .sym directory.
 * @param worktreeRoot The root of the worktree
 * @param name The name of the symlink to remove
 * @returns true if removed, false if didn't exist
 */
export async function removeSymlink(
  worktreeRoot: string,
  name: string
): Promise<boolean> {
  const symDir = getSymDirPath(worktreeRoot);
  const linkPath = path.join(symDir, name);
  
  try {
    const stat = await fs.lstat(linkPath);
    if (!stat.isSymbolicLink()) {
      throw new Error(`Path is not a symlink: ${linkPath}`);
    }
    await fs.unlink(linkPath);
    return true;
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return false;
    }
    throw err;
  }
}

/**
 * List all symlinks in the .sym directory.
 * @param worktreeRoot The root of the worktree
 * @returns Array of symlink entries
 */
export async function listSymlinks(worktreeRoot: string): Promise<SymlinkEntry[]> {
  const symDir = getSymDirPath(worktreeRoot);
  
  let entries: string[];
  try {
    entries = await fs.readdir(symDir);
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return [];
    }
    throw err;
  }
  
  const results: SymlinkEntry[] = [];
  
  for (const entry of entries) {
    const linkPath = path.join(symDir, entry);
    
    try {
      const stat = await fs.lstat(linkPath);
      if (!stat.isSymbolicLink()) {
        continue; // Skip non-symlinks
      }
      
      const targetPath = await fs.readlink(linkPath);
      let targetExists = false;
      
      try {
        await fs.stat(linkPath); // follows symlink
        targetExists = true;
      } catch {
        targetExists = false;
      }
      
      results.push({
        name: entry,
        linkPath,
        targetPath,
        targetExists,
      });
    } catch {
      // Skip entries we can't read
      continue;
    }
  }
  
  return results;
}

/**
 * Check if a symlink exists in the .sym directory.
 * @param worktreeRoot The root of the worktree
 * @param name The name of the symlink
 * @returns true if exists and is a symlink
 */
export async function symlinkExists(
  worktreeRoot: string,
  name: string
): Promise<boolean> {
  const symDir = getSymDirPath(worktreeRoot);
  const linkPath = path.join(symDir, name);
  
  try {
    const stat = await fs.lstat(linkPath);
    return stat.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Clear all symlinks from the .sym directory.
 * @param worktreeRoot The root of the worktree
 * @returns Number of symlinks removed
 */
export async function clearSymlinks(worktreeRoot: string): Promise<number> {
  const symlinks = await listSymlinks(worktreeRoot);
  let removed = 0;
  
  for (const symlink of symlinks) {
    try {
      await fs.unlink(symlink.linkPath);
      removed++;
    } catch {
      // Ignore errors removing individual symlinks
    }
  }
  
  return removed;
}
