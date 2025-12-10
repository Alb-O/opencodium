/**
 * Git worktree helpers.
 * 
 * Low-level git operations for managing worktrees and branches using simple-git.
 */

import { simpleGit, type SimpleGit } from "simple-git";

export interface WorktreeInfo {
  worktreePath: string;
  branch?: string;
}

/**
 * Create a simple-git instance for a directory.
 */
function git(cwd?: string): SimpleGit {
  return cwd ? simpleGit({ baseDir: cwd }) : simpleGit();
}

/**
 * Check if we're in a git repository.
 */
export async function isGitRepo(cwd?: string): Promise<boolean> {
  try {
    await git(cwd).revparse(["--git-dir"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the root directory of the git repository.
 */
export async function getGitRoot(cwd?: string): Promise<string> {
  const result = await git(cwd).revparse(["--show-toplevel"]);
  return result.trim();
}

/**
 * Ensure a branch exists locally. Creates it if it doesn't exist.
 */
export async function ensureBranchExists(branch: string, cwd?: string): Promise<void> {
  const g = git(cwd);
  const branches = await g.branchLocal();
  if (!branches.all.includes(branch)) {
    await g.branch([branch]);
  }
}

/**
 * Add a new git worktree.
 */
export async function worktreeAdd(worktreePath: string, branch: string, cwd?: string): Promise<void> {
  await git(cwd).raw(["worktree", "add", worktreePath, branch]);
}

/**
 * Remove a git worktree.
 */
export async function worktreeRemove(worktreePath: string, cwd?: string): Promise<void> {
  await git(cwd).raw(["worktree", "remove", "--force", worktreePath]);
}

/**
 * List all git worktrees.
 */
export async function listWorktrees(cwd?: string): Promise<WorktreeInfo[]> {
  try {
    const output = await git(cwd).raw(["worktree", "list", "--porcelain"]);
    if (!output.trim()) return [];

    const entries = output.split("\n\n").map((s) => s.trim()).filter(Boolean);
    const results: WorktreeInfo[] = [];

    for (const entry of entries) {
      const lines = entry.split("\n");
      const wtLine = lines.find((l) => l.startsWith("worktree "));
      const branchLine = lines.find((l) => l.startsWith("branch "));
      if (!wtLine) continue;
      const p = wtLine.replace(/^worktree\s+/, "").trim();
      results.push({
        worktreePath: p,
        branch: branchLine ? branchLine.replace(/^branch\s+/, "").trim() : undefined,
      });
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Check if a worktree already exists at the given path.
 */
export async function worktreeExists(worktreePath: string, cwd?: string): Promise<boolean> {
  const worktrees = await listWorktrees(cwd);
  return worktrees.some((wt) => wt.worktreePath === worktreePath);
}
