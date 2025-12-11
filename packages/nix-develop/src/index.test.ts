import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { isNixFile, extractFilePath } from "./index";

describe("isNixFile", () => {
  it("returns true for .nix files", () => {
    expect(isNixFile("/path/to/flake.nix")).toBe(true);
    expect(isNixFile("flake.nix")).toBe(true);
    expect(isNixFile("/path/to/default.nix")).toBe(true);
    expect(isNixFile("/path/to/shell.nix")).toBe(true);
    expect(isNixFile("custom-module.nix")).toBe(true);
  });

  it("returns false for non-.nix files", () => {
    expect(isNixFile("/path/to/flake.lock")).toBe(false);
    expect(isNixFile("package.json")).toBe(false);
    expect(isNixFile("/path/to/file.txt")).toBe(false);
    expect(isNixFile("script.sh")).toBe(false);
  });

  it("returns false for files with .nix in path but different extension", () => {
    expect(isNixFile("/path/nix/something.txt")).toBe(false);
    expect(isNixFile("/path/to/flake.nix.bak")).toBe(false);
  });
});

describe("extractFilePath", () => {
  it("extracts filepath from write tool metadata", () => {
    const metadata = { filepath: "/path/to/flake.nix" };
    expect(extractFilePath(metadata)).toBe("/path/to/flake.nix");
  });

  it("extracts file from edit tool metadata (filediff.file)", () => {
    const metadata = { 
      filediff: { file: "/path/to/flake.nix" },
      diff: "some diff",
    };
    expect(extractFilePath(metadata)).toBe("/path/to/flake.nix");
  });

  it("falls back to filePath for compatibility", () => {
    const metadata = { filePath: "/path/to/flake.nix" };
    expect(extractFilePath(metadata)).toBe("/path/to/flake.nix");
  });

  it("returns null for missing metadata", () => {
    expect(extractFilePath(null)).toBe(null);
    expect(extractFilePath(undefined)).toBe(null);
    expect(extractFilePath({})).toBe(null);
  });

  it("returns null for non-object metadata", () => {
    expect(extractFilePath("string")).toBe(null);
    expect(extractFilePath(123)).toBe(null);
  });

  it("prioritizes filepath over filediff", () => {
    const metadata = { 
      filepath: "/write/path.nix",
      filediff: { file: "/edit/path.nix" },
    };
    expect(extractFilePath(metadata)).toBe("/write/path.nix");
  });
});
