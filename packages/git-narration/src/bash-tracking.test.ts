import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import path from "path";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

import { captureBeforeBash, commitAfterBash, clearSnapshot } from "./bash-tracking";

describe("bash tracking", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "bash-tracking-test-"));
    await execAsync("git init", { cwd: tempDir });
    await execAsync('git config user.email "test@test.com"', { cwd: tempDir });
    await execAsync('git config user.name "Test"', { cwd: tempDir });
    // Create initial commit so we have a valid repo state
    await writeFile(path.join(tempDir, ".gitkeep"), "");
    await execAsync("git add .gitkeep && git commit -m 'init'", { cwd: tempDir });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("captures state and commits new files", async () => {
    const callID = "test-call-1";

    // Capture before
    await captureBeforeBash(callID, tempDir, "Create test file");

    // Simulate bash creating a file
    await writeFile(path.join(tempDir, "new-file.txt"), "hello");

    // Commit after
    const result = await commitAfterBash(callID, {});

    expect(result).not.toBeNull();
    expect(result!.committed).toBe(true);
    expect(result!.files).toContain("new-file.txt");

    const log = await execAsync("git log --oneline", { cwd: tempDir });
    expect(log.stdout).toContain("create test file");
  });

  test("detects modified files", async () => {
    // Create a file first
    await writeFile(path.join(tempDir, "existing.txt"), "original");
    await execAsync("git add existing.txt && git commit -m 'add file'", { cwd: tempDir });

    const callID = "test-call-2";
    await captureBeforeBash(callID, tempDir, "Modify existing file");

    // Modify the file
    await writeFile(path.join(tempDir, "existing.txt"), "modified");

    const result = await commitAfterBash(callID, {});

    expect(result).not.toBeNull();
    expect(result!.committed).toBe(true);
    expect(result!.files).toContain("existing.txt");
  });

  test("returns null when no changes", async () => {
    const callID = "test-call-3";
    await captureBeforeBash(callID, tempDir, "No-op command");

    // Don't change anything

    const result = await commitAfterBash(callID, {});
    expect(result).toBeNull();
  });

  test("respects lowercaseMessages config", async () => {
    const callID = "test-call-4";
    await captureBeforeBash(callID, tempDir, "Create File");

    await writeFile(path.join(tempDir, "file.txt"), "content");

    await commitAfterBash(callID, { lowercaseMessages: false });

    const log = await execAsync("git log --oneline", { cwd: tempDir });
    expect(log.stdout).toContain("Create File");
  });

  test("clearSnapshot removes pending snapshot", async () => {
    const callID = "test-call-5";
    await captureBeforeBash(callID, tempDir, "Will be cleared");

    clearSnapshot(callID);

    await writeFile(path.join(tempDir, "orphan.txt"), "content");

    const result = await commitAfterBash(callID, {});
    expect(result).toBeNull();
  });
});
