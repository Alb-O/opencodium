import { promises as fs } from "node:fs";
import path from "node:path";

import { SYM_DIR_NAME } from "./symdir";

const EXCLUDE_MARKER_START = "# dyn-sym plugin managed entries (DO NOT EDIT)";
const EXCLUDE_MARKER_END = "# end dyn-sym plugin managed entries";

/**
 * Get the path to .git/info/exclude for local git excludes.
 * This avoids modifying .gitignore which is tracked.
 */
export function getExcludePath(worktreeRoot: string): string {
  return path.join(worktreeRoot, ".git", "info", "exclude");
}

/**
 * Check if a worktree has a .git directory (is a git repo).
 */
export async function isGitRepo(worktreeRoot: string): Promise<boolean> {
  const gitDir = path.join(worktreeRoot, ".git");
  
  try {
    const stat = await fs.stat(gitDir);
    // Handle both regular .git directory and worktree .git file
    return stat.isDirectory() || stat.isFile();
  } catch {
    return false;
  }
}

/**
 * Read the current exclude file content.
 */
async function readExcludeFile(excludePath: string): Promise<string> {
  try {
    return await fs.readFile(excludePath, "utf-8");
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return "";
    }
    throw err;
  }
}

/**
 * Extract our managed section from the exclude file.
 */
function extractManagedSection(content: string): string[] {
  const startIdx = content.indexOf(EXCLUDE_MARKER_START);
  const endIdx = content.indexOf(EXCLUDE_MARKER_END);
  
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return [];
  }
  
  const section = content.slice(
    startIdx + EXCLUDE_MARKER_START.length,
    endIdx
  );
  
  return section
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0);
}

/**
 * Build the managed section content.
 */
function buildManagedSection(entries: string[]): string {
  if (entries.length === 0) {
    return "";
  }
  
  return [
    EXCLUDE_MARKER_START,
    ...entries,
    EXCLUDE_MARKER_END,
  ].join("\n");
}

/**
 * Replace or append our managed section in the exclude file.
 */
function replaceManagedSection(content: string, newSection: string): string {
  const startIdx = content.indexOf(EXCLUDE_MARKER_START);
  const endIdx = content.indexOf(EXCLUDE_MARKER_END);
  
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    // Replace existing section
    const before = content.slice(0, startIdx);
    const after = content.slice(endIdx + EXCLUDE_MARKER_END.length);
    
    if (newSection.length === 0) {
      // Remove the section entirely
      return (before.trimEnd() + after.trimStart()).trim();
    }
    
    return before.trimEnd() + "\n" + newSection + after;
  }
  
  // Append new section
  if (newSection.length === 0) {
    return content;
  }
  
  const trimmed = content.trimEnd();
  if (trimmed.length === 0) {
    return newSection + "\n";
  }
  
  return trimmed + "\n\n" + newSection + "\n";
}

/**
 * Ensure .sym directory is in the local git exclude file.
 * Does nothing if not a git repo.
 */
export async function ensureSymDirExcluded(worktreeRoot: string): Promise<boolean> {
  if (!(await isGitRepo(worktreeRoot))) {
    return false;
  }
  
  const excludePath = getExcludePath(worktreeRoot);
  
  // Ensure .git/info directory exists
  const infoDir = path.dirname(excludePath);
  await fs.mkdir(infoDir, { recursive: true });
  
  const content = await readExcludeFile(excludePath);
  const currentEntries = extractManagedSection(content);
  
  // Check if already excluded
  const symDirPattern = `/${SYM_DIR_NAME}/`;
  if (currentEntries.includes(symDirPattern)) {
    return true;
  }
  
  // Add the exclusion
  const newEntries = [...currentEntries, symDirPattern];
  const newSection = buildManagedSection(newEntries);
  const newContent = replaceManagedSection(content, newSection);
  
  await fs.writeFile(excludePath, newContent, "utf-8");
  return true;
}

/**
 * Remove our managed section from the exclude file.
 */
export async function removeSymDirExclude(worktreeRoot: string): Promise<boolean> {
  if (!(await isGitRepo(worktreeRoot))) {
    return false;
  }
  
  const excludePath = getExcludePath(worktreeRoot);
  
  try {
    const content = await readExcludeFile(excludePath);
    const newContent = replaceManagedSection(content, "");
    
    if (newContent !== content) {
      await fs.writeFile(excludePath, newContent, "utf-8");
      return true;
    }
    
    return false;
  } catch {
    return false;
  }
}
