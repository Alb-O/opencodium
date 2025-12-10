/**
 * Session-to-worktree state mapping.
 * 
 * Tracks which sessions have worktrees set up and their paths.
 */

const worktreeMap = new Map<string, string>();

export function setSessionWorktree(sessionID: string, worktreePath: string): void {
  worktreeMap.set(sessionID, worktreePath);
}

export function getSessionWorktree(sessionID: string): string | undefined {
  return worktreeMap.get(sessionID);
}

export function clearSessionWorktree(sessionID: string): void {
  worktreeMap.delete(sessionID);
}

export function hasSessionWorktree(sessionID: string): boolean {
  return worktreeMap.has(sessionID);
}
