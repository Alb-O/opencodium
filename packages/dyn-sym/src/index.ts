import type { Plugin } from "@opencode-ai/plugin";

import { ensureSymDir, symDirExists } from "./symdir";
import { ensureSymDirExcluded } from "./gitexclude";
import { addIgnoreSection } from "./ignorefile";
import { listSymlinks, addSymlink, removeSymlink, clearSymlinks } from "./symlinks";

export type { SymlinkEntry } from "./symlinks";
export { 
  ensureSymDir, 
  symDirExists, 
  getSymDirPath,
  SYM_DIR_NAME,
} from "./symdir";
export { 
  ensureSymDirExcluded, 
  removeSymDirExclude, 
  isGitRepo,
} from "./gitexclude";
export {
  addIgnoreSection,
  removeIgnoreSection,
  ignoreFileExists,
  hasIgnoreSection,
  getIgnoreFilePath,
} from "./ignorefile";
export { 
  addSymlink, 
  removeSymlink, 
  listSymlinks, 
  symlinkExists, 
  clearSymlinks,
} from "./symlinks";

/**
 * Configuration for the dyn-sym plugin.
 */
export interface DynSymConfig {
  /** 
   * List of paths to automatically symlink on init.
   * Can be absolute paths or paths relative to a config location.
   */
  symlinks?: Array<{
    path: string;
    name?: string;
  }>;
}

/**
 * Dynamic Symlinks Plugin
 * 
 * Creates a .sym directory in the worktree root that can contain symlinks
 * to external directories. This allows OpenCode's ripgrep-based discovery
 * to find files in those linked directories.
 * 
 * Key features:
 * - Creates .sym directory on plugin init
 * - Adds .sym to local git exclude (.git/info/exclude) to keep git status clean
 * - Adds negation pattern to .ignore file to make .sym visible to ripgrep
 * - Provides API for managing symlinks programmatically
 * - Symlinks are followed by ripgrep's --follow flag
 * 
 * The .ignore section is added at plugin init and left in place for the session.
 * This ensures .sym is visible to:
 * - All ripgrep-based tools (read, grep, glob, list)
 * - The @ mention autocomplete file picker (uses cached ripgrep results)
 */
export const DynSymPlugin: Plugin = async (input) => {
  const { worktree } = input;
  
  // Initialize on plugin load:
  // 1. Ensure .sym directory exists
  await ensureSymDir(worktree);
  
  // 2. Ensure .sym is in local git exclude (keeps git status clean)
  await ensureSymDirExcluded(worktree);
  
  // 3. Add .ignore section with negation pattern to make .sym visible to ripgrep.
  //    This is done at init (not per-tool-call) because:
  //    - OpenCode caches the file list at startup for @ mention autocomplete
  //    - The cache is built using ripgrep before any tool calls happen
  //    - Leaving the section in place ensures .sym is always discoverable
  await addIgnoreSection(worktree);
  
  // Log current symlinks for debugging
  const currentSymlinks = await listSymlinks(worktree);
  if (currentSymlinks.length > 0) {
    console.log(`[dyn-sym] Found ${currentSymlinks.length} symlink(s) in .sym:`);
    for (const sym of currentSymlinks) {
      const status = sym.targetExists ? "ok" : "broken";
      console.log(`  - ${sym.name} -> ${sym.targetPath} (${status})`);
    }
  }
  
  // No hooks needed - the .ignore section persists for the session
  return {};
};
