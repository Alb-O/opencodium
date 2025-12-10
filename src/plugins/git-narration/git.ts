import { simpleGit, type SimpleGit, type SimpleGitOptions } from "simple-git";

export type CommitResult = {
  committed: boolean;
  diff: string;
  error?: string;
};

function git(cwd: string): SimpleGit {
  const options: Partial<SimpleGitOptions> = {
    baseDir: cwd,
    binary: "git",
    maxConcurrentProcesses: 1,
  };
  return simpleGit(options);
}

/**
 * Stage a file and commit with the given message.
 * Returns whether commit succeeded and the diff.
 */
export async function commitFile(
  filePath: string,
  message: string,
  cwd: string,
): Promise<CommitResult> {
  try {
    const repo = git(cwd);
    
    await repo.add(filePath);
    const diff = await repo.diff(["--cached", "--no-ext-diff", filePath]);
    await repo.commit(normalizeMessage(message), [filePath]);

    return { committed: true, diff };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { committed: false, diff: "", error: msg };
  }
}

/**
 * Normalize commit message to conventional style:
 * lowercase first letter unless it's a code symbol.
 */
function normalizeMessage(message: string): string {
  const firstWord = message.split(" ")[0];
  
  // Handle quoted or bracketed starts like "(foo)" or "[bar]"
  const prefixMatch = firstWord.match(/^([\[\(\{<"'])?(.)/);
  if (!prefixMatch) return message;
  
  const prefix = prefixMatch[1] || "";
  const firstChar = prefixMatch[2];
  const charIndex = prefix.length;

  // Detect code-like symbols that should keep their casing:
  // _foo, $bar, ALL_CAPS, snake_case, kebab-case, camelCase, PascalCase
  const symbolPattern = /^([_$][A-Za-z0-9_$]*|[A-Z0-9_]+|[a-z0-9]+(?:[-_][a-z0-9]+)+|[a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*|[A-Z][a-z0-9]+(?:[A-Z][A-Za-z0-9]+)+)$/;
  
  // Plain English words like "Implement" should be lowercased
  const isPlainCapitalized = /^[A-Z][a-z]+$/.test(firstWord.slice(charIndex));
  
  if (symbolPattern.test(firstWord.slice(charIndex)) && !isPlainCapitalized) {
    return message;
  }

  return (
    message.slice(0, charIndex) +
    firstChar.toLowerCase() +
    message.slice(charIndex + 1)
  );
}

/**
 * Check if a path is inside a git repository.
 */
export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    return await git(cwd).checkIsRepo();
  } catch {
    return false;
  }
}

/**
 * Get the git repository root for a path, or null if not in a repo.
 */
export async function getGitRoot(cwd: string): Promise<string | null> {
  try {
    const root = await git(cwd).revparse(["--show-toplevel"]);
    return root.trim() || null;
  } catch {
    return null;
  }
}
