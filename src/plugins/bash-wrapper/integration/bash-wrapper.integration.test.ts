/**
 * Component integration tests for bash-wrapper plugin.
 * Tests the plugin hook and template selection with real file system.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

import { BashWrapperPlugin, type BashWrapperConfig } from "../index";
import { applyTemplate } from "../template";
import { evaluateCondition } from "../condition";

interface TestContext {
  testDir: string;
  configDir: string;
}

async function setupTestDir(): Promise<TestContext> {
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), "bash-wrapper-int-"));
  const configDir = path.join(testDir, ".opencode");
  await fs.mkdir(configDir, { recursive: true });
  
  return { testDir, configDir };
}

async function cleanup(ctx: TestContext) {
  await fs.rm(ctx.testDir, { recursive: true, force: true });
}

async function writeConfig(ctx: TestContext, config: BashWrapperConfig) {
  await fs.writeFile(
    path.join(ctx.configDir, "bash-wrapper.json"),
    JSON.stringify(config)
  );
}

/**
 * Mock plugin input matching OpenCode plugin interface.
 */
function mockPluginInput(testDir: string) {
  return {
    directory: testDir,
    worktree: testDir,
  };
}

/**
 * Simulate calling the tool.execute.before hook.
 */
async function callBeforeHook(
  plugin: Awaited<ReturnType<typeof BashWrapperPlugin>>,
  command: string
): Promise<string> {
  const hook = plugin["tool.execute.before"];
  if (!hook) {
    return command; // No wrapping
  }
  
  const details = { tool: "bash", sessionID: "test", callID: "test-1" };
  const state = { args: { command } };
  
  await hook(details, state);
  
  return state.args.command;
}

