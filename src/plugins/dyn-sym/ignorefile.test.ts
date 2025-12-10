import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  getIgnoreFilePath,
  addIgnoreSection,
  removeIgnoreSection,
  ignoreFileExists,
  hasIgnoreSection,
} from "./ignorefile";
import { SYM_DIR_NAME } from "./symdir";

describe("ignorefile", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dyn-sym-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("getIgnoreFilePath", () => {
    it("should return correct path", () => {
      expect(getIgnoreFilePath("/foo/bar")).toBe("/foo/bar/.ignore");
    });
  });

  describe("addIgnoreSection", () => {
    it("should create .ignore file with negation pattern", async () => {
      await addIgnoreSection(tempDir);

      const content = await fs.readFile(
        path.join(tempDir, ".ignore"),
        "utf-8"
      );

      expect(content).toContain(`!/${SYM_DIR_NAME}/`);
      expect(content).toContain("dyn-sym plugin");
    });

    it("should preserve existing user content", async () => {
      await fs.writeFile(path.join(tempDir, ".ignore"), "*.log\nnode_modules/\n");

      await addIgnoreSection(tempDir);

      const content = await fs.readFile(
        path.join(tempDir, ".ignore"),
        "utf-8"
      );

      expect(content).toContain("*.log");
      expect(content).toContain("node_modules/");
      expect(content).toContain(`!/${SYM_DIR_NAME}/`);
    });

    it("should not duplicate section on repeated calls", async () => {
      await addIgnoreSection(tempDir);
      await addIgnoreSection(tempDir);

      const content = await fs.readFile(
        path.join(tempDir, ".ignore"),
        "utf-8"
      );

      const matches = content.match(/dyn-sym plugin/g) || [];
      expect(matches.length).toBe(1);
    });
  });

  describe("removeIgnoreSection", () => {
    it("should remove managed section", async () => {
      await addIgnoreSection(tempDir);
      expect(await hasIgnoreSection(tempDir)).toBe(true);

      await removeIgnoreSection(tempDir);

      expect(await hasIgnoreSection(tempDir)).toBe(false);
    });

    it("should delete file if it becomes empty", async () => {
      await addIgnoreSection(tempDir);
      expect(await ignoreFileExists(tempDir)).toBe(true);

      await removeIgnoreSection(tempDir);

      expect(await ignoreFileExists(tempDir)).toBe(false);
    });

    it("should preserve user content when removing section", async () => {
      await fs.writeFile(path.join(tempDir, ".ignore"), "*.log\nnode_modules/\n");
      await addIgnoreSection(tempDir);

      await removeIgnoreSection(tempDir);

      const content = await fs.readFile(
        path.join(tempDir, ".ignore"),
        "utf-8"
      );

      expect(content).toContain("*.log");
      expect(content).toContain("node_modules/");
      expect(content).not.toContain("dyn-sym");
      expect(content).not.toContain(SYM_DIR_NAME);
    });

    it("should not throw if .ignore doesn't exist", async () => {
      await expect(removeIgnoreSection(tempDir)).resolves.toBeUndefined();
    });

    it("should not throw if section doesn't exist", async () => {
      await fs.writeFile(path.join(tempDir, ".ignore"), "*.log\n");

      await expect(removeIgnoreSection(tempDir)).resolves.toBeUndefined();

      const content = await fs.readFile(
        path.join(tempDir, ".ignore"),
        "utf-8"
      );
      expect(content).toContain("*.log");
    });
  });

  describe("ignoreFileExists", () => {
    it("should return false if .ignore doesn't exist", async () => {
      expect(await ignoreFileExists(tempDir)).toBe(false);
    });

    it("should return true if .ignore exists", async () => {
      await addIgnoreSection(tempDir);

      expect(await ignoreFileExists(tempDir)).toBe(true);
    });
  });

  describe("hasIgnoreSection", () => {
    it("should return false if .ignore doesn't exist", async () => {
      expect(await hasIgnoreSection(tempDir)).toBe(false);
    });

    it("should return false if .ignore exists but has no section", async () => {
      await fs.writeFile(path.join(tempDir, ".ignore"), "*.log\n");

      expect(await hasIgnoreSection(tempDir)).toBe(false);
    });

    it("should return true if section exists", async () => {
      await addIgnoreSection(tempDir);

      expect(await hasIgnoreSection(tempDir)).toBe(true);
    });
  });
});
