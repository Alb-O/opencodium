import { promises as fs } from "node:fs";
import path from "node:path";

import { SYM_DIR_NAME } from "./symdir";

const IGNORE_FILE_NAME = ".ignore";
const MARKER_START = "# dyn-sym plugin (DO NOT EDIT)";
const MARKER_END = "# end dyn-sym";

/**
 * Get the path to the .ignore file in the worktree root.
 */
export function getIgnoreFilePath(worktreeRoot: string): string {
  return path.join(worktreeRoot, IGNORE_FILE_NAME);
}

/**
 * Read the current .ignore file content.
 */
async function readIgnoreFile(ignorePath: string): Promise<string> {
  try {
    return await fs.readFile(ignorePath, "utf-8");
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return "";
    }
    throw err;
  }
}

/**
 * Check if our managed section exists in the content.
 */
function hasManagedSection(content: string): boolean {
  return content.includes(MARKER_START) && content.includes(MARKER_END);
}

/**
 * Build our managed section content.
 */
function buildManagedSection(): string {
  return [
    MARKER_START,
    `!/${SYM_DIR_NAME}/`,
    MARKER_END,
  ].join("\n");
}

/**
 * Append our managed section to content (preserving existing content).
 */
function appendManagedSection(content: string): string {
  const section = buildManagedSection();
  const trimmed = content.trimEnd();
  
  if (trimmed.length === 0) {
    return section + "\n";
  }
  
  return trimmed + "\n\n" + section + "\n";
}

/**
 * Remove our managed section from content (preserving user content).
 */
function removeManagedSection(content: string): string {
  const startIdx = content.indexOf(MARKER_START);
  const endIdx = content.indexOf(MARKER_END);
  
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return content;
  }
  
  const before = content.slice(0, startIdx);
  const after = content.slice(endIdx + MARKER_END.length);
  
  // Clean up whitespace
  const result = (before.trimEnd() + after.trimStart()).trim();
  
  // Return empty string if nothing left, otherwise add trailing newline
  return result.length === 0 ? "" : result + "\n";
}

/**
 * Add our managed section to the .ignore file.
 * Preserves any existing user content.
 */
export async function addIgnoreSection(worktreeRoot: string): Promise<void> {
  const ignorePath = getIgnoreFilePath(worktreeRoot);
  const content = await readIgnoreFile(ignorePath);
  
  // Already has our section
  if (hasManagedSection(content)) {
    return;
  }
  
  const newContent = appendManagedSection(content);
  await fs.writeFile(ignorePath, newContent, "utf-8");
}

/**
 * Remove our managed section from the .ignore file.
 * Preserves any existing user content.
 * Deletes the file entirely if it becomes empty.
 */
export async function removeIgnoreSection(worktreeRoot: string): Promise<void> {
  const ignorePath = getIgnoreFilePath(worktreeRoot);
  
  let content: string;
  try {
    content = await fs.readFile(ignorePath, "utf-8");
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return; // File doesn't exist, nothing to remove
    }
    throw err;
  }
  
  // No managed section to remove
  if (!hasManagedSection(content)) {
    return;
  }
  
  const newContent = removeManagedSection(content);
  
  if (newContent.length === 0) {
    // File is empty after removing our section - delete it
    await fs.unlink(ignorePath);
  } else {
    await fs.writeFile(ignorePath, newContent, "utf-8");
  }
}

/**
 * Check if the .ignore file exists.
 */
export async function ignoreFileExists(worktreeRoot: string): Promise<boolean> {
  const ignorePath = getIgnoreFilePath(worktreeRoot);
  try {
    await fs.access(ignorePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if our managed section is present in the .ignore file.
 */
export async function hasIgnoreSection(worktreeRoot: string): Promise<boolean> {
  const ignorePath = getIgnoreFilePath(worktreeRoot);
  const content = await readIgnoreFile(ignorePath);
  return hasManagedSection(content);
}
