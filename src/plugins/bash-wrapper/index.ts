import type { Plugin } from "@opencode-ai/plugin";
import { loadConfig } from "../../lib/config";
import { applyTemplate } from "./template";
import { evaluateCondition, type Condition } from "./condition";

/**
 * A template rule with an optional condition.
 */
export interface TemplateRule {
  /** Template string with ${command} placeholder */
  template: string;
  /** Optional condition - if specified, must pass for this template to be used */
  when?: Condition;
}

/**
 * Configuration for the bash wrapper plugin.
 *
 * Create a config file at:
 *   - .opencode/bash-wrapper.json (project-local, takes priority)
 *   - ~/.config/opencode/bash-wrapper.json (global fallback)
 *
 * Simple config (single template, always applies):
 * {
 *   "template": "docker exec -it mycontainer ${command}"
 * }
 *
 * Conditional config with fallback chain (e.g., nix develop with fallback):
 * {
 *   "templates": [
 *     {
 *       "template": "nix develop --quiet -c bash -c \"${command:quoted}\"",
 *       "when": { "file": "flake.nix", "command": "nix" }
 *     },
 *     {
 *       "template": "${command}"
 *     }
 *   ]
 * }
 *
 * Note: Use --quiet with nix develop to suppress nix output and only show
 * the wrapped command's output. Shell hooks may still produce output.
 *
 * Condition types:
 *   - file: Check if file exists relative to project root
 *   - command: Check if command is available in PATH
 *
 * Placeholders:
 *   ${command}        - raw command, no escaping
 *   ${command:quoted} - escaped for double quotes (\, ", `, $ are escaped)
 *   ${command:single} - escaped for single quotes (' becomes '\'')
 */
export interface BashWrapperConfig {
  /** Simple template (mutually exclusive with templates) */
  template?: string;
  /** Template chain with conditions (first matching wins) */
  templates?: TemplateRule[];
}

const CONFIG_FILE = "bash-wrapper.json";

/**
 * Select the first template whose condition passes.
 */
async function selectTemplate(
  config: BashWrapperConfig,
  baseDir: string
): Promise<string | null> {
  // Simple template mode
  if (config.template) {
    return config.template;
  }

  // Template chain mode
  if (config.templates && config.templates.length > 0) {
    for (const rule of config.templates) {
      const matches = await evaluateCondition(rule.when, baseDir);
      if (matches) {
        return rule.template;
      }
    }
  }

  return null;
}

/**
 * Plugin that wraps all bash commands using a configurable template.
 */
export const BashWrapperPlugin: Plugin = async (input) => {
  const config = await loadConfig<BashWrapperConfig>(CONFIG_FILE, input.directory);

  // Skip if no config
  if (!config) {
    return {};
  }

  // Pre-select template at plugin init time
  const template = await selectTemplate(config, input.directory);

  // Skip if no matching template
  if (!template) {
    return {};
  }

  // Check if template is just ${command} (no-op)
  if (template === "${command}") {
    return {};
  }

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

      state.args.command = applyTemplate(template, command);
    },
  };
};
