/**
 * Component integration tests for nix-develop plugin.
 * Tests the plugin hook with real file system.
 */
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

import type { PluginInput } from "@opencode-ai/plugin";
import NixDevelopPlugin, { type NixDevelopConfig, isNixFile } from "../index";

interface TestContext {
  testDir: string;
  configDir: string;
}

async function setupTestDir(): Promise<TestContext> {
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), "nix-develop-int-"));
  const configDir = path.join(testDir, ".opencode");
  await fs.mkdir(configDir, { recursive: true });
  
  return { testDir, configDir };
}

async function cleanup(ctx: TestContext) {
  await fs.rm(ctx.testDir, { recursive: true, force: true });
}

async function writeConfig(ctx: TestContext, config: NixDevelopConfig) {
  await fs.writeFile(
    path.join(ctx.configDir, "nix-develop.json"),
    JSON.stringify(config)
  );
}

/**
 * Mock plugin input matching OpenCode plugin interface.
 * We only use directory and worktree in our plugin, so we cast with the
 * required properties and leave the rest as undefined for testing.
 */
function mockPluginInput(testDir: string): PluginInput {
  return {
    directory: testDir,
    worktree: testDir,
    client: undefined as unknown as PluginInput["client"],
    project: undefined as unknown as PluginInput["project"],
    $: undefined as unknown as PluginInput["$"],
  };
}

/**
 * Simulate calling the tool.execute.before hook.
 */
async function callBeforeHook(
  plugin: Awaited<ReturnType<typeof NixDevelopPlugin>>,
  command: string,
  workdir?: string
): Promise<string> {
  const hook = plugin["tool.execute.before"];
  if (!hook) {
    return command; // No wrapping
  }
  
  const details = { tool: "bash", sessionID: "test", callID: "test-1" };
  const state = { args: { command, ...(workdir ? { workdir } : {}) } };
  
  await hook(details, state);
  
  return state.args.command;
}

/**
 * Simulate calling the tool.execute.after hook.
 */
async function callAfterHook(
  plugin: Awaited<ReturnType<typeof NixDevelopPlugin>>,
  tool: string,
  filePath: string
): Promise<{ output?: string }> {
  const hook = plugin["tool.execute.after"];
  if (!hook) {
    return {};
  }
  
  const details = { tool, callID: "test-1" };
  const result = { output: "File written", metadata: { filePath } };
  
  await hook(details, result);
  
  return result;
}

