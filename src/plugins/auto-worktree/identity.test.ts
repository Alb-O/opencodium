import { describe, expect, test } from "bun:test";
import { generateIdentity, getWorktreeName } from "./identity";

describe("identity", () => {
  describe("generateIdentity", () => {
    test("returns consistent identity for same session ID", () => {
      const id1 = generateIdentity("session-123");
      const id2 = generateIdentity("session-123");

      expect(id1).toEqual(id2);
    });

    test("returns different identity for different session IDs", () => {
      const id1 = generateIdentity("session-123");
      const id2 = generateIdentity("session-456");

      expect(id1.hash).not.toBe(id2.hash);
    });

    test("generates 8-char hex hash", () => {
      const identity = generateIdentity("test-session");

      expect(identity.hash).toMatch(/^[a-f0-9]{8}$/);
    });

    test("generates valid branch name", () => {
      const identity = generateIdentity("test-session");

      expect(identity.branchName).toMatch(/^auto-worktree\/[a-z]+-[a-f0-9]{8}$/);
    });

    test("generates capitalized user name", () => {
      const identity = generateIdentity("test-session");

      expect(identity.userName[0]).toBe(identity.userName[0].toUpperCase());
      expect(identity.userName.slice(1)).toBe(identity.userName.slice(1).toLowerCase());
    });

    test("generates valid email", () => {
      const identity = generateIdentity("test-session");

      expect(identity.userEmail).toMatch(/^[a-z]+@opencode\.ai$/);
      expect(identity.userEmail).toBe(`${identity.middleName}@opencode.ai`);
    });
  });

  describe("getWorktreeName", () => {
    test("returns middleName-hash format", () => {
      const identity = generateIdentity("test-session");
      const name = getWorktreeName(identity);

      expect(name).toBe(`${identity.middleName}-${identity.hash}`);
    });
  });
});
