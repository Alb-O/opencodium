import { tool } from "@opencode-ai/plugin";
import path from "path";
import { mkdir } from "fs/promises";
import { commitFile, getGitRoot } from "./git";
import { setNote } from "./notes";

/**
 * Wrapped write tool that requires a description and commits after each write.
 * Falls back to writing without commit if not in a git repo.
 */
export const writeTool = tool({
  description: "Create or overwrite a file and commit",
  args: {
    filePath: tool.schema
      .string()
      .describe("The absolute path to the file to write"),
    content: tool.schema.string().describe("The content to write to the file"),
    description: tool.schema
      .string()
      .optional()
      .describe(
        "One-line description of what you're creating and why. Used as commit message. Be technical: reference functions, APIs, behavior.",
      ),
  },
  async execute(args, context) {
    const { filePath, content, description } = args;

    const fileDir = path.dirname(filePath);
    const gitRoot = await getGitRoot(fileDir);
    
    // Determine paths: use git-relative if in repo, otherwise absolute
    const relativePath = gitRoot ? path.relative(gitRoot, filePath) : path.basename(filePath);
    const fullPath = gitRoot ? path.join(gitRoot, relativePath) : filePath;

    await mkdir(path.dirname(fullPath), { recursive: true });
    await Bun.write(fullPath, content);

    // Try to commit if we have a description and are in a git repo
    let output: string;
    let diff = "";
    if (gitRoot && description?.trim()) {
      const result = await commitFile(relativePath, description, gitRoot);
      diff = result.diff;
      if (result.committed) {
        output = `Written and committed: ${relativePath}`;
      } else {
        output = `Written: ${relativePath} (commit failed: ${result.error})`;
      }
    } else if (gitRoot) {
      output = `Written: ${relativePath} (no description provided, skipped commit)`;
    } else {
      output = `Written: ${relativePath} (not in git repo)`;
    }

    const callID = (context as { callID?: string }).callID;
    if (callID) {
      setNote(callID, {
        title: relativePath,
        output,
        metadata: { filePath: relativePath, diff },
      });
    }

    return output;
  },
});
