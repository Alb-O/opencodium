import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { exec } from "child_process";
import { promisify } from "util";

import { createEditTool } from "../edit";
import { createWriteTool } from "../write";
import { captureBeforeBash, commitAfterBash, clearSnapshot } from "../bash-tracking";
import { type GitNarrationConfig, defaultConfig } from "../config";

const execAsync = promisify(exec);

interface TestContext {
  testDir: string;
}

/**
 * Set up a temp directory with initialized git repo.
 */
async function setupGitRepo(): Promise<TestContext> {
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), "oc-git-narration-int-"));

  await execAsync("git init", { cwd: testDir });
  await execAsync('git config user.email "test@opencode.ai"', { cwd: testDir });
  await execAsync('git config user.name "OpenCode Test"', { cwd: testDir });

  // Create initial commit
  await fs.writeFile(path.join(testDir, ".gitkeep"), "");
  await execAsync("git add .gitkeep && git commit -m 'init'", { cwd: testDir });

  return { testDir };
}

async function cleanup(ctx: TestContext) {
  await fs.rm(ctx.testDir, { recursive: true, force: true });
}

async function getCommitCount(cwd: string): Promise<number> {
  const { stdout } = await execAsync("git rev-list --count HEAD", { cwd });
  return parseInt(stdout.trim(), 10);
}

async function getLastCommitMessage(cwd: string): Promise<string> {
  const { stdout } = await execAsync('git log -1 --format="%s"', { cwd });
  return stdout.trim();
}

/**
 * Create a mock context object for tool execution.
 */
function mockContext(callID: string = "test-call-1") {
  return { callID };
}

// =============================================================================
// Component Integration Tests - Tools with real git repos
// =============================================================================

