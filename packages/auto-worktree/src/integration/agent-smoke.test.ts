/**
 * Agent smoke tests for auto-worktree plugin.
 * 
 * These tests use the opencode CLI and are excluded from the default test run.
 * Run with: bun test ./src/plugins/auto-worktree/integration/agent-smoke.test.ts
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const runAgentSmoke = process.env.RUN_AGENT_SMOKE === "true";

let hasOpencode = false;
try {
  await execAsync("which opencode");
  hasOpencode = true;
} catch {
  hasOpencode = false;
}

const shouldRun = runAgentSmoke && hasOpencode;

describe.skipIf(!shouldRun)("auto-worktree agent smoke", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "auto-worktree-agent-"));
    await execAsync("git init", { cwd: tmpDir });
    await execAsync('git config user.email "test@test.com"', { cwd: tmpDir });
    await execAsync('git config user.name "Test"', { cwd: tmpDir });
    await fs.writeFile(path.join(tmpDir, "README.md"), "# Test\n");
    await execAsync("git add .", { cwd: tmpDir });
    await execAsync('git commit -m "initial"', { cwd: tmpDir });
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("plugin loads without error", async () => {
    // Just verify the plugin can be imported
    const { AutoWorktreePlugin } = await import("../index");
    expect(AutoWorktreePlugin).toBeDefined();
    expect(typeof AutoWorktreePlugin).toBe("function");
  });

  test("plugin initializes in git repo", async () => {
    const { AutoWorktreePlugin } = await import("../index");
    const result = await AutoWorktreePlugin({ directory: tmpDir });
    expect(result).toBeDefined();
    expect(result["tool.execute.before"]).toBeDefined();
  });
});
