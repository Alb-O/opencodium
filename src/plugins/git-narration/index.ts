import type { Plugin } from "@opencode-ai/plugin";
import { loadConfig } from "../../lib/config";
import { createEditTool } from "./edit";
import { createWriteTool } from "./write";
import { takeNote } from "./notes";
import { type GitNarrationConfig, defaultConfig } from "./config";

export { createEditTool, editTool } from "./edit";
export { createWriteTool, writeTool } from "./write";
export { commitFile, isGitRepo, getGitRoot, type CommitResult } from "./git";
export { setNote, takeNote, type Note } from "./notes";
export { type GitNarrationConfig, defaultConfig } from "./config";

const CONFIG_FILE = "git-narration.json";

/**
 * Git Narration Plugin
 * 
 * Replaces the built-in edit and write tools with versions that commit
 * after each change. The agent's description becomes the commit message.
 * 
 * Configuration (git-narration.json):
 * - lowercaseMessages: lowercase first letter unless code symbol (default: true)
 * - strictCommit: fail if not in repo or commit fails (default: false)
 */
export const GitNarrationPlugin: Plugin = async (input) => {
  const fileConfig = await loadConfig<GitNarrationConfig>(CONFIG_FILE, input.directory);
  const config: GitNarrationConfig = { ...defaultConfig, ...fileConfig };

  return {
    tool: {
      edit: createEditTool(config),
      write: createWriteTool(config),
    },
    "tool.execute.after": async (
      details: { tool: string; callID: string },
      result: { title: string; output: string; metadata: unknown },
    ) => {
      const note = takeNote(details.callID);
      if (note) {
        result.title = note.title;
        result.output = note.output;
        result.metadata = note.metadata;
      }
    },
  };
};

export default GitNarrationPlugin;
