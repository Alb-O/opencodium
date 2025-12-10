/**
 * Agent smoke tests for dyn-sym plugin.
 * Require opencode CLI and LLM access.
 * 
 * Run separately with: bun test ./src/plugins/dyn-sym/integration/agent-smoke.test.ts
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { spawn } from "bun";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const OPENCODE_MODEL = "opencode/big-pickle";
const TEST_TIMEOUT = 90_000;

interface TestContext {
  testDir: string;
  configDir: string;
  externalDir: string;
}

async function setupTestDir(): Promise<TestContext> {
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), "oc-dyn-sym-smoke-"));
  const configDir = path.join(testDir, ".opencode");
  await fs.mkdir(configDir, { recursive: true });

  const pluginDir = path.join(configDir, "plugin");
  await fs.mkdir(pluginDir, { recursive: true });

  const projectRoot = path.resolve(import.meta.dir, "../../../../");
  await fs.writeFile(
    path.join(pluginDir, "index.ts"),
    `export * from "${projectRoot}/src/plugins";`
  );

  // Create .git directory
  await fs.mkdir(path.join(testDir, ".git", "info"), { recursive: true });

  // Create external directory with content
  const externalDir = await fs.mkdtemp(path.join(os.tmpdir(), "oc-dyn-sym-external-"));
  await fs.writeFile(path.join(externalDir, "external-file.txt"), "external content here");

  return { testDir, configDir, externalDir };
}

async function cleanup(ctx: TestContext) {
  await fs.rm(ctx.testDir, { recursive: true, force: true });
  await fs.rm(ctx.externalDir, { recursive: true, force: true });
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

describe("dyn-sym agent smoke tests", () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await setupTestDir();
  });

  afterEach(async () => {
    await cleanup(ctx);
  });

  it(
    "plugin creates .sym directory on agent startup",
    async () => {
      const { exitCode } = await runOpencode(ctx.testDir, 'Run: echo "hello"');

      expect(exitCode).toBe(0);

      const symDir = path.join(ctx.testDir, ".sym");
      const stat = await fs.stat(symDir);
      expect(stat.isDirectory()).toBe(true);
    },
    TEST_TIMEOUT
  );

  it(
    "agent can read files through pre-created symlinks",
    async () => {
      // Pre-create symlink
      const symDir = path.join(ctx.testDir, ".sym");
      await fs.mkdir(symDir, { recursive: true });
      await fs.symlink(ctx.externalDir, path.join(symDir, "external"));

      const { stdout, exitCode } = await runOpencode(
        ctx.testDir,
        'Read the file at .sym/external/external-file.txt and tell me what it contains.'
      );

      expect(exitCode).toBe(0);
      expect(stdout).toContain("external content");
    },
    TEST_TIMEOUT
  );
});
