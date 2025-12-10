import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

import { 
  addSymlink, 
  removeSymlink, 
  listSymlinks, 
  symlinkExists, 
  clearSymlinks 
} from "./symlinks";
import { ensureSymDir, getSymDirPath } from "./symdir";

describe("symlinks", () => {
  let tempDir: string;
  let targetDir: string;
  
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dyn-sym-test-"));
    targetDir = await fs.mkdtemp(path.join(os.tmpdir(), "dyn-sym-target-"));
    
    // Create some files in target dir
    await fs.writeFile(path.join(targetDir, "file1.txt"), "content1");
    await fs.mkdir(path.join(targetDir, "subdir"));
    await fs.writeFile(path.join(targetDir, "subdir", "file2.txt"), "content2");
  });
  
  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.rm(targetDir, { recursive: true, force: true });
  });
  
  describe("addSymlink", () => {
    it("should create symlink in .sym directory", async () => {
      await ensureSymDir(tempDir);
      
      const entry = await addSymlink(tempDir, targetDir);
      
      expect(entry.name).toBe(path.basename(targetDir));
      expect(entry.targetPath).toBe(targetDir);
      expect(entry.targetExists).toBe(true);
      
      // Verify symlink works
      const linkedContent = await fs.readFile(
        path.join(entry.linkPath, "file1.txt"), 
        "utf-8"
      );
      expect(linkedContent).toBe("content1");
    });
    
    it("should create .sym directory if it doesn't exist", async () => {
      const entry = await addSymlink(tempDir, targetDir);
      
      const symDir = getSymDirPath(tempDir);
      const stat = await fs.stat(symDir);
      expect(stat.isDirectory()).toBe(true);
      expect(entry.linkPath).toContain(symDir);
    });
    
    it("should use custom name when provided", async () => {
      const entry = await addSymlink(tempDir, targetDir, "my-custom-name");
      
      expect(entry.name).toBe("my-custom-name");
      expect(entry.linkPath).toContain("my-custom-name");
    });
    
    it("should throw if target doesn't exist", async () => {
      await expect(
        addSymlink(tempDir, "/nonexistent/path")
      ).rejects.toThrow("Target does not exist");
    });
    
    it("should replace symlink if pointing to different target", async () => {
      const otherTarget = await fs.mkdtemp(path.join(os.tmpdir(), "other-"));
      await fs.writeFile(path.join(otherTarget, "other.txt"), "other content");
      
      try {
        await addSymlink(tempDir, targetDir, "shared-name");
        const entry = await addSymlink(tempDir, otherTarget, "shared-name");
        
        expect(entry.targetPath).toBe(otherTarget);
        
        // Verify it points to new target
        const content = await fs.readFile(
          path.join(entry.linkPath, "other.txt"),
          "utf-8"
        );
        expect(content).toBe("other content");
      } finally {
        await fs.rm(otherTarget, { recursive: true, force: true });
      }
    });
    
    it("should handle same target gracefully", async () => {
      const entry1 = await addSymlink(tempDir, targetDir, "same-name");
      const entry2 = await addSymlink(tempDir, targetDir, "same-name");
      
      expect(entry1.linkPath).toBe(entry2.linkPath);
      expect(entry1.targetPath).toBe(entry2.targetPath);
    });
  });
  
  describe("removeSymlink", () => {
    it("should remove existing symlink", async () => {
      await addSymlink(tempDir, targetDir, "to-remove");
      
      const result = await removeSymlink(tempDir, "to-remove");
      
      expect(result).toBe(true);
      expect(await symlinkExists(tempDir, "to-remove")).toBe(false);
    });
    
    it("should return false if symlink doesn't exist", async () => {
      await ensureSymDir(tempDir);
      
      const result = await removeSymlink(tempDir, "nonexistent");
      
      expect(result).toBe(false);
    });
    
    it("should throw if path is not a symlink", async () => {
      await ensureSymDir(tempDir);
      const symDir = getSymDirPath(tempDir);
      await fs.writeFile(path.join(symDir, "regular-file"), "content");
      
      await expect(
        removeSymlink(tempDir, "regular-file")
      ).rejects.toThrow("not a symlink");
    });
  });
  
  describe("listSymlinks", () => {
    it("should return empty array if .sym doesn't exist", async () => {
      const result = await listSymlinks(tempDir);
      
      expect(result).toEqual([]);
    });
    
    it("should return empty array if .sym is empty", async () => {
      await ensureSymDir(tempDir);
      
      const result = await listSymlinks(tempDir);
      
      expect(result).toEqual([]);
    });
    
    it("should list all symlinks", async () => {
      const otherTarget = await fs.mkdtemp(path.join(os.tmpdir(), "other-"));
      
      try {
        await addSymlink(tempDir, targetDir, "link1");
        await addSymlink(tempDir, otherTarget, "link2");
        
        const result = await listSymlinks(tempDir);
        
        expect(result.length).toBe(2);
        
        const names = result.map(r => r.name).sort();
        expect(names).toEqual(["link1", "link2"]);
      } finally {
        await fs.rm(otherTarget, { recursive: true, force: true });
      }
    });
    
    it("should detect broken symlinks", async () => {
      await addSymlink(tempDir, targetDir, "will-break");
      
      // Remove the target
      await fs.rm(targetDir, { recursive: true, force: true });
      
      const result = await listSymlinks(tempDir);
      
      expect(result.length).toBe(1);
      expect(result[0].targetExists).toBe(false);
    });
    
    it("should skip non-symlink files", async () => {
      await ensureSymDir(tempDir);
      const symDir = getSymDirPath(tempDir);
      
      await addSymlink(tempDir, targetDir, "real-symlink");
      await fs.writeFile(path.join(symDir, "regular-file"), "content");
      
      const result = await listSymlinks(tempDir);
      
      expect(result.length).toBe(1);
      expect(result[0].name).toBe("real-symlink");
    });
  });
  
  describe("symlinkExists", () => {
    it("should return false if symlink doesn't exist", async () => {
      expect(await symlinkExists(tempDir, "nonexistent")).toBe(false);
    });
    
    it("should return true if symlink exists", async () => {
      await addSymlink(tempDir, targetDir, "exists");
      
      expect(await symlinkExists(tempDir, "exists")).toBe(true);
    });
    
    it("should return false for regular files", async () => {
      await ensureSymDir(tempDir);
      const symDir = getSymDirPath(tempDir);
      await fs.writeFile(path.join(symDir, "not-a-symlink"), "content");
      
      expect(await symlinkExists(tempDir, "not-a-symlink")).toBe(false);
    });
  });
  
  describe("clearSymlinks", () => {
    it("should return 0 if no symlinks", async () => {
      await ensureSymDir(tempDir);
      
      const removed = await clearSymlinks(tempDir);
      
      expect(removed).toBe(0);
    });
    
    it("should remove all symlinks", async () => {
      const otherTarget = await fs.mkdtemp(path.join(os.tmpdir(), "other-"));
      
      try {
        await addSymlink(tempDir, targetDir, "link1");
        await addSymlink(tempDir, otherTarget, "link2");
        
        const removed = await clearSymlinks(tempDir);
        
        expect(removed).toBe(2);
        expect(await listSymlinks(tempDir)).toEqual([]);
      } finally {
        await fs.rm(otherTarget, { recursive: true, force: true });
      }
    });
    
    it("should not remove non-symlink files", async () => {
      await ensureSymDir(tempDir);
      const symDir = getSymDirPath(tempDir);
      
      await addSymlink(tempDir, targetDir, "a-symlink");
      await fs.writeFile(path.join(symDir, "keep-me"), "content");
      
      const removed = await clearSymlinks(tempDir);
      
      expect(removed).toBe(1);
      
      const keepMe = await fs.readFile(path.join(symDir, "keep-me"), "utf-8");
      expect(keepMe).toBe("content");
    });
  });
});
