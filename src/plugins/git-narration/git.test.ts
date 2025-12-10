import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import path from "path";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

import { commitFile, isGitRepo, getGitRoot } from "./git";

describe("git helpers", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "git-narration-test-"));
    await execAsync("git init", { cwd: tempDir });
    await execAsync('git config user.email "test@test.com"', { cwd: tempDir });
    await execAsync('git config user.name "Test"', { cwd: tempDir });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("getGitRoot", () => {
    test("returns repo root from subdirectory", async () => {
      const subdir = path.join(tempDir, "sub", "dir");
      await mkdir(subdir, { recursive: true });
      expect(await getGitRoot(subdir)).toBe(tempDir);
    });

    test("returns null for non-repo", async () => {
      const nonRepo = await mkdtemp(path.join(os.tmpdir(), "not-a-repo-"));
      try {
        expect(await getGitRoot(nonRepo)).toBeNull();
      } finally {
        await rm(nonRepo, { recursive: true, force: true });
      }
    });
  });

  describe("commitFile", () => {
    test("stages, commits, and returns diff", async () => {
      await writeFile(path.join(tempDir, "test.txt"), "hello\nworld\n");

      const result = await commitFile("test.txt", "Add test file", tempDir);

      expect(result.committed).toBe(true);
      expect(result.diff).toContain("+hello");
      expect(result.diff).toContain("+world");

      const log = await execAsync("git log --oneline", { cwd: tempDir });
      expect(log.stdout).toContain("add test file");
    });

    test("lowercases messages by default", async () => {
      await writeFile(path.join(tempDir, "a.txt"), "a");
      await commitFile("a.txt", "Implement feature", tempDir);

      const log = await execAsync("git log --oneline", { cwd: tempDir });
      expect(log.stdout).toContain("implement feature");
    });

    test("preserves case when lowercaseMessages is false", async () => {
      await writeFile(path.join(tempDir, "a.txt"), "a");
      await commitFile("a.txt", "Implement feature", tempDir, { lowercaseMessages: false });

      const log = await execAsync("git log --oneline", { cwd: tempDir });
      expect(log.stdout).toContain("Implement feature");
    });

    test("preserves code symbols regardless of config", async () => {
      await writeFile(path.join(tempDir, "b.txt"), "b");
      await commitFile("b.txt", "parseConfig returns new type", tempDir);
      
      await writeFile(path.join(tempDir, "c.txt"), "c");
      await commitFile("c.txt", "API_KEY now required", tempDir);

      const log = await execAsync("git log --oneline", { cwd: tempDir });
      expect(log.stdout).toContain("parseConfig returns new type");
      expect(log.stdout).toContain("API_KEY now required");
    });

    test("returns error info when commit fails", async () => {
      const result = await commitFile("nonexistent.txt", "Should fail", tempDir);
      
      expect(result.committed).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