describe("nix-develop integration", () => {
  describe("flake detection", () => {
    let ctx: TestContext;

    beforeEach(async () => {
      ctx = await setupTestDir();
    });

    afterEach(async () => {
      await cleanup(ctx);
    });

    it("wraps command when flake.nix exists", async () => {
      await fs.writeFile(path.join(ctx.testDir, "flake.nix"), "{}");
      
      const plugin = await NixDevelopPlugin(mockPluginInput(ctx.testDir));
      const result = await callBeforeHook(plugin, "cargo build");
      
      expect(result).toBe('nix develop -c bash -c "cargo build"');
    });

    it("does not wrap when flake.nix does not exist", async () => {
      const plugin = await NixDevelopPlugin(mockPluginInput(ctx.testDir));
      const result = await callBeforeHook(plugin, "cargo build");
      
      expect(result).toBe("cargo build");
    });

    it("checks workdir for flake.nix", async () => {
      // Create flake in a subdirectory
      const subDir = path.join(ctx.testDir, "subproject");
      await fs.mkdir(subDir, { recursive: true });
      await fs.writeFile(path.join(subDir, "flake.nix"), "{}");
      
      const plugin = await NixDevelopPlugin(mockPluginInput(ctx.testDir));
      
      // Command in subdir should be wrapped
      const resultWithFlake = await callBeforeHook(plugin, "cargo build", subDir);
      expect(resultWithFlake).toBe('nix develop -c bash -c "cargo build"');
    });

    it("finds flake.nix in parent directory", async () => {
      // Flake in root, command runs in subdir
      await fs.writeFile(path.join(ctx.testDir, "flake.nix"), "{}");
      const subDir = path.join(ctx.testDir, "src", "lib");
      await fs.mkdir(subDir, { recursive: true });
      
      const plugin = await NixDevelopPlugin(mockPluginInput(ctx.testDir));
      
      // Command in nested subdir should find parent flake and use its path
      const result = await callBeforeHook(plugin, "cargo build", subDir);
      expect(result).toBe(`nix develop ${ctx.testDir} -c bash -c "cargo build"`);
    });

    it("finds flake.nix in grandparent directory", async () => {
      await fs.writeFile(path.join(ctx.testDir, "flake.nix"), "{}");
      const deepDir = path.join(ctx.testDir, "src", "components", "ui");
      await fs.mkdir(deepDir, { recursive: true });
      
      const plugin = await NixDevelopPlugin(mockPluginInput(ctx.testDir));
      
      const result = await callBeforeHook(plugin, "bun test", deepDir);
      expect(result).toBe(`nix develop ${ctx.testDir} -c bash -c "bun test"`);
    });

    it("uses '.' when flake is in same dir as command", async () => {
      await fs.writeFile(path.join(ctx.testDir, "flake.nix"), "{}");
      
      const plugin = await NixDevelopPlugin(mockPluginInput(ctx.testDir));
      
      // When running from same dir as flake, should use "."
      const result = await callBeforeHook(plugin, "cargo build", ctx.testDir);
      expect(result).toBe('nix develop -c bash -c "cargo build"');
    });
  });

  describe("command exclusion", () => {
    let ctx: TestContext;

    beforeEach(async () => {
      ctx = await setupTestDir();
      await fs.writeFile(path.join(ctx.testDir, "flake.nix"), "{}");
    });

    afterEach(async () => {
      await cleanup(ctx);
    });

    it("does not wrap git commands", async () => {
      const plugin = await NixDevelopPlugin(mockPluginInput(ctx.testDir));
      const result = await callBeforeHook(plugin, "git status");
      
      expect(result).toBe("git status");
    });

    it("does not wrap nix commands", async () => {
      const plugin = await NixDevelopPlugin(mockPluginInput(ctx.testDir));
      
      const nixBuild = await callBeforeHook(plugin, "nix build");
      expect(nixBuild).toBe("nix build");
      
      const nixShell = await callBeforeHook(plugin, "nix-shell");
      expect(nixShell).toBe("nix-shell");
    });

    it("does not wrap shell builtins", async () => {
      const plugin = await NixDevelopPlugin(mockPluginInput(ctx.testDir));
      
      expect(await callBeforeHook(plugin, "ls -la")).toBe("ls -la");
      expect(await callBeforeHook(plugin, "cd /tmp")).toBe("cd /tmp");
      expect(await callBeforeHook(plugin, "echo hello")).toBe("echo hello");
      expect(await callBeforeHook(plugin, "cat file.txt")).toBe("cat file.txt");
    });

    it("wraps regular commands", async () => {
      const plugin = await NixDevelopPlugin(mockPluginInput(ctx.testDir));
      
      const cargo = await callBeforeHook(plugin, "cargo build");
      expect(cargo).toBe('nix develop -c bash -c "cargo build"');
      
      const python = await callBeforeHook(plugin, "python script.py");
      expect(python).toBe('nix develop -c bash -c "python script.py"');
    });
  });

  describe("configuration", () => {
    let ctx: TestContext;

    beforeEach(async () => {
      ctx = await setupTestDir();
      await fs.writeFile(path.join(ctx.testDir, "flake.nix"), "{}");
    });

    afterEach(async () => {
      await cleanup(ctx);
    });

    it("respects enabled: false", async () => {
      await writeConfig(ctx, { enabled: false });
      
      const plugin = await NixDevelopPlugin(mockPluginInput(ctx.testDir));
      
      expect(plugin).toEqual({});
    });

    it("respects custom exclude list", async () => {
      await writeConfig(ctx, { exclude: ["cargo", "rustc"] });
      
      const plugin = await NixDevelopPlugin(mockPluginInput(ctx.testDir));
      
      // Custom excluded
      expect(await callBeforeHook(plugin, "cargo build")).toBe("cargo build");
      expect(await callBeforeHook(plugin, "rustc main.rs")).toBe("rustc main.rs");
      
      // Not excluded
      const python = await callBeforeHook(plugin, "python script.py");
      expect(python).toBe('nix develop -c bash -c "python script.py"');
    });

    it("respects devShell config", async () => {
      await writeConfig(ctx, { devShell: "ci" });
      
      const plugin = await NixDevelopPlugin(mockPluginInput(ctx.testDir));
      const result = await callBeforeHook(plugin, "cargo test");
      
      expect(result).toBe('nix develop .#ci -c bash -c "cargo test"');
    });

    it("respects custom flakePath", async () => {
      const flakeDir = path.join(ctx.testDir, "nix");
      await fs.mkdir(flakeDir, { recursive: true });
      await fs.writeFile(path.join(flakeDir, "flake.nix"), "{}");
      
      // Remove root flake.nix
      await fs.unlink(path.join(ctx.testDir, "flake.nix"));
      
      await writeConfig(ctx, { flakePath: flakeDir });
      
      const plugin = await NixDevelopPlugin(mockPluginInput(ctx.testDir));
      const result = await callBeforeHook(plugin, "cargo build");
      
      expect(result).toBe(`nix develop ${flakeDir} -c bash -c "cargo build"`);
    });
  });

  describe("non-bash tools", () => {
    let ctx: TestContext;

    beforeEach(async () => {
      ctx = await setupTestDir();
      await fs.writeFile(path.join(ctx.testDir, "flake.nix"), "{}");
    });

    afterEach(async () => {
      await cleanup(ctx);
    });

    it("ignores non-bash tools", async () => {
      const plugin = await NixDevelopPlugin(mockPluginInput(ctx.testDir));
      const hook = plugin["tool.execute.before"]!;
      
      const details = { tool: "write", sessionID: "test", callID: "test-1" };
      const state = { args: { command: "ignored", content: "test" } };
      
      await hook(details, state);
      
      expect(state.args.command).toBe("ignored");
    });
  });

  describe("flake activation", () => {
    let ctx: TestContext;

    beforeEach(async () => {
      ctx = await setupTestDir();
    });

    afterEach(async () => {
      await cleanup(ctx);
    });

    it("triggers activation when flake.nix is written", async () => {
      const flakePath = path.join(ctx.testDir, "flake.nix");
      // Create a minimal valid flake
      await fs.writeFile(flakePath, `{
        inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
        outputs = { self, nixpkgs }: {
          devShells.x86_64-linux.default = nixpkgs.legacyPackages.x86_64-linux.mkShell {};
        };
      }`);
      
      const plugin = await NixDevelopPlugin(mockPluginInput(ctx.testDir));
      const result = await callAfterHook(plugin, "write", flakePath);
      
      // Should have appended activation message
      expect(result.output).toContain("Flake activated");
    });

    it("triggers activation when flake.nix is edited", async () => {
      const flakePath = path.join(ctx.testDir, "flake.nix");
      await fs.writeFile(flakePath, `{
        inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
        outputs = { self, nixpkgs }: {
          devShells.x86_64-linux.default = nixpkgs.legacyPackages.x86_64-linux.mkShell {};
        };
      }`);
      
      const plugin = await NixDevelopPlugin(mockPluginInput(ctx.testDir));
      const result = await callAfterHook(plugin, "edit", flakePath);
      
      expect(result.output).toContain("Flake activated");
    });

    it("does not trigger activation for non-nix files", async () => {
      const filePath = path.join(ctx.testDir, "package.json");
      await fs.writeFile(filePath, "{}");
      
      const plugin = await NixDevelopPlugin(mockPluginInput(ctx.testDir));
      const result = await callAfterHook(plugin, "write", filePath);
      
      // Should not modify output
      expect(result.output).toBe("File written");
      expect(result.output).not.toContain("Flake");
    });

    it("triggers activation when imported .nix file is edited", async () => {
      // Create a valid flake that imports another file
      const flakePath = path.join(ctx.testDir, "flake.nix");
      await fs.writeFile(flakePath, `{
        inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
        outputs = { self, nixpkgs }: {
          devShells.x86_64-linux.default = nixpkgs.legacyPackages.x86_64-linux.mkShell {};
        };
      }`);
      
      // Create an imported nix file
      const importedPath = path.join(ctx.testDir, "shell.nix");
      await fs.writeFile(importedPath, "{ pkgs ? import <nixpkgs> {} }: pkgs.mkShell {}");
      
      const plugin = await NixDevelopPlugin(mockPluginInput(ctx.testDir));
      const result = await callAfterHook(plugin, "edit", importedPath);
      
      // Should find parent flake.nix and activate
      expect(result.output).toContain("Flake activated");
    });

    it("triggers activation for .nix file in subdirectory", async () => {
      // Flake in root
      const flakePath = path.join(ctx.testDir, "flake.nix");
      await fs.writeFile(flakePath, `{
        inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
        outputs = { self, nixpkgs }: {
          devShells.x86_64-linux.default = nixpkgs.legacyPackages.x86_64-linux.mkShell {};
        };
      }`);
      
      // Create nix file in subdirectory
      const nixDir = path.join(ctx.testDir, "nix", "modules");
      await fs.mkdir(nixDir, { recursive: true });
      const modulePath = path.join(nixDir, "dev.nix");
      await fs.writeFile(modulePath, "{ pkgs }: {}");
      
      const plugin = await NixDevelopPlugin(mockPluginInput(ctx.testDir));
      const result = await callAfterHook(plugin, "write", modulePath);
      
      // Should find root flake.nix and activate
      expect(result.output).toContain("Flake activated");
    });

    it("does not trigger if no flake.nix exists in tree", async () => {
      // No flake.nix, just a random .nix file
      const nixPath = path.join(ctx.testDir, "random.nix");
      await fs.writeFile(nixPath, "{}");
      
      const plugin = await NixDevelopPlugin(mockPluginInput(ctx.testDir));
      const result = await callAfterHook(plugin, "write", nixPath);
      
      // Should not modify output since no flake found
      expect(result.output).toBe("File written");
    });

    it("reports failure for invalid flake", async () => {
      const flakePath = path.join(ctx.testDir, "flake.nix");
      // Invalid flake content
      await fs.writeFile(flakePath, "this is not valid nix");
      
      const plugin = await NixDevelopPlugin(mockPluginInput(ctx.testDir));
      const result = await callAfterHook(plugin, "edit", flakePath);
      
      expect(result.output).toContain("Flake activation failed");
    });

    it("ignores other tools", async () => {
      const flakePath = path.join(ctx.testDir, "flake.nix");
      await fs.writeFile(flakePath, "{}");
      
      const plugin = await NixDevelopPlugin(mockPluginInput(ctx.testDir));
      const result = await callAfterHook(plugin, "bash", flakePath);
      
      // Should not trigger activation for bash tool
      expect(result.output).toBe("File written");
    });
  });
});
