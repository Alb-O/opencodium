import type { Plugin } from "@opencode-ai/plugin";
import { loadConfig } from "../../lib/config";
import { applyTemplate } from "./template";
import { evaluateCondition, type Condition } from "./condition";

/**
 * A template rule with an optional condition.
 */
export interface TemplateRule {
  template: string;
  when?: Condition;
}

/**
 * Configuration for the bash wrapper plugin.
 * See README.md for detailed documentation and examples.
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
  if (config.template) {
    return config.template;
  }

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

  if (!config) {
    return {};
  }

  const template = await selectTemplate(config, input.directory);

  if (!template || template === "${command}") {
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
