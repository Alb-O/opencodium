/**
 * Agent smoke tests - require opencode CLI and LLM access.
 * 
 * These tests verify the plugin works end-to-end with real agent tool calls.
 * They are slower and may be flaky due to LLM response variance.
 * 
 * Run separately with: bun test ./src/plugins/git-narration/integration/agent-smoke.test.ts
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { spawn } from "bun";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const OPENCODE_MODEL = "opencode/big-pickle";
const TEST_TIMEOUT = 90_000; // 90 seconds for LLM responses

interface TestContext {
  testDir: string;
  configDir: string;
}

async function setupTestDir(): Promise<TestContext> {
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), "oc-git-narration-smoke-"));
  const configDir = path.join(testDir, ".opencode");
  await fs.mkdir(configDir, { recursive: true });

  // Create plugin directory with re-export
  const pluginDir = path.join(configDir, "plugin");
  await fs.mkdir(pluginDir, { recursive: true });

  const packageDir = path.resolve(import.meta.dir, "../../");
  await fs.writeFile(
    path.join(pluginDir, "index.ts"),
    `export { GitNarrationPlugin as default } from "${packageDir}/src/index.ts";`
  );

  // Initialize git repo
  await execAsync("git init", { cwd: testDir });
  await execAsync('git config user.email "test@opencode.ai"', { cwd: testDir });
  await execAsync('git config user.name "OpenCode Test"', { cwd: testDir });

  // Create initial commit
  await fs.writeFile(path.join(testDir, ".gitkeep"), "");
  await execAsync("git add .gitkeep && git commit -m 'init'", { cwd: testDir });

  return { testDir, configDir };
}

async function cleanup(ctx: TestContext) {
  await fs.rm(ctx.testDir, { recursive: true, force: true });
}

async function runOpencode(
  cwd: string,
  prompt: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = spawn({
    cmd: ["opencode", "run", "--model", OPENCODE_MODEL, "--format", "json", prompt],
    cwd,
    env: {
      ...process.env,
      OPENCODE_PERMISSION: JSON.stringify({ "*": "allow" }),
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return { stdout, stderr, exitCode };
}

async function getCommitCount(cwd: string): Promise<number> {
  const { stdout } = await execAsync("git rev-list --count HEAD", { cwd });
  return parseInt(stdout.trim(), 10);
}

describe("git-narration agent smoke tests", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestDir();
  });

  afterEach(async () => {
    await cleanup(ctx);
  });

  it(
    "agent write tool creates file and commits",
    async () => {
      const initialCount = await getCommitCount(ctx.testDir);

      const { exitCode } = await runOpencode(
        ctx.testDir,
        'Create a file named "hello.txt" containing "Hello from agent" using the write tool.'
      );

      expect(exitCode).toBe(0);

      // File should exist
      const content = await fs.readFile(path.join(ctx.testDir, "hello.txt"), "utf-8");
      expect(content).toContain("Hello");

      // Should have committed
      const finalCount = await getCommitCount(ctx.testDir);
      expect(finalCount).toBeGreaterThan(initialCount);
    },
    TEST_TIMEOUT
  );

  it(
    "agent edit tool modifies file and commits",
    async () => {
      // Create a file to edit
      await fs.writeFile(path.join(ctx.testDir, "editable.txt"), "foo bar baz\n");
      await execAsync("git add editable.txt && git commit -m 'add file'", { cwd: ctx.testDir });

      const initialCount = await getCommitCount(ctx.testDir);

      const { exitCode } = await runOpencode(
        ctx.testDir,
        'In editable.txt, replace "foo" with "qux" using the edit tool.'
      );

      expect(exitCode).toBe(0);

      // File should be modified
      const content = await fs.readFile(path.join(ctx.testDir, "editable.txt"), "utf-8");
      expect(content).toContain("qux");
      expect(content).not.toContain("foo");

      // Should have committed
      const finalCount = await getCommitCount(ctx.testDir);
      expect(finalCount).toBeGreaterThan(initialCount);
    },
    TEST_TIMEOUT
  );
});
