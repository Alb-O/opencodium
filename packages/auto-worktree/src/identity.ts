/**
 * Agent identity generation.
 * 
 * Generates a deterministic identity (name, email, branch) from session ID
 * using faker seeded with a hash of the session ID.
 */

import { createHash } from "crypto";
import { faker } from "@faker-js/faker";

export interface AgentIdentity {
  /** Branch name: auto-worktree/<middleName>-<hash> */
  branchName: string;
  /** Human-readable name for git commits */
  userName: string;
  /** Email for git commits */
  userEmail: string;
  /** The generated middle name */
  middleName: string;
  /** 8-char hex hash of session ID */
  hash: string;
}

/**
 * Generates a deterministic identity from a session ID.
 * The same session ID always produces the same identity.
 */
export function generateIdentity(sessionID: string): AgentIdentity {
  const hash = createHash("sha256")
    .update(sessionID)
    .digest("hex")
    .substring(0, 8);

  const seed = parseInt(hash, 16);
  faker.seed(seed);

  const middleName = faker.person.middleName().toLowerCase();
  const userName = middleName.charAt(0).toUpperCase() + middleName.slice(1);
  const userEmail = `${middleName}@opencode.ai`;
  // Branch name uses plugin name as prefix
  const branchName = `auto-worktree/${middleName}-${hash}`;

  return { branchName, userName, userEmail, middleName, hash };
}

/**
 * Returns the worktree directory name from an identity.
 */
export function getWorktreeName(identity: AgentIdentity): string {
  return `${identity.middleName}-${identity.hash}`;
}
