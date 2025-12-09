import type { Plugin } from "@opencode-ai/plugin";

/**
 * Configuration for the bash wrapper plugin.
 * Set this to wrap all bash commands with a prefix.
 * 
 * Examples:
 *   - "nix-shell --run"
 *   - "docker exec -it mycontainer"
 *   - "ssh remote-host"
 */
const WRAP_PREFIX = "";

/**
 * Plugin that wraps all bash commands with a configurable prefix.
 */
export const BashWrapperPlugin: Plugin = async (_input) => {
  return {
    "tool.execute.before": async (
      details: { tool: string; sessionID: string; callID: string },
      state: { args: any },
    ) => {
      if (!state?.args || typeof state.args !== "object") {
        return;
      }

      if (details.tool.toLowerCase() !== "bash") {
        return;
      }

      const command = state.args.command;
      if (typeof command !== "string" || !command.trim()) {
        return;
      }

      if (WRAP_PREFIX) {
        state.args.command = `${WRAP_PREFIX} ${command}`;
      }
    },
  };
};
