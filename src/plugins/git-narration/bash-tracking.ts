import { simpleGit, type SimpleGit, type StatusResult } from "simple-git";
import type { GitNarrationConfig } from "./config";

/**
 * Snapshot of git state before a command runs.
 */
export type GitSnapshot = {
  root: string;
  status: StatusResult;
  description: string;
  workdir: string;
};

const snapshots = new Map<string, GitSnapshot>();

function git(cwd: string): SimpleGit {
  return simpleGit({ baseDir: cwd, binary: "git", maxConcurrentProcesses: 1 });
}

/**
 * Capture git state before a bash command runs.
 * Stores the snapshot keyed by callID for later comparison.
 */
export async function captureBeforeBash(
  callID: string,
  workdir: string,
  description: string,
): Promise<void> {
  try {
    const repo = git(workdir);
    const root = (await repo.revparse(["--show-toplevel"])).trim();
    if (!root) return;

    const status = await repo.status();
    snapshots.set(callID, { root, status, description, workdir });
  } catch {
    // Not in a git repo, nothing to track
  }
}

/**
 * After bash completes, compare current state to snapshot and commit changes.
 * Returns commit info if a commit was made.
 */
export async function commitAfterBash(
  callID: string,
  config: GitNarrationConfig,
): Promise<{ committed: boolean; files: string[]; message: string } | null> {
  const snapshot = snapshots.get(callID);
  if (!snapshot) return null;
  snapshots.delete(callID);

  try {
    const repo = git(snapshot.root);
    const currentStatus = await repo.status();

    // Find files that changed since the snapshot
    const changedFiles = findChangedFiles(snapshot.status, currentStatus);
    if (changedFiles.length === 0) return null;

    // Stage all changed files
    await repo.add(changedFiles);

    // Commit with the description
    const message = config.lowercaseMessages !== false
      ? normalizeMessage(snapshot.description)
      : snapshot.description;

    await repo.commit(message, changedFiles);

    return { committed: true, files: changedFiles, message };
  } catch (err) {
    // Commit failed, but bash command succeeded
    return null;
  }
}

/**
 * Find files that changed between two status snapshots.
 */
function findChangedFiles(before: StatusResult, after: StatusResult): string[] {
  const beforeFiles = new Set<string>();
  
  // Collect all files from before snapshot
  for (const f of before.modified) beforeFiles.add(f);
  for (const f of before.created) beforeFiles.add(f);
  for (const f of before.deleted) beforeFiles.add(f);
  for (const f of before.not_added) beforeFiles.add(f);
  for (const f of before.staged) beforeFiles.add(f);

  const changedFiles: string[] = [];

  // Check which files in "after" weren't in "before" or changed state
  const checkFile = (file: string) => {
    if (!beforeFiles.has(file)) {
      changedFiles.push(file);
    }
  };

  // New modifications
  for (const f of after.modified) {
    if (!before.modified.includes(f)) changedFiles.push(f);
  }
  
  // New creations
  for (const f of after.created) {
    if (!before.created.includes(f)) changedFiles.push(f);
  }
  
  // New deletions
  for (const f of after.deleted) {
    if (!before.deleted.includes(f)) changedFiles.push(f);
  }
  
  // New untracked files
  for (const f of after.not_added) {
    if (!before.not_added.includes(f)) changedFiles.push(f);
  }

  // Dedupe
  return [...new Set(changedFiles)];
}

/**
 * Normalize commit message: lowercase first letter unless code symbol.
 */
function normalizeMessage(message: string): string {
  const firstWord = message.split(" ")[0];
  const prefixMatch = firstWord.match(/^([\[\(\{<"'])?(.)/);
  if (!prefixMatch) return message;
  
  const prefix = prefixMatch[1] || "";
  const firstChar = prefixMatch[2];
  const charIndex = prefix.length;

  const symbolPattern = /^([_$][A-Za-z0-9_$]*|[A-Z0-9_]+|[a-z0-9]+(?:[-_][a-z0-9]+)+|[a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*|[A-Z][a-z0-9]+(?:[A-Z][A-Za-z0-9]+)+)$/;
  const isPlainCapitalized = /^[A-Z][a-z]+$/.test(firstWord.slice(charIndex));
  
  if (symbolPattern.test(firstWord.slice(charIndex)) && !isPlainCapitalized) {
    return message;
  }

  return message.slice(0, charIndex) + firstChar.toLowerCase() + message.slice(charIndex + 1);
}

/**
 * Clear a snapshot without committing (e.g., if bash failed).
 */
export function clearSnapshot(callID: string): void {
  snapshots.delete(callID);
}
