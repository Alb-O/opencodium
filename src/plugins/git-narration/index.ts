import type { Plugin } from "@opencode-ai/plugin";
import { editTool } from "./edit";
import { writeTool } from "./write";
import { takeNote } from "./notes";

export { editTool } from "./edit";
export { writeTool } from "./write";
export { commitFile, isGitRepo, getGitRoot, type CommitResult } from "./git";
export { setNote, takeNote, type Note } from "./notes";

/**
 * Git Narration Plugin
 * 
 * Replaces the built-in edit and write tools with versions that require
 * a description parameter. Each file change commits immediately using
 * the description as the commit message.
 */
export const GitNarrationPlugin: Plugin = async () => {
  return {
    tool: {
      edit: editTool,
      write: writeTool,
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
