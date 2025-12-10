/**
 * Configuration for the git-narration plugin.
 */
export interface GitNarrationConfig {
  /** 
   * Lowercase the first letter of commit messages unless it's a code symbol.
   * Default: true
   */
  lowercaseMessages?: boolean;
  
  /**
   * Fail the edit/write operation if not in a git repo or if commit fails.
   * When false, the file operation succeeds even if git fails.
   * Default: false
   */
  strictCommit?: boolean;

  /**
   * Track and commit file changes made by bash commands.
   * Default: true
   */
  trackBash?: boolean;
}

export const defaultConfig: GitNarrationConfig = {
  lowercaseMessages: true,
  strictCommit: false,
  trackBash: true,
};
