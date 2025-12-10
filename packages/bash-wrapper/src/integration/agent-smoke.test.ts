/**
 * Agent smoke tests for bash-wrapper plugin.
 * Require opencode CLI and LLM access.
 * 
 * Run separately with: bun test ./src/plugins/bash-wrapper/integration/agent-smoke.test.ts
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
}

async function setupTestDir(config: object): Promise<TestContext> {
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), "oc-bash-wrapper-smoke-"));
  const configDir = path.join(testDir, ".opencode");
  await fs.mkdir(configDir, { recursive: true });

  const pluginDir = path.join(configDir, "plugin");
  await fs.mkdir(pluginDir, { recursive: true });

  const packageDir = path.resolve(import.meta.dir, "../../");
  await fs.writeFile(
    path.join(pluginDir, "index.ts"),
    `export { BashWrapperPlugin as default } from "${packageDir}/src/index.ts";`
  );

  await fs.writeFile(
    path.join(configDir, "bash-wrapper.json"),
    JSON.stringify(config)
  );

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

describe("bash-wrapper agent smoke tests", () => {
  it(
    "wraps bash commands with configured template",
    async () => {
      const ctx = await setupTestDir({
        template: 'echo "WRAPPED:" && ${command}',
      });

      try {
        const { stdout, exitCode } = await runOpencode(
          ctx.testDir,
          'Run this exact bash command: echo "hello"'
        );

        expect(exitCode).toBe(0);
        expect(stdout).toContain("WRAPPED:");
        expect(stdout).toContain("hello");
      } finally {
        await cleanup(ctx);
      }
    },
    TEST_TIMEOUT
  );

  it(
    "uses conditional template when file exists",
    async () => {
      const ctx = await setupTestDir({
        templates: [
          {
            template: 'echo "HAS_MARKER:" && ${command}',
            when: { file: "marker.txt" },
          },
          {
            template: 'echo "FALLBACK:" && ${command}',
          },
        ],
      });

      // Create the marker file
      await fs.writeFile(path.join(ctx.testDir, "marker.txt"), "marker");

      try {
        const { stdout, exitCode } = await runOpencode(
          ctx.testDir,
          'Run: echo "test"'
        );

        expect(exitCode).toBe(0);
        expect(stdout).toContain("HAS_MARKER:");
        expect(stdout).not.toContain("FALLBACK:");
      } finally {
        await cleanup(ctx);
      }
    },
    TEST_TIMEOUT
  );
});
