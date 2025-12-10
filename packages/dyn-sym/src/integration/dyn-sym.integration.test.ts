/**
 * Component integration tests for dyn-sym plugin.
 * Tests the plugin init flow and component interactions with real file system.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

import { DynSymPlugin } from "../index";
import { 
  ensureSymDir, 
  getSymDirPath, 
  SYM_DIR_NAME,
  symDirExists,
} from "../symdir";
import { 
  ensureSymDirExcluded, 
  getExcludePath,
  isGitRepo,
} from "../gitexclude";
import { 
  addIgnoreSection, 
  hasIgnoreSection,
  getIgnoreFilePath,
} from "../ignorefile";
import { 
  addSymlink, 
  listSymlinks, 
  removeSymlink,
  clearSymlinks,
} from "../symlinks";

interface TestContext {
  testDir: string;
  externalDir: string;
}

async function setupTestDir(): Promise<TestContext> {
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), "dyn-sym-int-"));
  
  // Create .git directory to simulate git repo
  await fs.mkdir(path.join(testDir, ".git", "info"), { recursive: true });
  
  // Create an external directory to symlink to
  const externalDir = await fs.mkdtemp(path.join(os.tmpdir(), "dyn-sym-external-"));
  await fs.writeFile(path.join(externalDir, "external-file.txt"), "external content here");
  await fs.mkdir(path.join(externalDir, "subdir"));
  await fs.writeFile(path.join(externalDir, "subdir", "nested-file.txt"), "nested content");
  
  return { testDir, externalDir };
}

async function cleanup(ctx: TestContext) {
  await fs.rm(ctx.testDir, { recursive: true, force: true });
  await fs.rm(ctx.externalDir, { recursive: true, force: true });
}

/**
 * Mock plugin input matching OpenCode plugin interface.
 */
function mockPluginInput(testDir: string) {
  return {
    directory: testDir,
    worktree: testDir,
  };
}

