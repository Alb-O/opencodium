import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { shouldWrap, findFlake, wrapCommand, isNixFile, DEFAULT_EXCLUDE } from "./index";

describe("shouldWrap", () => {
  it("returns true for regular commands", () => {
    expect(shouldWrap("cargo build", DEFAULT_EXCLUDE)).toBe(true);
  });

  it("returns true for commands with arguments", () => {
    expect(shouldWrap("python script.py --verbose", DEFAULT_EXCLUDE)).toBe(true);
  });

  it("returns false for excluded commands", () => {
    expect(shouldWrap("git status", DEFAULT_EXCLUDE)).toBe(false);
    expect(shouldWrap("ls -la", DEFAULT_EXCLUDE)).toBe(false);
    expect(shouldWrap("cd /some/path", DEFAULT_EXCLUDE)).toBe(false);
    expect(shouldWrap("echo hello", DEFAULT_EXCLUDE)).toBe(false);
    expect(shouldWrap("cat file.txt", DEFAULT_EXCLUDE)).toBe(false);
  });

  it("returns false for nix commands", () => {
    expect(shouldWrap("nix build", DEFAULT_EXCLUDE)).toBe(false);
    expect(shouldWrap("nix develop", DEFAULT_EXCLUDE)).toBe(false);
    expect(shouldWrap("nix-shell", DEFAULT_EXCLUDE)).toBe(false);
    expect(shouldWrap("nix-build", DEFAULT_EXCLUDE)).toBe(false);
  });

  it("handles custom exclude list", () => {
    const exclude = ["cargo", "rustc"];
    expect(shouldWrap("cargo build", exclude)).toBe(false);
    expect(shouldWrap("rustc main.rs", exclude)).toBe(false);
    expect(shouldWrap("python script.py", exclude)).toBe(true);
  });

  it("handles whitespace in commands", () => {
    expect(shouldWrap("  cargo build  ", DEFAULT_EXCLUDE)).toBe(true);
    expect(shouldWrap("  git status  ", DEFAULT_EXCLUDE)).toBe(false);
  });

  it("only matches first word", () => {
    // "git" in args should not trigger exclusion
    expect(shouldWrap("cargo build --git", DEFAULT_EXCLUDE)).toBe(true);
  });
});

describe("findFlake", () => {
  let testDir: string;

  beforeAll(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "nix-develop-test-"));
    await fs.writeFile(path.join(testDir, "flake.nix"), "{}");
    await fs.mkdir(path.join(testDir, "subdir"), { recursive: true });
    await fs.mkdir(path.join(testDir, "subdir", "nested"), { recursive: true });
    await fs.mkdir(path.join(testDir, "with-flake"), { recursive: true });
    await fs.writeFile(path.join(testDir, "with-flake", "flake.nix"), "{}");
    await fs.mkdir(path.join(testDir, "no-flake"), { recursive: true });
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("returns dir when flake.nix exists in workdir", () => {
    expect(findFlake(testDir, ".")).toBe(testDir);
  });

  it("finds flake.nix in parent directory", () => {
    const subdir = path.join(testDir, "subdir");
    expect(findFlake(subdir, ".")).toBe(testDir);
  });

  it("finds flake.nix in grandparent directory", () => {
    const nested = path.join(testDir, "subdir", "nested");
    expect(findFlake(nested, ".")).toBe(testDir);
  });

  it("returns null when no flake.nix exists in tree", () => {
    // Use /tmp which shouldn't have a flake.nix
    expect(findFlake("/tmp", ".")).toBe(null);
  });

  it("handles custom flake path", () => {
    const flakePath = path.join(testDir, "with-flake");
    expect(findFlake(testDir, flakePath)).toBe(flakePath);
  });

  it("handles absolute path to flake.nix directly", () => {
    const flakePath = path.join(testDir, "flake.nix");
    expect(findFlake(testDir, flakePath)).toBe(testDir);
  });

  it("returns null for nonexistent explicit flake path", () => {
    expect(findFlake(testDir, "/nonexistent/path")).toBe(null);
  });
});

describe("wrapCommand", () => {
  it("wraps simple command with default flake path", () => {
    const result = wrapCommand("cargo build", ".");
    expect(result).toBe('nix develop -c bash -c "cargo build"');
  });

  it("wraps command with quotes", () => {
    const result = wrapCommand('echo "hello world"', ".");
    expect(result).toBe('nix develop -c bash -c "echo \\"hello world\\""');
  });

  it("wraps command with custom flake path", () => {
    const result = wrapCommand("cargo build", "/path/to/flake");
    expect(result).toBe('nix develop /path/to/flake -c bash -c "cargo build"');
  });

  it("wraps command with devShell", () => {
    const result = wrapCommand("cargo build", ".", "dev");
    expect(result).toBe('nix develop .#dev -c bash -c "cargo build"');
  });

  it("wraps command with both custom path and devShell", () => {
    const result = wrapCommand("cargo build", "/path/to/flake", "ci");
    expect(result).toBe('nix develop /path/to/flake#ci -c bash -c "cargo build"');
  });

  it("handles complex commands with pipes and variables", () => {
    const result = wrapCommand("ls -la | grep foo", ".");
    expect(result).toBe('nix develop -c bash -c "ls -la | grep foo"');
  });

  it("handles commands with single quotes", () => {
    const result = wrapCommand("echo 'hello'", ".");
    expect(result).toBe('nix develop -c bash -c "echo \'hello\'"');
  });
});

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
