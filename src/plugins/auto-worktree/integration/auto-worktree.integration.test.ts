import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";

import {
  setupWorktree,
  getWorktreeContext,
  wrapToolArgs,
  generateIdentity,
  clearSessionWorktree,
  listWorktrees,
  worktreeRemove,
} from "../index";
import { defaultConfig } from "../config";

const execAsync = promisify(exec);

async function createTempGitRepo(): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "auto-worktree-test-"));
  await execAsync("git init", { cwd: tmpDir });
  await execAsync('git config user.email "test@test.com"', { cwd: tmpDir });
  await execAsync('git config user.name "Test"', { cwd: tmpDir });
  // Create initial commit (required for worktree)
  await fs.writeFile(path.join(tmpDir, "README.md"), "# Test\n");
  await execAsync("git add .", { cwd: tmpDir });
  await execAsync('git commit -m "initial"', { cwd: tmpDir });
  return tmpDir;
}

async function cleanupRepo(dir: string, sessionID: string): Promise<void> {
  // Clean up worktree first
  const identity = generateIdentity(sessionID);
  const wtPath = path.join(dir, defaultConfig.baseDir, defaultConfig.worktreesDir, `${identity.middleName}-${identity.hash}`);
  try {
    await worktreeRemove(wtPath, dir);
  } catch {
    // Ignore if doesn't exist
  }
  clearSessionWorktree(sessionID);
  await fs.rm(dir, { recursive: true, force: true });
}

describe("auto-worktree integration", () => {
  let tmpDir: string;
  const sessionID = "integration-test-session";

  beforeEach(async () => {
    tmpDir = await createTempGitRepo();
  });

  afterEach(async () => {
    await cleanupRepo(tmpDir, sessionID);
  });

  describe("setupWorktree", () => {
    test("creates worktree directory", async () => {
      const ctx = await setupWorktree(sessionID, tmpDir, defaultConfig);

      const stat = await fs.stat(ctx.worktreePath);
      expect(stat.isDirectory()).toBe(true);
    });

    test("creates branch with correct name", async () => {
      const ctx = await setupWorktree(sessionID, tmpDir, defaultConfig);

      expect(ctx.branchName).toMatch(/^auto-worktree\/[a-z]+-[a-f0-9]{8}$/);
    });

    test("creates .gitignore in worktrees directory", async () => {
      await setupWorktree(sessionID, tmpDir, defaultConfig);

      const gitignorePath = path.join(tmpDir, defaultConfig.baseDir, defaultConfig.worktreesDir, ".gitignore");
      const content = await fs.readFile(gitignorePath, "utf-8");
      expect(content).toBe("*\n");
    });

    test("returns same context on repeated calls", async () => {
      const ctx1 = await setupWorktree(sessionID, tmpDir, defaultConfig);
      const ctx2 = await setupWorktree(sessionID, tmpDir, defaultConfig);

      expect(ctx1.worktreePath).toBe(ctx2.worktreePath);
      expect(ctx1.branchName).toBe(ctx2.branchName);
    });

    test("worktree appears in git worktree list", async () => {
      const ctx = await setupWorktree(sessionID, tmpDir, defaultConfig);

      const worktrees = await listWorktrees(tmpDir);
      const found = worktrees.find((wt) => wt.worktreePath === ctx.worktreePath);
      expect(found).toBeDefined();
    });

    test("worktree contains same files as main repo", async () => {
      const ctx = await setupWorktree(sessionID, tmpDir, defaultConfig);

      const readmeExists = await fs.stat(path.join(ctx.worktreePath, "README.md"))
        .then(() => true)
        .catch(() => false);
      expect(readmeExists).toBe(true);
    });
  });

  describe("getWorktreeContext", () => {
    test("returns undefined before setup", () => {
      const ctx = getWorktreeContext("nonexistent-session");
      expect(ctx).toBeUndefined();
    });

    test("returns context after setup", async () => {
      await setupWorktree(sessionID, tmpDir, defaultConfig);
      const ctx = getWorktreeContext(sessionID);

      expect(ctx).toBeDefined();
      expect(ctx!.worktreePath).toContain(".opencode/worktrees/");
    });
  });

  describe("file operations in worktree", () => {
    test("can write and read files in worktree", async () => {
      const ctx = await setupWorktree(sessionID, tmpDir, defaultConfig);

      const testFile = path.join(ctx.worktreePath, "test.txt");
      await fs.writeFile(testFile, "hello world");

      const content = await fs.readFile(testFile, "utf-8");
      expect(content).toBe("hello world");
    });

    test("files in worktree don't appear in main repo", async () => {
      const ctx = await setupWorktree(sessionID, tmpDir, defaultConfig);

      const testFile = path.join(ctx.worktreePath, "test.txt");
      await fs.writeFile(testFile, "hello world");

      const mainFile = path.join(tmpDir, "test.txt");
      const exists = await fs.stat(mainFile).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    test("can commit changes in worktree", async () => {
      const ctx = await setupWorktree(sessionID, tmpDir, defaultConfig);

      const testFile = path.join(ctx.worktreePath, "new-file.txt");
      await fs.writeFile(testFile, "content");

      await execAsync("git add new-file.txt", { cwd: ctx.worktreePath });
      await execAsync('git commit -m "add file"', { cwd: ctx.worktreePath });

      const log = await execAsync("git log --oneline", { cwd: ctx.worktreePath });
      expect(log.stdout).toContain("add file");
    });
  });

  describe("wrapToolArgs with real worktree", () => {
    test("rewrites file paths to worktree", async () => {
      const ctx = await setupWorktree(sessionID, tmpDir, defaultConfig);

      const args = { filePath: path.join(tmpDir, "src/app.ts") };
      wrapToolArgs({
        sessionID,
        tool: "read",
        args,
        rootDirectory: tmpDir,
      });

      expect(args.filePath).toBe(path.join(ctx.worktreePath, "src/app.ts"));
    });

    test("sets glob path to worktree", async () => {
      const ctx = await setupWorktree(sessionID, tmpDir, defaultConfig);

      const args = { pattern: "*.ts" };
      wrapToolArgs({
        sessionID,
        tool: "glob",
        args,
        rootDirectory: tmpDir,
      });

      expect(args.path).toBe(ctx.worktreePath);
    });
  });
});
