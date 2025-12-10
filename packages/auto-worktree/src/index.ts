import type { Plugin } from "@opencode-ai/plugin";
import { loadConfig } from "@oc-plugins/shared";
import { setupWorktree, getWorktreeContext } from "./worktree";
import { wrapToolArgs, shouldWrapTool } from "./wrapper";
import { isGitRepo } from "./git";
import { type AutoWorktreeConfig, defaultConfig } from "./config";

export { setupWorktree, getWorktreeContext } from "./worktree";
export { wrapToolArgs, shouldWrapTool } from "./wrapper";
export { generateIdentity, getWorktreeName, type AgentIdentity } from "./identity";
export { setSessionWorktree, getSessionWorktree, clearSessionWorktree, hasSessionWorktree } from "./session";
export { isGitRepo, getGitRoot, ensureBranchExists, worktreeAdd, worktreeRemove, listWorktrees, worktreeExists } from "./git";
export { type AutoWorktreeConfig, defaultConfig } from "./config";

const CONFIG_FILE = "auto-worktree.json";

/**
 * Auto-Worktree Plugin
 * 
 * Automatically creates a git worktree for each session and redirects all
 * file operations to that worktree. This isolates agent changes from the
 * main working directory.
 * 
 * On plugin initialization:
 * - Creates a branch named auto-worktree/<name>-<hash> based on session ID
 * - Creates a worktree at .opencode/worktrees/<name>-<hash>/
 * - Adds .gitignore to .opencode/worktrees/ to ignore worktree contents
 * 
 * On each tool call:
 * - Rewrites file paths to point to the worktree
 * - Wraps bash commands with cd to the worktree
 * 
 * Configuration (auto-worktree.json):
 * - baseDir: directory for OpenCode artifacts (default: ".opencode")
 * - worktreesDir: subdirectory for worktrees (default: "worktrees")
 */
export const AutoWorktreePlugin: Plugin = async (input) => {
  const fileConfig = await loadConfig<AutoWorktreeConfig>(CONFIG_FILE, input.directory);
  const config: Required<AutoWorktreeConfig> = { ...defaultConfig, ...fileConfig };

  // Check if we're in a git repo
  const inGitRepo = await isGitRepo(input.directory);
  if (!inGitRepo) {
    // Not a git repo - plugin is a no-op
    return {};
  }

  // Track whether worktree has been set up for this session
  let worktreeSetupPromise: Promise<void> | null = null;

  return {
    "tool.execute.before": async (
      details: { tool: string; sessionID: string; callID: string },
      state: { args: Record<string, unknown> },
    ) => {
      if (!details?.sessionID) return;
      if (!shouldWrapTool(details.tool)) return;

      // Set up worktree on first tool call (lazy initialization)
      if (!worktreeSetupPromise) {
        worktreeSetupPromise = setupWorktree(details.sessionID, input.directory, config)
          .then(() => undefined)
          .catch((err) => {
            console.error("[auto-worktree] Failed to setup worktree:", err);
          });
      }

      // Wait for worktree to be ready
      await worktreeSetupPromise;

      // Wrap tool arguments to redirect to worktree
      wrapToolArgs({
        sessionID: details.sessionID,
        tool: details.tool,
        args: state.args,
        rootDirectory: input.directory,
      });
    },
  };
};

export default AutoWorktreePlugin;
