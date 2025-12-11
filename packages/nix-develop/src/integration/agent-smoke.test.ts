/**
 * Agent smoke tests for nix-develop plugin.
 * Require opencode CLI and LLM access.
 * 
 * Run with: RUN_AGENT_SMOKE=true bun test ./src/integration/agent-smoke.test.ts
 */
import { describe, it, expect } from "bun:test";
import { spawn } from "bun";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const OPENCODE_MODEL = "opencode/big-pickle";
const TEST_TIMEOUT = 90_000;
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

interface TestContext {
  testDir: string;
  configDir: string;
}

async function setupTestDir(): Promise<TestContext> {
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), "oc-nix-develop-smoke-"));
  const configDir = path.join(testDir, ".opencode");
  await fs.mkdir(configDir, { recursive: true });

  const pluginDir = path.join(configDir, "plugin");
  await fs.mkdir(pluginDir, { recursive: true });

  const packageDir = path.resolve(import.meta.dir, "../../");
  await fs.writeFile(
    path.join(pluginDir, "index.ts"),
    `export { default } from "${packageDir}/src/index.ts";`
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

describe.skipIf(!shouldRun)("nix-develop agent smoke tests", () => {
  it(
    "activates flake when agent writes flake.nix",
    async () => {
      const ctx = await setupTestDir();

      try {
        const { stdout, exitCode } = await runOpencode(
          ctx.testDir,
          'Create a minimal flake.nix with an empty devShell for x86_64-linux'
        );

        expect(exitCode).toBe(0);
        // Should show flake activation message
        expect(stdout.toLowerCase()).toMatch(/flake|activated|nix/);
        
        // Verify flake.nix was created
        const flakeExists = await fs.access(path.join(ctx.testDir, "flake.nix")).then(() => true).catch(() => false);
        expect(flakeExists).toBe(true);
      } finally {
        await cleanup(ctx);
      }
    },
    TEST_TIMEOUT
  );

  it(
    "activates flake when agent edits a .nix file",
    async () => {
      const ctx = await setupTestDir();

      // Create initial flake
      await fs.writeFile(
        path.join(ctx.testDir, "flake.nix"),
        `{
          inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
          outputs = { self, nixpkgs }: {
            devShells.x86_64-linux.default = nixpkgs.legacyPackages.x86_64-linux.mkShell {
              packages = [];
            };
          };
        }`
      );

      try {
        const { stdout, exitCode } = await runOpencode(
          ctx.testDir,
          'Add the "hello" package to the devShell in flake.nix'
        );

        expect(exitCode).toBe(0);
        // Should show flake activation
        expect(stdout.toLowerCase()).toMatch(/flake|activated/);
      } finally {
        await cleanup(ctx);
      }
    },
    TEST_TIMEOUT
  );
});
