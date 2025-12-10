/**
 * Worktree setup and context resolution.
 * 
 * Creates the worktree directory for a session and provides context for path resolution.
 */

import path from "path";
import { promises as fs } from "fs";
import { generateIdentity, getWorktreeName, type AgentIdentity } from "./identity";
import { ensureBranchExists, worktreeAdd, worktreeExists } from "./git";
import { setSessionWorktree, getSessionWorktree } from "./session";
import type { AutoWorktreeConfig } from "./config";

export interface WorktreeContext {
  /** Absolute path to the worktree directory */
  worktreePath: string;
  /** Branch name for commits */
  branchName: string;
  /** User name for commits */
  userName: string;
  /** User email for commits */
  userEmail: string;
  /** The agent identity */
  identity: AgentIdentity;
}

/**
 * Ensures the worktree directory structure exists.
 * Creates .opencode/worktrees/ with a .gitignore that ignores all contents.
 */
async function ensureWorktreeDir(rootDir: string, config: Required<AutoWorktreeConfig>): Promise<string> {
  const wtRoot = path.join(rootDir, config.baseDir, config.worktreesDir);
  await fs.mkdir(wtRoot, { recursive: true });

  // Write .gitignore to ignore all worktree contents (don't overwrite if exists)
  const gitignorePath = path.join(wtRoot, ".gitignore");
  await fs.writeFile(gitignorePath, "*\n", { flag: "wx" }).catch(() => undefined);

  return wtRoot;
}

/**
 * Sets up a worktree for a session.
 * 
 * Creates the branch if needed, adds the worktree, and registers it.
 * Returns the worktree context with paths and identity info.
 */
export async function setupWorktree(
  sessionID: string,
  rootDir: string,
  config: Required<AutoWorktreeConfig>,
): Promise<WorktreeContext> {
  // Check if already set up
  const existing = getSessionWorktree(sessionID);
  if (existing) {
    const identity = generateIdentity(sessionID);
    return {
      worktreePath: existing,
      branchName: identity.branchName,
      userName: identity.userName,
      userEmail: identity.userEmail,
      identity,
    };
  }

  const identity = generateIdentity(sessionID);
  const wtName = getWorktreeName(identity);
  const wtRoot = await ensureWorktreeDir(rootDir, config);
  const worktreePath = path.join(wtRoot, wtName);

  // Create branch and worktree (skip if already exists)
  await ensureBranchExists(identity.branchName, rootDir);
  
  const exists = await worktreeExists(worktreePath, rootDir);
  if (!exists) {
    await worktreeAdd(worktreePath, identity.branchName, rootDir);
  }

  // Register the worktree for this session
  setSessionWorktree(sessionID, worktreePath);

  return {
    worktreePath,
    branchName: identity.branchName,
    userName: identity.userName,
    userEmail: identity.userEmail,
    identity,
  };
}

/**
 * Gets the worktree context for a session if it exists.
 */
export function getWorktreeContext(sessionID: string): WorktreeContext | undefined {
  const worktreePath = getSessionWorktree(sessionID);
  if (!worktreePath) return undefined;

  const identity = generateIdentity(sessionID);
  return {
    worktreePath,
    branchName: identity.branchName,
    userName: identity.userName,
    userEmail: identity.userEmail,
    identity,
  };
}