describe("bash-wrapper integration", () => {
  describe("simple template", () => {
    let ctx: TestContext;

    beforeEach(async () => {
      ctx = await setupTestDir();
    });

    afterEach(async () => {
      await cleanup(ctx);
    });

    it("wraps command with simple template", async () => {
      await writeConfig(ctx, {
        template: 'echo "WRAPPED:" && ${command}',
      });
      
      const plugin = await BashWrapperPlugin(mockPluginInput(ctx.testDir));
      const result = await callBeforeHook(plugin, "ls -la");
      
      expect(result).toBe('echo "WRAPPED:" && ls -la');
    });

    it("returns empty hooks when no config", async () => {
      // No config file
      const plugin = await BashWrapperPlugin(mockPluginInput(ctx.testDir));
      
      expect(plugin).toEqual({});
    });

    it("returns empty hooks when template is passthrough", async () => {
      await writeConfig(ctx, {
        template: "${command}",
      });
      
      const plugin = await BashWrapperPlugin(mockPluginInput(ctx.testDir));
      
      expect(plugin).toEqual({});
    });

    it("handles quoted placeholder", async () => {
      await writeConfig(ctx, {
        template: 'nix-shell --run "${command:quoted}"',
      });
      
      const plugin = await BashWrapperPlugin(mockPluginInput(ctx.testDir));
      const result = await callBeforeHook(plugin, 'echo "hello"');
      
      expect(result).toBe('nix-shell --run "echo \\"hello\\""');
    });

    it("handles single-quoted placeholder", async () => {
      await writeConfig(ctx, {
        template: "ssh host '${command:single}'",
      });
      
      const plugin = await BashWrapperPlugin(mockPluginInput(ctx.testDir));
      const result = await callBeforeHook(plugin, "echo it's working");
      
      expect(result).toBe("ssh host 'echo it'\\''s working'");
    });

    it("ignores non-bash tools", async () => {
      await writeConfig(ctx, {
        template: 'echo "WRAPPED:" && ${command}',
      });
      
      const plugin = await BashWrapperPlugin(mockPluginInput(ctx.testDir));
      const hook = plugin["tool.execute.before"]!;
      
      const details = { tool: "write", sessionID: "test", callID: "test-1" };
      const state = { args: { command: "ignored" } };
      
      await hook(details, state);
      
      // Should not be modified
      expect(state.args.command).toBe("ignored");
    });

    it("handles missing command in args", async () => {
      await writeConfig(ctx, {
        template: 'echo "WRAPPED:" && ${command}',
      });
      
      const plugin = await BashWrapperPlugin(mockPluginInput(ctx.testDir));
      const hook = plugin["tool.execute.before"]!;
      
      const details = { tool: "bash", sessionID: "test", callID: "test-1" };
      const state = { args: { description: "some task" } };
      
      // Should not throw
      await hook(details, state);
      
      expect(state.args).toEqual({ description: "some task" });
    });
  });

  describe("conditional templates", () => {
    let ctx: TestContext;

    beforeEach(async () => {
      ctx = await setupTestDir();
    });

    afterEach(async () => {
      await cleanup(ctx);
    });

    it("uses first matching template when file exists", async () => {
      // Create the file that triggers the condition
      await fs.writeFile(path.join(ctx.testDir, "flake.nix"), "{}");
      
      await writeConfig(ctx, {
        templates: [
          {
            template: 'echo "HAS_FLAKE:" && ${command}',
            when: { file: "flake.nix" },
          },
          {
            template: 'echo "FALLBACK:" && ${command}',
          },
        ],
      });
      
      const plugin = await BashWrapperPlugin(mockPluginInput(ctx.testDir));
      const result = await callBeforeHook(plugin, "echo test");
      
      expect(result).toBe('echo "HAS_FLAKE:" && echo test');
    });

    it("falls back when file condition not met", async () => {
      // No flake.nix file
      await writeConfig(ctx, {
        templates: [
          {
            template: 'echo "HAS_FLAKE:" && ${command}',
            when: { file: "flake.nix" },
          },
          {
            template: 'echo "FALLBACK:" && ${command}',
          },
        ],
      });
      
      const plugin = await BashWrapperPlugin(mockPluginInput(ctx.testDir));
      const result = await callBeforeHook(plugin, "echo test");
      
      expect(result).toBe('echo "FALLBACK:" && echo test');
    });

    it("uses first matching template when command exists", async () => {
      await writeConfig(ctx, {
        templates: [
          {
            template: 'echo "HAS_NONEXISTENT:" && ${command}',
            when: { command: "this-command-does-not-exist-12345" },
          },
          {
            template: 'echo "HAS_LS:" && ${command}',
            when: { command: "ls" },
          },
          {
            template: 'echo "FALLBACK:" && ${command}',
          },
        ],
      });
      
      const plugin = await BashWrapperPlugin(mockPluginInput(ctx.testDir));
      const result = await callBeforeHook(plugin, "echo test");
      
      expect(result).toBe('echo "HAS_LS:" && echo test');
    });

    it("handles combined file and command conditions", async () => {
      await fs.writeFile(path.join(ctx.testDir, "Dockerfile"), "FROM node");
      
      await writeConfig(ctx, {
        templates: [
          {
            template: 'echo "DOCKER+FLAKE:" && ${command}',
            when: { file: "Dockerfile", command: "this-does-not-exist" },
          },
          {
            template: 'echo "DOCKER_ONLY:" && ${command}',
            when: { file: "Dockerfile" },
          },
          {
            template: 'echo "FALLBACK:" && ${command}',
          },
        ],
      });
      
      const plugin = await BashWrapperPlugin(mockPluginInput(ctx.testDir));
      const result = await callBeforeHook(plugin, "echo test");
      
      expect(result).toBe('echo "DOCKER_ONLY:" && echo test');
    });

    it("returns empty when no templates match and no fallback", async () => {
      await writeConfig(ctx, {
        templates: [
          {
            template: 'echo "HAS_FLAKE:" && ${command}',
            when: { file: "flake.nix" },
          },
        ],
      });
      
      const plugin = await BashWrapperPlugin(mockPluginInput(ctx.testDir));
      
      // No matching template, no fallback -> no hooks
      expect(plugin).toEqual({});
    });

    it("unconditional template always matches as fallback", async () => {
      await writeConfig(ctx, {
        templates: [
          {
            template: 'echo "CONDITIONAL:" && ${command}',
            when: { file: "nonexistent.txt" },
          },
          {
            template: 'echo "UNCONDITIONAL:" && ${command}',
            // No 'when' -> always matches
          },
        ],
      });
      
      const plugin = await BashWrapperPlugin(mockPluginInput(ctx.testDir));
      const result = await callBeforeHook(plugin, "echo test");
      
      expect(result).toBe('echo "UNCONDITIONAL:" && echo test');
    });
  });

  describe("upward file search", () => {
    let ctx: TestContext;

    beforeEach(async () => {
      ctx = await setupTestDir();
    });

    afterEach(async () => {
      await cleanup(ctx);
    });

    it("finds file in parent directory", async () => {
      // Create file in testDir
      await fs.writeFile(path.join(ctx.testDir, "marker.txt"), "found");
      
      // Create nested subdirectory
      const subDir = path.join(ctx.testDir, "a", "b", "c");
      await fs.mkdir(subDir, { recursive: true });
      
      // Check from subdirectory
      const result = await evaluateCondition({ file: "marker.txt" }, subDir);
      expect(result).toBe(true);
    });

    it("does not find file above project root", async () => {
      // File doesn't exist anywhere
      const result = await evaluateCondition({ file: "nonexistent-file.xyz" }, ctx.testDir);
      expect(result).toBe(false);
    });
  });

  describe("template escaping", () => {
    it("escapes special chars for double quotes", () => {
      const result = applyTemplate(
        'bash -c "${command:quoted}"',
        'echo "$HOME" && grep "test"'
      );
      
      expect(result).toBe('bash -c "echo \\"\\$HOME\\" && grep \\"test\\""');
    });

    it("escapes single quotes correctly", () => {
      const result = applyTemplate(
        "ssh host '${command:single}'",
        "echo 'hello' && echo 'world'"
      );
      
      expect(result).toBe("ssh host 'echo '\\''hello'\\'' && echo '\\''world'\\'''");
    });

    it("handles mixed placeholders", () => {
      const result = applyTemplate(
        '${command} or "${command:quoted}"',
        'echo "test"'
      );
      
      expect(result).toBe('echo "test" or "echo \\"test\\""');
    });
  });
});
