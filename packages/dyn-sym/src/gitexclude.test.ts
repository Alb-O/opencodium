import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

import { 
  isGitRepo, 
  getExcludePath, 
  ensureSymDirExcluded, 
  removeSymDirExclude 
} from "./gitexclude";
import { SYM_DIR_NAME } from "./symdir";

describe("gitexclude", () => {
  let tempDir: string;
  
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dyn-sym-test-"));
  });
  
  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });
  
  describe("isGitRepo", () => {
    it("should return false if no .git directory", async () => {
      expect(await isGitRepo(tempDir)).toBe(false);
    });
    
    it("should return true if .git directory exists", async () => {
      await fs.mkdir(path.join(tempDir, ".git"));
      
      expect(await isGitRepo(tempDir)).toBe(true);
    });
    
    it("should return true if .git is a file (worktree)", async () => {
      await fs.writeFile(path.join(tempDir, ".git"), "gitdir: /path/to/main/.git/worktrees/foo");
      
      expect(await isGitRepo(tempDir)).toBe(true);
    });
  });
  
  describe("getExcludePath", () => {
    it("should return correct path", () => {
      expect(getExcludePath("/foo/bar")).toBe("/foo/bar/.git/info/exclude");
    });
  });
  
  describe("ensureSymDirExcluded", () => {
    it("should return false if not a git repo", async () => {
      const result = await ensureSymDirExcluded(tempDir);
      
      expect(result).toBe(false);
    });
    
    it("should create .git/info/exclude if it doesn't exist", async () => {
      await fs.mkdir(path.join(tempDir, ".git"));
      
      await ensureSymDirExcluded(tempDir);
      
      const excludePath = getExcludePath(tempDir);
      const stat = await fs.stat(excludePath);
      expect(stat.isFile()).toBe(true);
    });
    
    it("should add .sym to exclude file with markers", async () => {
      await fs.mkdir(path.join(tempDir, ".git"));
      
      await ensureSymDirExcluded(tempDir);
      
      const excludePath = getExcludePath(tempDir);
      const content = await fs.readFile(excludePath, "utf-8");
      
      expect(content).toContain("# dyn-sym plugin managed entries");
      expect(content).toContain(`/${SYM_DIR_NAME}/`);
      expect(content).toContain("# end dyn-sym plugin managed entries");
    });
    
    it("should preserve existing exclude content", async () => {
      await fs.mkdir(path.join(tempDir, ".git", "info"), { recursive: true });
      await fs.writeFile(getExcludePath(tempDir), "*.log\n*.tmp\n");
      
      await ensureSymDirExcluded(tempDir);
      
      const content = await fs.readFile(getExcludePath(tempDir), "utf-8");
      expect(content).toContain("*.log");
      expect(content).toContain("*.tmp");
      expect(content).toContain(`/${SYM_DIR_NAME}/`);
    });
    
    it("should not duplicate exclusion on second call", async () => {
      await fs.mkdir(path.join(tempDir, ".git"));
      
      await ensureSymDirExcluded(tempDir);
      await ensureSymDirExcluded(tempDir);
      
      const content = await fs.readFile(getExcludePath(tempDir), "utf-8");
      const matches = content.match(/\.sym/g) || [];
      expect(matches.length).toBe(1);
    });
  });
  
  describe("removeSymDirExclude", () => {
    it("should return false if not a git repo", async () => {
      const result = await removeSymDirExclude(tempDir);
      
      expect(result).toBe(false);
    });
    
    it("should remove managed section from exclude file", async () => {
      await fs.mkdir(path.join(tempDir, ".git"));
      await ensureSymDirExcluded(tempDir);
      
      const result = await removeSymDirExclude(tempDir);
      
      expect(result).toBe(true);
      
      const content = await fs.readFile(getExcludePath(tempDir), "utf-8");
      expect(content).not.toContain("dyn-sym");
      expect(content).not.toContain(SYM_DIR_NAME);
    });
    
    it("should preserve other content when removing", async () => {
      await fs.mkdir(path.join(tempDir, ".git", "info"), { recursive: true });
      await fs.writeFile(getExcludePath(tempDir), "*.log\n");
      await ensureSymDirExcluded(tempDir);
      
      await removeSymDirExclude(tempDir);
      
      const content = await fs.readFile(getExcludePath(tempDir), "utf-8");
      expect(content).toContain("*.log");
      expect(content).not.toContain(SYM_DIR_NAME);
    });
  });
});
