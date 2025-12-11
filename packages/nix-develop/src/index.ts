import { type Plugin } from "@opencode-ai/plugin"
import { loadPluginConfig } from "@opencodium/shared"
import { existsSync } from "fs"
import { join, dirname, basename } from "path"
import { spawn } from "bun"

export interface NixDevelopConfig {
  /**
   * Whether the plugin is enabled
   * @default true
   */
  enabled?: boolean
  /**
   * Commands/patterns to exclude from nix develop wrapping
   * @default ["nix", "git", "cd", "ls", "pwd", "echo", "cat", "which", "env"]
   */
  exclude?: string[]
  /**
   * Specific flake path to use (relative to workdir or absolute)
   * @default "." (uses flake.nix in working directory)
   */
  flakePath?: string
  /**
   * Specific devShell to use (e.g., "default", "dev", "ci")
   * @default undefined (uses default devShell)
   */
  devShell?: string
}

const DEFAULT_CONFIG: NixDevelopConfig = {
  enabled: true,
  exclude: [],
  flakePath: ".",
}

export const DEFAULT_EXCLUDE = [
  "nix",
  "git",
  "cd",
  "ls",
  "pwd",
  "echo",
  "cat",
  "head",
  "tail",
  "which",
  "env",
  "export",
  "source",
  ".",
]

export function shouldWrap(command: string, exclude: string[]): boolean {
  const trimmed = command.trim()
  const firstWord = trimmed.split(/\s+/)[0]

  // Don't wrap if command starts with an excluded command
  for (const exc of exclude) {
    if (firstWord === exc) {
      return false
    }
  }

  // Don't wrap if already wrapped with nix
  if (trimmed.startsWith("nix ") || trimmed.startsWith("nix-")) {
    return false
  }

  return true
}

/**
 * Find flake.nix in workdir or any parent directory.
 * Returns the directory containing flake.nix, or null if not found.
 */
export function findFlake(workdir: string, flakePath: string): string | null {
  // If explicit flake path is provided, check only that location
  if (flakePath !== ".") {
    const flakeFile = flakePath.endsWith("flake.nix")
      ? flakePath
      : join(flakePath, "flake.nix")
    return existsSync(flakeFile) ? (flakePath.endsWith("flake.nix") ? dirname(flakePath) : flakePath) : null
  }

  // Search up the directory tree
  let dir = workdir
  while (true) {
    const flakeFile = join(dir, "flake.nix")
    if (existsSync(flakeFile)) {
      return dir
    }

    const parent = dirname(dir)
    if (parent === dir) {
      // Reached root
      return null
    }
    dir = parent
  }
}

export function wrapCommand(command: string, flakePath: string, devShell?: string): string {
  const shellArg = devShell ? `#${devShell}` : ""
  const pathArg = flakePath === "." ? "" : flakePath

  if (pathArg && shellArg) {
    return `nix develop ${pathArg}${shellArg} -c bash -c ${JSON.stringify(command)}`
  } else if (pathArg) {
    return `nix develop ${pathArg} -c bash -c ${JSON.stringify(command)}`
  } else if (shellArg) {
    return `nix develop .${shellArg} -c bash -c ${JSON.stringify(command)}`
  } else {
    return `nix develop -c bash -c ${JSON.stringify(command)}`
  }
}

/**
 * Check if a file path is a nix file (.nix extension).
 */
export function isNixFile(filePath: string): boolean {
  return filePath.endsWith(".nix")
}

/**
 * Activate a flake by running `nix develop` to build/cache the devShell.
 * Returns the result of the activation.
 */
export async function activateFlake(
  flakeDir: string,
  devShell?: string
): Promise<{ success: boolean; output: string }> {
  const shellArg = devShell ? `.#${devShell}` : ""
  const args = ["develop", ...(shellArg ? [shellArg] : []), "--command", "true"]

  try {
    const proc = spawn({
      cmd: ["nix", ...args],
      cwd: flakeDir,
      stdout: "pipe",
      stderr: "pipe",
    })

    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited

    if (exitCode === 0) {
      return { success: true, output: "Flake activated successfully" }
    } else {
      return { success: false, output: stderr || stdout || `Exit code: ${exitCode}` }
    }
  } catch (err) {
    return { success: false, output: String(err) }
  }
}

export default (async (ctx) => {
  const loaded = await loadPluginConfig<NixDevelopConfig>("@opencodium/nix-develop", ctx.directory)
  const config = { ...DEFAULT_CONFIG, ...loaded }

  if (!config.enabled) {
    return {}
  }

  const exclude = [...DEFAULT_EXCLUDE, ...(config.exclude ?? [])]
  const flakePath = config.flakePath ?? "."

  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "bash") return

      const command = output.args.command as string
      const workdir = (output.args.workdir as string) ?? ctx.directory

      // Find flake.nix in workdir or parent directories
      const foundFlakePath = findFlake(workdir, flakePath)
      if (!foundFlakePath) {
        return
      }

      // Check if command should be wrapped
      if (!shouldWrap(command, exclude)) {
        return
      }

      // Wrap the command with nix develop, using the found flake path
      const effectiveFlakePath = foundFlakePath === workdir ? "." : foundFlakePath
      output.args.command = wrapCommand(command, effectiveFlakePath, config.devShell)
    },

    "tool.execute.after": async (
      details: { tool: string; callID: string },
      result: { title?: string; output?: string; metadata?: unknown }
    ) => {
      const toolName = details.tool.toLowerCase()
      
      // Only handle write and edit tools
      if (toolName !== "write" && toolName !== "edit") return

      // Check if the file being written/edited is a .nix file
      const meta = result.metadata as { filePath?: string } | undefined
      const filePath = meta?.filePath
      
      if (!filePath || !isNixFile(filePath)) return

      // Find the nearest flake.nix from this file's directory
      const fileDir = dirname(filePath)
      const flakeDir = findFlake(fileDir, flakePath)
      
      if (!flakeDir) return
      
      // Activate the flake
      const activation = await activateFlake(flakeDir, config.devShell)
      
      // Append activation result to the output
      if (result.output) {
        if (activation.success) {
          result.output += `\n\n[Flake activated: ${flakeDir}]`
        } else {
          result.output += `\n\n[Flake activation failed: ${activation.output}]`
        }
      }
    },
  }
}) satisfies Plugin
