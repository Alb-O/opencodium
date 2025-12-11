/**
 * Component integration tests for nix-develop plugin.
 * Tests the flake activation hook with real file system.
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
 * Simulate calling the tool.execute.after hook.
 * Uses correct metadata structures matching opencode's edit/write tools.
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
  
  // Match actual metadata structures from opencode tools
  const metadata = tool === "edit" 
    ? { filediff: { file: filePath }, diff: "" }  // Edit tool structure
    : { filepath: filePath };  // Write tool structure
  
  const result = { output: "File written", metadata };
  
  await hook(details, result);
  
  return result;
}

describe("nix-develop integration", () => {
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

    it("ignores non-write/edit tools", async () => {
      const flakePath = path.join(ctx.testDir, "flake.nix");
      await fs.writeFile(flakePath, "{}");
      
      const plugin = await NixDevelopPlugin(mockPluginInput(ctx.testDir));
      const result = await callAfterHook(plugin, "bash", flakePath);
      
      // Should not trigger activation for bash tool
      expect(result.output).toBe("File written");
    });

    it("respects enabled: false config", async () => {
      await writeConfig(ctx, { enabled: false });
      
      const flakePath = path.join(ctx.testDir, "flake.nix");
      await fs.writeFile(flakePath, `{
        inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
        outputs = { self, nixpkgs }: {
          devShells.x86_64-linux.default = nixpkgs.legacyPackages.x86_64-linux.mkShell {};
        };
      }`);
      
      const plugin = await NixDevelopPlugin(mockPluginInput(ctx.testDir));
      
      // Plugin should return empty hooks when disabled
      expect(plugin).toEqual({});
    });
  });
});
