/**
 * Escape a string for use inside double quotes.
 * Escapes: \ " ` $
 */
export function escapeDoubleQuoted(str: string): string {
  return str.replace(/[\\"`$]/g, "\\$&");
}

/**
 * Escape a string for use inside single quotes.
 * Replaces ' with '\'' (end quote, escaped quote, start quote)
 */
export function escapeSingleQuoted(str: string): string {
  return str.replace(/'/g, "'\\''");
}

/**
 * Apply template substitution with the command.
 *
 * Placeholders:
 *   ${command}        - raw command, no escaping
 *   ${command:quoted} - escaped for double quotes (\, ", `, $ are escaped)
 *   ${command:single} - escaped for single quotes (' becomes '\'')
 */
export function applyTemplate(template: string, command: string): string {
  return template
    .replace(/\$\{command:quoted\}/g, escapeDoubleQuoted(command))
    .replace(/\$\{command:single\}/g, escapeSingleQuoted(command))
    .replace(/\$\{command\}/g, command);
}
