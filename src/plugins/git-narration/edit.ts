import { tool } from "@opencode-ai/plugin";
import path from "path";
import { mkdir } from "fs/promises";
import { createTwoFilesPatch } from "diff";
import { commitFile, getGitRoot } from "./git";
import { setNote } from "./notes";
import type { GitNarrationConfig } from "./config";

/**
 * Create wrapped edit tool that commits after each edit.
 * Falls back to editing without commit based on config.
 */
export function createEditTool(config: GitNarrationConfig) {
  return tool({
    description: "Apply exact string replacement edits to a file and commit",
    args: {
      filePath: tool.schema
        .string()
        .describe("The absolute path to the file to edit"),
      oldString: tool.schema
        .string()
        .describe("The exact string to find and replace"),
      newString: tool.schema.string().describe("The replacement string"),
      replaceAll: tool.schema
        .boolean()
        .optional()
        .default(false)
        .describe("Replace all occurrences of oldString (default: false)"),
      description: tool.schema
        .string()
        .optional()
        .describe(
          "One-line description of what you're changing and why. Used as commit message. Be technical: reference functions, APIs, behavior.",
        ),
    },
    async execute(args, context) {
      const { filePath, oldString, newString, replaceAll = false, description } = args;

      const fileDir = path.dirname(filePath);
      const gitRoot = await getGitRoot(fileDir);
      
      // In strict mode, require git repo
      if (config.strictCommit && !gitRoot) {
        throw new Error(`Not in a git repository: ${filePath}`);
      }
      
      // Determine paths: use git-relative if in repo, otherwise absolute
      const relativePath = gitRoot ? path.relative(gitRoot, filePath) : path.basename(filePath);
      const fullPath = gitRoot ? path.join(gitRoot, relativePath) : filePath;

      await mkdir(path.dirname(fullPath), { recursive: true });

      const current = await Bun.file(fullPath).text();

      const updated = (() => {
        if (replaceAll) {
          const replaced = current.split(oldString).join(newString);
          if (replaced === current) {
            throw new Error(`oldString not found in content: ${oldString}`);
          }
          return replaced;
        }
        const index = current.indexOf(oldString);
        if (index === -1) {
          throw new Error(`oldString not found in content: ${oldString}`);
        }
        const again = current.indexOf(oldString, index + 1);
        if (again !== -1) {
          throw new Error(
            "oldString found multiple times. Provide more context to make it unique, or use replaceAll.",
          );
        }
        return current.slice(0, index) + newString + current.slice(index + oldString.length);
      })();

      await Bun.write(fullPath, updated);

      const rawDiff = createTwoFilesPatch(relativePath, relativePath, current, updated);
      const diff = dedentDiff(rawDiff);

      // Try to commit if we have a description and are in a git repo
      let output: string;
      if (gitRoot && description?.trim()) {
        const result = await commitFile(relativePath, description, gitRoot, config);
        if (result.committed) {
          output = `Edited and committed: ${relativePath}`;
        } else if (config.strictCommit) {
          throw new Error(`Commit failed: ${result.error}`);
        } else {
          output = `Edited: ${relativePath} (commit failed: ${result.error})`;
        }
      } else if (gitRoot) {
        output = `Edited: ${relativePath} (no description provided, skipped commit)`;
      } else {
        output = `Edited: ${relativePath} (not in git repo)`;
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
}

/**
 * Remove common leading indentation from diff content lines.
 */
function dedentDiff(raw: string): string {
  const lines = raw.split("\n");
  const contentLines = lines.filter(
    (line) =>
      (line.startsWith("+") || line.startsWith("-") || line.startsWith(" ")) &&
      !line.startsWith("---") &&
      !line.startsWith("+++"),
  );

  if (contentLines.length === 0) return raw;

  const indent = contentLines.reduce((min, line) => {
    const text = line.slice(1);
    if (text.trim().length === 0) return min;
    const match = text.match(/^(\s*)/);
    return match && match[1].length < min ? match[1].length : min;
  }, Infinity);

  if (!Number.isFinite(indent) || indent === 0) return raw;

  return lines
    .map((line) => {
      if (
        (line.startsWith("+") || line.startsWith("-") || line.startsWith(" ")) &&
        !line.startsWith("---") &&
        !line.startsWith("+++")
      ) {
        return line[0] + line.slice(1 + indent);
      }
      return line;
    })
    .join("\n");
}

// Default export for backwards compatibility
export const editTool = createEditTool({});
