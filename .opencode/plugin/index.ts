/**
 * OpenCode Plugin Entry Point
 * 
 * This file re-exports all plugins from src/plugins/.
 * OpenCode automatically loads all named exports matching the Plugin type.
 */

export { BashWrapperPlugin as default } from "../../packages/bash-wrapper/src/index.ts";
