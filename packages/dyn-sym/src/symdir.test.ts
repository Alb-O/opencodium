import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

import { ensureSymDir, symDirExists, getSymDirPath, SYM_DIR_NAME } from "./symdir";

describe("symdir", () => {
  let tempDir: string;
  
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dyn-sym-test-"));
  });
  
  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });
  
  describe("ensureSymDir", () => {
    it("should create .sym directory if it doesn't exist", async () => {
      const symDir = await ensureSymDir(tempDir);
      
      expect(symDir).toBe(path.join(tempDir, SYM_DIR_NAME));
      const stat = await fs.stat(symDir);
      expect(stat.isDirectory()).toBe(true);
    });
    
    it("should not fail if .sym directory already exists", async () => {
      await fs.mkdir(path.join(tempDir, SYM_DIR_NAME));
      
      const symDir = await ensureSymDir(tempDir);
      expect(symDir).toBe(path.join(tempDir, SYM_DIR_NAME));
    });
    
    it("should return consistent path", async () => {
      const symDir1 = await ensureSymDir(tempDir);
      const symDir2 = await ensureSymDir(tempDir);
      
      expect(symDir1).toBe(symDir2);
    });
  });
  
  describe("symDirExists", () => {
    it("should return false if .sym doesn't exist", async () => {
      expect(await symDirExists(tempDir)).toBe(false);
    });
    
    it("should return true if .sym exists", async () => {
      await fs.mkdir(path.join(tempDir, SYM_DIR_NAME));
      
      expect(await symDirExists(tempDir)).toBe(true);
    });
    
    it("should return false if .sym is a file", async () => {
      await fs.writeFile(path.join(tempDir, SYM_DIR_NAME), "not a directory");
      
      expect(await symDirExists(tempDir)).toBe(false);
    });
  });
  
  describe("getSymDirPath", () => {
    it("should return correct path", () => {
      expect(getSymDirPath("/foo/bar")).toBe("/foo/bar/.sym");
    });
    
    it("should handle trailing slash", () => {
      expect(getSymDirPath("/foo/bar/")).toBe("/foo/bar/.sym");
    });
  });
});
