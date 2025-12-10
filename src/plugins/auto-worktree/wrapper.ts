/**
 * Tool argument wrapper.
 * 
 * Rewrites tool arguments to redirect file operations to the worktree.
 */

import path from "path";
import { getSessionWorktree } from "./session";

export interface WrapperInput {
  sessionID: string;
  tool: string;
  args: Record<string, unknown>;
  rootDirectory: string;
}

/**
 * Rewrites a file path to be relative to the worktree.
 * If the path is absolute and within rootDirectory, makes it relative to worktree.
 * If the path is relative, prefixes it with the worktree path.
 */
function rewritePath(filePath: string, worktreePath: string, rootDirectory: string): string {
  if (path.isAbsolute(filePath)) {
    // If path is within the root directory, make it relative to worktree
    const rel = path.relative(rootDirectory, filePath);
    if (!rel.startsWith("..")) {
      return path.join(worktreePath, rel);
    }
    // Path is outside root directory, leave as-is
    return filePath;
  }
  // Relative path - prefix with worktree
  return path.join(worktreePath, filePath);
}

/**
 * Wraps tool arguments to redirect file operations to the worktree.
 * 
 * Handles:
 * - bash: rewrites workdir and prepends cd to command
 * - read/write/edit: rewrites filePath
 * - glob/grep/list: rewrites path
 * 
 * Returns undefined if no worktree is set for the session.
 */
export function wrapToolArgs(input: WrapperInput): void {
  const worktreePath = getSessionWorktree(input.sessionID);
  if (!worktreePath) return;

  const toolName = input.tool.toLowerCase();
  const args = input.args;

  // Handle bash tool
  if (toolName === "bash") {
    // Set workdir to worktree
    const currentWorkdir = typeof args.workdir === "string" ? args.workdir : input.rootDirectory;
    args.workdir = rewritePath(currentWorkdir, worktreePath, input.rootDirectory);

    // Prepend cd to command for safety
    const command = args.command;
    if (typeof command === "string" && command.trim().length) {
      const quoted = JSON.stringify(worktreePath);
      const prefix = `cd ${quoted} && `;
      if (!command.startsWith(prefix)) {
        args.command = `${prefix}(${command})`;
      }
    }
    return;
  }

  // Handle file path tools (read, write, edit)
  if (toolName === "read" || toolName === "write" || toolName === "edit") {
    if (typeof args.filePath === "string") {
      args.filePath = rewritePath(args.filePath, worktreePath, input.rootDirectory);
    }
    return;
  }

  // Handle path-based tools (glob, grep, list)
  if (toolName === "glob" || toolName === "grep" || toolName === "list") {
    if (typeof args.path === "string") {
      args.path = rewritePath(args.path, worktreePath, input.rootDirectory);
    } else {
      // Default path is root directory, redirect to worktree
      args.path = worktreePath;
    }
    return;
  }
}

/**
 * Check if a tool should have its arguments wrapped.
 */
export function shouldWrapTool(toolName: string): boolean {
  const name = toolName.toLowerCase();
  return ["bash", "read", "write", "edit", "glob", "grep", "list"].includes(name);
}
