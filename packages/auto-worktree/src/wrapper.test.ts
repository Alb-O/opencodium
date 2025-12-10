import { describe, expect, test, beforeEach } from "bun:test";
import { wrapToolArgs, shouldWrapTool } from "./wrapper";
import { setSessionWorktree, clearSessionWorktree } from "./session";

describe("wrapper", () => {
  const sessionID = "test-session";
  const worktreePath = "/repo/.agent/wt/alice-12345678";
  const rootDirectory = "/repo";

  beforeEach(() => {
    clearSessionWorktree(sessionID);
  });

  describe("shouldWrapTool", () => {
    test("returns true for bash", () => {
      expect(shouldWrapTool("bash")).toBe(true);
      expect(shouldWrapTool("Bash")).toBe(true);
      expect(shouldWrapTool("BASH")).toBe(true);
    });

    test("returns true for file tools", () => {
      expect(shouldWrapTool("read")).toBe(true);
      expect(shouldWrapTool("write")).toBe(true);
      expect(shouldWrapTool("edit")).toBe(true);
    });

    test("returns true for path tools", () => {
      expect(shouldWrapTool("glob")).toBe(true);
      expect(shouldWrapTool("grep")).toBe(true);
      expect(shouldWrapTool("list")).toBe(true);
    });

    test("returns false for other tools", () => {
      expect(shouldWrapTool("task")).toBe(false);
      expect(shouldWrapTool("webfetch")).toBe(false);
      expect(shouldWrapTool("todowrite")).toBe(false);
    });
  });

  describe("wrapToolArgs", () => {
    describe("without worktree set", () => {
      test("does not modify args", () => {
        const args = { filePath: "/repo/src/file.ts" };
        wrapToolArgs({ sessionID, tool: "read", args, rootDirectory });

        expect(args.filePath).toBe("/repo/src/file.ts");
      });
    });

    describe("with worktree set", () => {
      beforeEach(() => {
        setSessionWorktree(sessionID, worktreePath);
      });

      describe("bash tool", () => {
        test("sets workdir to worktree", () => {
          const args = { command: "ls" };
          wrapToolArgs({ sessionID, tool: "bash", args, rootDirectory });

          expect(args.workdir).toBe(worktreePath);
        });

        test("prepends cd to command", () => {
          const args = { command: "npm test" };
          wrapToolArgs({ sessionID, tool: "bash", args, rootDirectory });

          expect(args.command).toBe(`cd "/repo/.agent/wt/alice-12345678" && (npm test)`);
        });

        test("does not double-wrap command", () => {
          const args = { command: `cd "/repo/.agent/wt/alice-12345678" && (npm test)` };
          wrapToolArgs({ sessionID, tool: "bash", args, rootDirectory });

          expect(args.command).toBe(`cd "/repo/.agent/wt/alice-12345678" && (npm test)`);
        });

        test("rewrites custom workdir", () => {
          const args = { command: "ls", workdir: "/repo/src" };
          wrapToolArgs({ sessionID, tool: "bash", args, rootDirectory });

          expect(args.workdir).toBe("/repo/.agent/wt/alice-12345678/src");
        });
      });

      describe("read/write/edit tools", () => {
        test("rewrites absolute filePath within root", () => {
          const args = { filePath: "/repo/src/file.ts" };
          wrapToolArgs({ sessionID, tool: "read", args, rootDirectory });

          expect(args.filePath).toBe("/repo/.agent/wt/alice-12345678/src/file.ts");
        });

        test("rewrites relative filePath", () => {
          const args = { filePath: "src/file.ts" };
          wrapToolArgs({ sessionID, tool: "write", args, rootDirectory });

          expect(args.filePath).toBe("/repo/.agent/wt/alice-12345678/src/file.ts");
        });

        test("leaves absolute path outside root unchanged", () => {
          const args = { filePath: "/other/path/file.ts" };
          wrapToolArgs({ sessionID, tool: "edit", args, rootDirectory });

          expect(args.filePath).toBe("/other/path/file.ts");
        });
      });

      describe("glob/grep/list tools", () => {
        test("rewrites path argument", () => {
          const args = { path: "/repo/src", pattern: "*.ts" };
          wrapToolArgs({ sessionID, tool: "glob", args, rootDirectory });

          expect(args.path).toBe("/repo/.agent/wt/alice-12345678/src");
        });

        test("sets default path to worktree", () => {
          const args = { pattern: "TODO" };
          wrapToolArgs({ sessionID, tool: "grep", args, rootDirectory });

          expect(args.path).toBe(worktreePath);
        });

        test("rewrites relative path", () => {
          const args = { path: "src" };
          wrapToolArgs({ sessionID, tool: "list", args, rootDirectory });

          expect(args.path).toBe("/repo/.agent/wt/alice-12345678/src");
        });
      });
    });
  });
});
