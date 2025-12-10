import { describe, it, expect } from "bun:test";
import { applyTemplate, escapeDoubleQuoted, escapeSingleQuoted } from "./template";

describe("escapeDoubleQuoted", () => {
  it("escapes backslashes", () => {
    expect(escapeDoubleQuoted("path\\to\\file")).toBe("path\\\\to\\\\file");
  });

  it("escapes double quotes", () => {
    expect(escapeDoubleQuoted('echo "hello"')).toBe('echo \\"hello\\"');
  });

  it("escapes backticks", () => {
    expect(escapeDoubleQuoted("echo `date`")).toBe("echo \\`date\\`");
  });

  it("escapes dollar signs", () => {
    expect(escapeDoubleQuoted("echo $HOME")).toBe("echo \\$HOME");
  });

  it("escapes multiple special chars", () => {
    expect(escapeDoubleQuoted('echo "$HOME\\bin"')).toBe('echo \\"\\$HOME\\\\bin\\"');
  });

  it("leaves plain text unchanged", () => {
    expect(escapeDoubleQuoted("ls -la")).toBe("ls -la");
  });
});

describe("escapeSingleQuoted", () => {
  it("escapes single quotes", () => {
    expect(escapeSingleQuoted("it's")).toBe("it'\\''s");
  });

  it("escapes multiple single quotes", () => {
    expect(escapeSingleQuoted("don't won't")).toBe("don'\\''t won'\\''t");
  });

  it("leaves other chars unchanged", () => {
    expect(escapeSingleQuoted('echo "$HOME"')).toBe('echo "$HOME"');
  });
});

describe("applyTemplate", () => {
  it("substitutes raw command", () => {
    const result = applyTemplate("docker exec container ${command}", "ls -la");
    expect(result).toBe("docker exec container ls -la");
  });

  it("substitutes quoted command with escaping", () => {
    const result = applyTemplate('nix-shell --run "${command:quoted}"', 'echo "hello"');
    expect(result).toBe('nix-shell --run "echo \\"hello\\""');
  });

  it("substitutes single-quoted command with escaping", () => {
    const result = applyTemplate("ssh host '${command:single}'", "echo it's working");
    expect(result).toBe("ssh host 'echo it'\\''s working'");
  });

  it("handles multiple placeholders", () => {
    const result = applyTemplate("echo ${command} or '${command:single}'", "test's");
    expect(result).toBe("echo test's or 'test'\\''s'");
  });

  it("handles complex command with quotes and variables", () => {
    const cmd = 'grep "pattern" $FILE | awk \'{print $1}\'';
    const result = applyTemplate('bash -c "${command:quoted}"', cmd);
    expect(result).toBe('bash -c "grep \\"pattern\\" \\$FILE | awk \'{print \\$1}\'"');
  });

  it("returns template unchanged if no placeholders", () => {
    const result = applyTemplate("echo hello", "ignored");
    expect(result).toBe("echo hello");
  });
});