describe("dyn-sym integration", () => {
  describe("plugin initialization", () => {
    let ctx: TestContext;

    beforeEach(async () => {
      ctx = await setupTestDir();
    });

    afterEach(async () => {
      await cleanup(ctx);
    });

    it("creates .sym directory on plugin load", async () => {
      expect(await symDirExists(ctx.testDir)).toBe(false);
      
      await DynSymPlugin(mockPluginInput(ctx.testDir));
      
      expect(await symDirExists(ctx.testDir)).toBe(true);
      const stat = await fs.stat(getSymDirPath(ctx.testDir));
      expect(stat.isDirectory()).toBe(true);
    });

    it("adds .sym to git exclude on plugin load", async () => {
      await DynSymPlugin(mockPluginInput(ctx.testDir));
      
      const excludePath = getExcludePath(ctx.testDir);
      const content = await fs.readFile(excludePath, "utf-8");
      
      expect(content).toContain(`/${SYM_DIR_NAME}/`);
      expect(content).toContain("dyn-sym plugin managed entries");
    });

    it("creates .rgignore with negation pattern on plugin load", async () => {
      await DynSymPlugin(mockPluginInput(ctx.testDir));
      
      expect(await hasIgnoreSection(ctx.testDir)).toBe(true);
      
      const content = await fs.readFile(getIgnoreFilePath(ctx.testDir), "utf-8");
      expect(content).toContain(`!/${SYM_DIR_NAME}/`);
    });

    it("returns empty hooks object (no runtime hooks needed)", async () => {
      const result = await DynSymPlugin(mockPluginInput(ctx.testDir));
      
      expect(result).toEqual({});
    });

    it("logs existing symlinks on init", async () => {
      // Pre-create a symlink
      await ensureSymDir(ctx.testDir);
      await addSymlink(ctx.testDir, ctx.externalDir, "pre-existing");
      
      // Plugin should not throw and should handle existing symlinks
      await DynSymPlugin(mockPluginInput(ctx.testDir));
      
      const symlinks = await listSymlinks(ctx.testDir);
      expect(symlinks.length).toBe(1);
      expect(symlinks[0].name).toBe("pre-existing");
    });
  });

  describe("symlink workflow", () => {
    let ctx: TestContext;

    beforeEach(async () => {
      ctx = await setupTestDir();
      await DynSymPlugin(mockPluginInput(ctx.testDir));
    });

    afterEach(async () => {
      await cleanup(ctx);
    });

    it("adds symlink and can read through it", async () => {
      const entry = await addSymlink(ctx.testDir, ctx.externalDir, "external");
      
      expect(entry.name).toBe("external");
      expect(entry.targetExists).toBe(true);
      
      // Should be able to read files through symlink
      const content = await fs.readFile(
        path.join(entry.linkPath, "external-file.txt"),
        "utf-8"
      );
      expect(content).toBe("external content here");
    });

    it("adds symlink and can traverse subdirectories", async () => {
      const entry = await addSymlink(ctx.testDir, ctx.externalDir, "external");
      
      const content = await fs.readFile(
        path.join(entry.linkPath, "subdir", "nested-file.txt"),
        "utf-8"
      );
      expect(content).toBe("nested content");
    });

    it("lists multiple symlinks", async () => {
      const otherDir = await fs.mkdtemp(path.join(os.tmpdir(), "other-"));
      await fs.writeFile(path.join(otherDir, "other.txt"), "other");
      
      try {
        await addSymlink(ctx.testDir, ctx.externalDir, "link1");
        await addSymlink(ctx.testDir, otherDir, "link2");
        
        const symlinks = await listSymlinks(ctx.testDir);
        expect(symlinks.length).toBe(2);
        
        const names = symlinks.map(s => s.name).sort();
        expect(names).toEqual(["link1", "link2"]);
      } finally {
        await fs.rm(otherDir, { recursive: true, force: true });
      }
    });

    it("removes symlink", async () => {
      await addSymlink(ctx.testDir, ctx.externalDir, "to-remove");
      expect((await listSymlinks(ctx.testDir)).length).toBe(1);
      
      await removeSymlink(ctx.testDir, "to-remove");
      
      expect((await listSymlinks(ctx.testDir)).length).toBe(0);
    });

    it("clears all symlinks", async () => {
      const otherDir = await fs.mkdtemp(path.join(os.tmpdir(), "other-"));
      
      try {
        await addSymlink(ctx.testDir, ctx.externalDir, "link1");
        await addSymlink(ctx.testDir, otherDir, "link2");
        
        const removed = await clearSymlinks(ctx.testDir);
        
        expect(removed).toBe(2);
        expect((await listSymlinks(ctx.testDir)).length).toBe(0);
      } finally {
        await fs.rm(otherDir, { recursive: true, force: true });
      }
    });

    it("detects broken symlinks", async () => {
      await addSymlink(ctx.testDir, ctx.externalDir, "will-break");
      
      // Remove the target
      await fs.rm(ctx.externalDir, { recursive: true, force: true });
      
      const symlinks = await listSymlinks(ctx.testDir);
      expect(symlinks.length).toBe(1);
      expect(symlinks[0].targetExists).toBe(false);
    });
  });

  describe("non-git repo", () => {
    let ctx: TestContext;

    beforeEach(async () => {
      ctx = await setupTestDir();
      // Remove .git directory
      await fs.rm(path.join(ctx.testDir, ".git"), { recursive: true, force: true });
    });

    afterEach(async () => {
      await cleanup(ctx);
    });

    it("plugin still creates .sym directory", async () => {
      await DynSymPlugin(mockPluginInput(ctx.testDir));
      
      expect(await symDirExists(ctx.testDir)).toBe(true);
    });

    it("plugin still creates .rgignore", async () => {
      await DynSymPlugin(mockPluginInput(ctx.testDir));
      
      expect(await hasIgnoreSection(ctx.testDir)).toBe(true);
    });

    it("plugin skips git exclude (no error)", async () => {
      // Should not throw
      await DynSymPlugin(mockPluginInput(ctx.testDir));
      
      // Exclude file should not exist
      const excludePath = getExcludePath(ctx.testDir);
      const exists = await fs.access(excludePath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });
  });

  describe("idempotency", () => {
    let ctx: TestContext;

    beforeEach(async () => {
      ctx = await setupTestDir();
    });

    afterEach(async () => {
      await cleanup(ctx);
    });

    it("multiple plugin loads don't duplicate exclude entries", async () => {
      await DynSymPlugin(mockPluginInput(ctx.testDir));
      await DynSymPlugin(mockPluginInput(ctx.testDir));
      await DynSymPlugin(mockPluginInput(ctx.testDir));
      
      const content = await fs.readFile(getExcludePath(ctx.testDir), "utf-8");
      const matches = content.match(/\.sym/g) || [];
      expect(matches.length).toBe(1);
    });

    it("multiple plugin loads don't duplicate .rgignore entries", async () => {
      await DynSymPlugin(mockPluginInput(ctx.testDir));
      await DynSymPlugin(mockPluginInput(ctx.testDir));
      await DynSymPlugin(mockPluginInput(ctx.testDir));
      
      const content = await fs.readFile(getIgnoreFilePath(ctx.testDir), "utf-8");
      const matches = content.match(/dyn-sym plugin/g) || [];
      expect(matches.length).toBe(1);
    });
  });
});
