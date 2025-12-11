/**
 * OpenCode Plugin Entry Point
 * 
 * This file re-exports all plugins from packages.
 * OpenCode automatically loads the default export as the Plugin.
 */

export { default } from "../../packages/nix-develop/src/index.ts";
export { default as BashWrapperPlugin } from "../../packages/bash-wrapper/src/index.ts";
