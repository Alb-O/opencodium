/**
 * Auto-worktree plugin configuration.
 */

export interface AutoWorktreeConfig {
  /** 
   * Base directory for OpenCode artifacts.
   * Default: ".opencode"
   */
  baseDir?: string;
  
  /** 
   * Subdirectory within baseDir for worktrees.
   * Default: "worktrees"
   */
  worktreesDir?: string;
}

export const defaultConfig: Required<AutoWorktreeConfig> = {
  baseDir: ".opencode",
  worktreesDir: "worktrees",
};
