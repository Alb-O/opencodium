import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { evaluateCondition, findFileUpward } from "./condition";

describe("evaluateCondition", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "condition-test-"));
    // Create test files
    await fs.writeFile(path.join(testDir, "flake.nix"), "{}");
    await fs.mkdir(path.join(testDir, "subdir", "deep"), { recursive: true });
    await fs.writeFile(path.join(testDir, "subdir", "nested.txt"), "test");
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe("empty condition", () => {
    it("returns true for undefined condition", async () => {
      const result = await evaluateCondition(undefined, testDir);
      expect(result).toBe(true);
    });

    it("returns true for empty object condition", async () => {
      const result = await evaluateCondition({}, testDir);
      expect(result).toBe(true);
    });
  });

  describe("file condition", () => {
    it("returns true when file exists in baseDir", async () => {
      const result = await evaluateCondition({ file: "flake.nix" }, testDir);
      expect(result).toBe(true);
    });

    it("returns false when file does not exist", async () => {
      const result = await evaluateCondition({ file: "nonexistent.txt" }, testDir);
      expect(result).toBe(false);
    });

    it("finds file in parent directory (upward search)", async () => {
      // Search from subdir/deep, should find flake.nix in testDir
      const deepDir = path.join(testDir, "subdir", "deep");
      const result = await evaluateCondition({ file: "flake.nix" }, deepDir);
      expect(result).toBe(true);
    });

    it("finds file in immediate parent", async () => {
      const subdir = path.join(testDir, "subdir");
      const result = await evaluateCondition({ file: "flake.nix" }, subdir);
      expect(result).toBe(true);
    });

    it("works with absolute paths (no upward search)", async () => {
      const absPath = path.join(testDir, "flake.nix");
      const result = await evaluateCondition({ file: absPath }, testDir);
      expect(result).toBe(true);
    });
  });

  describe("command condition", () => {
    it("returns true for common commands", async () => {
      const result = await evaluateCondition({ command: "ls" }, testDir);
      expect(result).toBe(true);
    });

    it("returns false for nonexistent commands", async () => {
      const result = await evaluateCondition({ command: "this-command-does-not-exist-12345" }, testDir);
      expect(result).toBe(false);
    });
  });

  describe("combined conditions", () => {
    it("returns true when all conditions pass", async () => {
      const result = await evaluateCondition(
        { file: "flake.nix", command: "ls" },
        testDir
      );
      expect(result).toBe(true);
    });

    it("returns false when file condition fails", async () => {
      const result = await evaluateCondition(
        { file: "nonexistent.txt", command: "ls" },
        testDir
      );
      expect(result).toBe(false);
    });

    it("returns false when command condition fails", async () => {
      const result = await evaluateCondition(
        { file: "flake.nix", command: "this-command-does-not-exist-12345" },
        testDir
      );
      expect(result).toBe(false);
    });
  });
});

describe("findFileUpward", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "upward-test-"));
    await fs.writeFile(path.join(testDir, "root-marker.txt"), "root");
    await fs.mkdir(path.join(testDir, "a", "b", "c"), { recursive: true });
    await fs.writeFile(path.join(testDir, "a", "mid-marker.txt"), "mid");
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("finds file in current directory", async () => {
    const result = await findFileUpward("root-marker.txt", testDir);
    expect(result).toBe(testDir);
  });

  it("finds file in parent directory", async () => {
    const result = await findFileUpward("root-marker.txt", path.join(testDir, "a"));
    expect(result).toBe(testDir);
  });

  it("finds file multiple levels up", async () => {
    const result = await findFileUpward("root-marker.txt", path.join(testDir, "a", "b", "c"));
    expect(result).toBe(testDir);
  });

  it("finds closest matching file", async () => {
    const result = await findFileUpward("mid-marker.txt", path.join(testDir, "a", "b"));
    expect(result).toBe(path.join(testDir, "a"));
  });

  it("returns null when file not found", async () => {
    const result = await findFileUpward("nonexistent.txt", path.join(testDir, "a", "b"));
    expect(result).toBeNull();
  });
});
