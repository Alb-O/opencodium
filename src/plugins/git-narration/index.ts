import type { Plugin } from "@opencode-ai/plugin";
import { loadConfig } from "../../lib/config";
import { createEditTool } from "./edit";
import { createWriteTool } from "./write";
import { takeNote } from "./notes";
import { captureBeforeBash, commitAfterBash, clearSnapshot } from "./bash-tracking";
import { type GitNarrationConfig, defaultConfig } from "./config";

export { createEditTool, editTool } from "./edit";
export { createWriteTool, writeTool } from "./write";
export { commitFile, isGitRepo, getGitRoot, type CommitResult } from "./git";
export { setNote, takeNote, type Note } from "./notes";
export { captureBeforeBash, commitAfterBash, clearSnapshot } from "./bash-tracking";
export { type GitNarrationConfig, defaultConfig } from "./config";

const CONFIG_FILE = "git-narration.json";

/**
 * Git Narration Plugin
 * 
 * Replaces the built-in edit and write tools with versions that commit
 * after each change. Also hooks into bash to commit file changes made
 * by shell commands. The agent's description becomes the commit message.
 * 
 * Configuration (git-narration.json):
 * - lowercaseMessages: lowercase first letter unless code symbol (default: true)
 * - strictCommit: fail if not in repo or commit fails (default: false)
 * - trackBash: commit file changes made by bash commands (default: true)
 */
export const GitNarrationPlugin: Plugin = async (input) => {
  const fileConfig = await loadConfig<GitNarrationConfig>(CONFIG_FILE, input.directory);
  const config: GitNarrationConfig = { ...defaultConfig, ...fileConfig };

  return {
    tool: {
      edit: createEditTool(config),
      write: createWriteTool(config),
    },
    "tool.execute.before": async (
      details: { tool: string; callID: string },
      state: { args: { command?: string; workdir?: string; description?: string } },
    ) => {
      if (config.trackBash === false) return;
      if (details.tool.toLowerCase() !== "bash") return;
      if (!state?.args) return;

      const workdir = state.args.workdir || input.directory;
      const description = state.args.description;
      
      if (description) {
        await captureBeforeBash(details.callID, workdir, description);
      }
    },
    "tool.execute.after": async (
      details: { tool: string; callID: string },
      result: { title: string; output: string; metadata: unknown },
    ) => {
      // Handle edit/write tool notes
      const note = takeNote(details.callID);
      if (note) {
        result.title = note.title;
        result.output = note.output;
        result.metadata = note.metadata;
        return;
      }

      // Handle bash commits
      if (details.tool.toLowerCase() === "bash") {
        const commitResult = await commitAfterBash(details.callID, config);
        if (commitResult && commitResult.committed) {
          const meta = result.metadata as { output?: string } | undefined;
          if (meta && typeof meta.output === "string") {
            meta.output += `\n\n[Committed ${commitResult.files.length} file(s): ${commitResult.message}]`;
          }
        }
      }
    },
  };
};

export default GitNarrationPlugin;