describe("git-narration integration", () => {
  describe("writeTool with git repo", () => {
    let ctx: TestContext;

    beforeEach(async () => {
      ctx = await setupGitRepo();
    });

    afterEach(async () => {
      await cleanup(ctx);
    });

    it("creates file and commits with description", async () => {
      const writeTool = createWriteTool(defaultConfig);
      const filePath = path.join(ctx.testDir, "new-file.txt");

      const result = await writeTool.execute(
        {
          filePath,
          content: "Hello World\n",
          description: "Add greeting file",
        },
        mockContext()
      );

      expect(result).toContain("committed");
      expect(await fs.readFile(filePath, "utf-8")).toBe("Hello World\n");

      const commitMsg = await getLastCommitMessage(ctx.testDir);
      expect(commitMsg).toBe("add greeting file");
    });

    it("creates file in subdirectory and commits", async () => {
      const writeTool = createWriteTool(defaultConfig);
      const filePath = path.join(ctx.testDir, "src", "lib", "util.ts");
      const initialCount = await getCommitCount(ctx.testDir);

      const result = await writeTool.execute(
        {
          filePath,
          content: "export const foo = 1;\n",
          description: "Add util module",
        },
        mockContext()
      );

      expect(result).toContain("committed");
      expect(await fs.readFile(filePath, "utf-8")).toBe("export const foo = 1;\n");
      expect(await getCommitCount(ctx.testDir)).toBe(initialCount + 1);

      const commitMsg = await getLastCommitMessage(ctx.testDir);
      expect(commitMsg).toBe("add util module");
    });

    it("skips commit when no description provided", async () => {
      const writeTool = createWriteTool(defaultConfig);
      const filePath = path.join(ctx.testDir, "no-desc.txt");
      const initialCount = await getCommitCount(ctx.testDir);

      const result = await writeTool.execute(
        {
          filePath,
          content: "content\n",
        },
        mockContext()
      );

      expect(result).toContain("no description");
      expect(await getCommitCount(ctx.testDir)).toBe(initialCount);
    });

    it("preserves code symbols in commit message", async () => {
      const writeTool = createWriteTool(defaultConfig);
      const filePath = path.join(ctx.testDir, "config.ts");

      await writeTool.execute(
        {
          filePath,
          content: "export const API_KEY = 'xxx';\n",
          description: "API_KEY constant for auth",
        },
        mockContext()
      );

      const commitMsg = await getLastCommitMessage(ctx.testDir);
      expect(commitMsg).toBe("API_KEY constant for auth");
    });

    it("lowercases regular words in commit message", async () => {
      const writeTool = createWriteTool(defaultConfig);
      const filePath = path.join(ctx.testDir, "feature.ts");

      await writeTool.execute(
        {
          filePath,
          content: "// feature\n",
          description: "Implement new feature",
        },
        mockContext()
      );

      const commitMsg = await getLastCommitMessage(ctx.testDir);
      expect(commitMsg).toBe("implement new feature");
    });

    it("respects lowercaseMessages: false config", async () => {
      const writeTool = createWriteTool({ lowercaseMessages: false });
      const filePath = path.join(ctx.testDir, "upper.ts");

      await writeTool.execute(
        {
          filePath,
          content: "// upper\n",
          description: "Implement Feature",
        },
        mockContext()
      );

      const commitMsg = await getLastCommitMessage(ctx.testDir);
      expect(commitMsg).toBe("Implement Feature");
    });
  });

  describe("editTool with git repo", () => {
    let ctx: TestContext;

    beforeEach(async () => {
      ctx = await setupGitRepo();
      // Create a file to edit
      const filePath = path.join(ctx.testDir, "editable.txt");
      await fs.writeFile(filePath, "Hello World\nSecond line\n");
      await execAsync("git add editable.txt && git commit -m 'add editable'", {
        cwd: ctx.testDir,
      });
    });

    afterEach(async () => {
      await cleanup(ctx);
    });

    it("edits file and commits with description", async () => {
      const editTool = createEditTool(defaultConfig);
      const filePath = path.join(ctx.testDir, "editable.txt");

      const result = await editTool.execute(
        {
          filePath,
          oldString: "Hello World",
          newString: "Goodbye World",
          description: "Change greeting",
        },
        mockContext()
      );

      expect(result).toContain("committed");
      expect(await fs.readFile(filePath, "utf-8")).toBe("Goodbye World\nSecond line\n");

      const commitMsg = await getLastCommitMessage(ctx.testDir);
      expect(commitMsg).toBe("change greeting");
    });

    it("throws when oldString not found", async () => {
      const editTool = createEditTool(defaultConfig);
      const filePath = path.join(ctx.testDir, "editable.txt");

      await expect(
        editTool.execute(
          {
            filePath,
            oldString: "nonexistent",
            newString: "replacement",
            description: "Should fail",
          },
          mockContext()
        )
      ).rejects.toThrow("oldString not found");
    });

    it("throws when oldString found multiple times without replaceAll", async () => {
      const editTool = createEditTool(defaultConfig);
      const filePath = path.join(ctx.testDir, "multi.txt");
      await fs.writeFile(filePath, "foo bar foo baz foo\n");

      await expect(
        editTool.execute(
          {
            filePath,
            oldString: "foo",
            newString: "qux",
            description: "Should fail",
          },
          mockContext()
        )
      ).rejects.toThrow("multiple times");
    });

    it("replaces all occurrences with replaceAll: true", async () => {
      const editTool = createEditTool(defaultConfig);
      const filePath = path.join(ctx.testDir, "multi.txt");
      await fs.writeFile(filePath, "foo bar foo baz foo\n");

      await editTool.execute(
        {
          filePath,
          oldString: "foo",
          newString: "qux",
          replaceAll: true,
          description: "Replace all foo with qux",
        },
        mockContext()
      );

      expect(await fs.readFile(filePath, "utf-8")).toBe("qux bar qux baz qux\n");
    });

    it("skips commit when no description provided", async () => {
      const editTool = createEditTool(defaultConfig);
      const filePath = path.join(ctx.testDir, "editable.txt");
      const initialCount = await getCommitCount(ctx.testDir);

      const result = await editTool.execute(
        {
          filePath,
          oldString: "Hello",
          newString: "Hi",
        },
        mockContext()
      );

      expect(result).toContain("no description");
      expect(await getCommitCount(ctx.testDir)).toBe(initialCount);
    });
  });

  describe("bash tracking integration", () => {
    let ctx: TestContext;

    beforeEach(async () => {
      ctx = await setupGitRepo();
    });

    afterEach(async () => {
      await cleanup(ctx);
    });

    it("captures and commits new files created between before/after", async () => {
      const callID = "bash-call-1";
      const initialCount = await getCommitCount(ctx.testDir);

      await captureBeforeBash(callID, ctx.testDir, "Create new file via bash");

      // Simulate bash creating a file
      await fs.writeFile(path.join(ctx.testDir, "bash-created.txt"), "created by bash\n");

      const result = await commitAfterBash(callID, defaultConfig);

      expect(result).not.toBeNull();
      expect(result!.committed).toBe(true);
      expect(result!.files).toContain("bash-created.txt");
      expect(await getCommitCount(ctx.testDir)).toBe(initialCount + 1);

      const commitMsg = await getLastCommitMessage(ctx.testDir);
      expect(commitMsg).toBe("create new file via bash");
    });

    it("captures and commits modified files", async () => {
      // Create and commit a file first
      await fs.writeFile(path.join(ctx.testDir, "existing.txt"), "original\n");
      await execAsync("git add existing.txt && git commit -m 'add file'", { cwd: ctx.testDir });

      const callID = "bash-call-2";
      await captureBeforeBash(callID, ctx.testDir, "Modify existing file");

      // Simulate bash modifying the file
      await fs.writeFile(path.join(ctx.testDir, "existing.txt"), "modified\n");

      const result = await commitAfterBash(callID, defaultConfig);

      expect(result).not.toBeNull();
      expect(result!.committed).toBe(true);
      expect(result!.files).toContain("existing.txt");
    });

    it("commits multiple changed files in one commit", async () => {
      const callID = "bash-call-3";
      await captureBeforeBash(callID, ctx.testDir, "Create multiple files");

      await fs.writeFile(path.join(ctx.testDir, "file1.txt"), "one\n");
      await fs.writeFile(path.join(ctx.testDir, "file2.txt"), "two\n");
      await fs.writeFile(path.join(ctx.testDir, "file3.txt"), "three\n");

      const result = await commitAfterBash(callID, defaultConfig);

      expect(result).not.toBeNull();
      expect(result!.files.length).toBe(3);
    });

    it("returns null when no files changed", async () => {
      const callID = "bash-call-4";
      await captureBeforeBash(callID, ctx.testDir, "No-op command");

      // Don't change anything

      const result = await commitAfterBash(callID, defaultConfig);
      expect(result).toBeNull();
    });

    it("clearSnapshot prevents commit", async () => {
      const callID = "bash-call-5";
      await captureBeforeBash(callID, ctx.testDir, "Will be cleared");

      clearSnapshot(callID);

      await fs.writeFile(path.join(ctx.testDir, "orphan.txt"), "content\n");

      const result = await commitAfterBash(callID, defaultConfig);
      expect(result).toBeNull();
    });

    it("respects lowercaseMessages config", async () => {
      const callID = "bash-call-6";
      await captureBeforeBash(callID, ctx.testDir, "Create File");

      await fs.writeFile(path.join(ctx.testDir, "upper.txt"), "content\n");

      await commitAfterBash(callID, { lowercaseMessages: false });

      const commitMsg = await getLastCommitMessage(ctx.testDir);
      expect(commitMsg).toBe("Create File");
    });
  });

  describe("strictCommit mode", () => {
    it("writeTool throws when not in git repo with strictCommit: true", async () => {
      const nonGitDir = await fs.mkdtemp(path.join(os.tmpdir(), "oc-no-git-"));

      try {
        const writeTool = createWriteTool({ strictCommit: true });
        const filePath = path.join(nonGitDir, "test.txt");

        await expect(
          writeTool.execute(
            {
              filePath,
              content: "test\n",
              description: "Should fail",
            },
            mockContext()
          )
        ).rejects.toThrow("git repository");
      } finally {
        await fs.rm(nonGitDir, { recursive: true, force: true });
      }
    });

    it("editTool throws when not in git repo with strictCommit: true", async () => {
      const nonGitDir = await fs.mkdtemp(path.join(os.tmpdir(), "oc-no-git-"));

      try {
        // Create file to edit
        await fs.writeFile(path.join(nonGitDir, "test.txt"), "hello\n");

        const editTool = createEditTool({ strictCommit: true });
        const filePath = path.join(nonGitDir, "test.txt");

        await expect(
          editTool.execute(
            {
              filePath,
              oldString: "hello",
              newString: "goodbye",
              description: "Should fail",
            },
            mockContext()
          )
        ).rejects.toThrow("git repository");
      } finally {
        await fs.rm(nonGitDir, { recursive: true, force: true });
      }
    });

    it("writeTool succeeds without git when strictCommit: false", async () => {
      const nonGitDir = await fs.mkdtemp(path.join(os.tmpdir(), "oc-no-git-"));

      try {
        const writeTool = createWriteTool({ strictCommit: false });
        const filePath = path.join(nonGitDir, "test.txt");

        const result = await writeTool.execute(
          {
            filePath,
            content: "test\n",
            description: "Lenient mode",
          },
          mockContext()
        );

        expect(result).toContain("not in git repo");
        expect(await fs.readFile(filePath, "utf-8")).toBe("test\n");
      } finally {
        await fs.rm(nonGitDir, { recursive: true, force: true });
      }
    });
  });

  describe("nested git repos", () => {
    let ctx: TestContext;
    let nestedDir: string;

    beforeEach(async () => {
      ctx = await setupGitRepo();

      // Create a nested git repo
      nestedDir = path.join(ctx.testDir, "nested-repo");
      await fs.mkdir(nestedDir);
      await execAsync("git init", { cwd: nestedDir });
      await execAsync('git config user.email "test@opencode.ai"', { cwd: nestedDir });
      await execAsync('git config user.name "OpenCode Test"', { cwd: nestedDir });
      await fs.writeFile(path.join(nestedDir, ".gitkeep"), "");
      await execAsync("git add .gitkeep && git commit -m 'init nested'", { cwd: nestedDir });
    });

    afterEach(async () => {
      await cleanup(ctx);
    });

    it("commits to correct repo when writing to nested repo", async () => {
      const writeTool = createWriteTool(defaultConfig);
      const filePath = path.join(nestedDir, "nested-file.txt");

      await writeTool.execute(
        {
          filePath,
          content: "in nested repo\n",
          description: "Add file to nested repo",
        },
        mockContext()
      );

      // Should commit to nested repo, not parent
      const nestedCommitMsg = await getLastCommitMessage(nestedDir);
      expect(nestedCommitMsg).toBe("add file to nested repo");

      // Parent repo should still have original last commit
      const parentCommitMsg = await getLastCommitMessage(ctx.testDir);
      expect(parentCommitMsg).toBe("init");
    });
  });
});
