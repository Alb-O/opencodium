import { type Plugin } from "@opencode-ai/plugin"
import { loadPluginConfig, findFileUpward } from "@opencodium/shared"
import { dirname } from "path"
import { spawn } from "bun"

export interface NixDevelopConfig {
  /**
   * Whether the plugin is enabled
   * @default true
   */
  enabled?: boolean
  /**
   * Specific devShell to use (e.g., "default", "dev", "ci")
   * @default undefined (uses default devShell)
   */
  devShell?: string
}

const DEFAULT_CONFIG: NixDevelopConfig = {
  enabled: true,
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

/**
 * Extract file path from tool result metadata.
 * Handles different metadata structures from edit and write tools.
 */
export function extractFilePath(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null
  
  const meta = metadata as Record<string, unknown>
  
  // Write tool: metadata.filepath
  if (typeof meta.filepath === "string") {
    return meta.filepath
  }
  
  // Edit tool: metadata.filediff.file
  if (meta.filediff && typeof meta.filediff === "object") {
    const filediff = meta.filediff as Record<string, unknown>
    if (typeof filediff.file === "string") {
      return filediff.file
    }
  }
  
  // Fallback: metadata.filePath (for compatibility)
  if (typeof meta.filePath === "string") {
    return meta.filePath
  }
  
  return null
}

/**
 * Plugin that activates nix flakes when .nix files are written or edited.
 * 
 * For command wrapping, use @opencodium/bash-wrapper with config:
 * ```json
 * {
 *   "templates": [{
 *     "template": "nix develop -c bash -c \"${command:quoted}\"",
 *     "when": { "file": "flake.nix" }
 *   }]
 * }
 * ```
 */
const NixDevelopPlugin: Plugin = async (ctx) => {
  const loaded = await loadPluginConfig<NixDevelopConfig>("@opencodium/nix-develop", ctx.directory)
  const config = { ...DEFAULT_CONFIG, ...loaded }

  if (!config.enabled) {
    return {}
  }

  return {
    "tool.execute.after": async (
      details: { tool: string; callID: string },
      result: { title?: string; output?: string; metadata?: unknown }
    ) => {
      const toolName = details.tool.toLowerCase()
      
      // Only handle write and edit tools
      if (toolName !== "write" && toolName !== "edit") return

      // Extract file path from metadata (handles different tool structures)
      const filePath = extractFilePath(result.metadata)
      
      if (!filePath || !isNixFile(filePath)) return

      // Find the nearest flake.nix from this file's directory
      const fileDir = dirname(filePath)
      const flakeDir = await findFileUpward("flake.nix", fileDir)
      
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
}

export default NixDevelopPlugin
