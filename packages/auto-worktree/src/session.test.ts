import { describe, expect, test, beforeEach } from "bun:test";
import {
  setSessionWorktree,
  getSessionWorktree,
  clearSessionWorktree,
  hasSessionWorktree,
} from "./session";

describe("session", () => {
  beforeEach(() => {
    // Clear any existing state
    clearSessionWorktree("test-session-1");
    clearSessionWorktree("test-session-2");
  });

  describe("setSessionWorktree / getSessionWorktree", () => {
    test("stores and retrieves worktree path", () => {
      setSessionWorktree("test-session-1", "/path/to/worktree");

      expect(getSessionWorktree("test-session-1")).toBe("/path/to/worktree");
    });

    test("returns undefined for unknown session", () => {
      expect(getSessionWorktree("unknown-session")).toBeUndefined();
    });

    test("overwrites existing worktree path", () => {
      setSessionWorktree("test-session-1", "/path/one");
      setSessionWorktree("test-session-1", "/path/two");

      expect(getSessionWorktree("test-session-1")).toBe("/path/two");
    });
  });

  describe("clearSessionWorktree", () => {
    test("removes worktree mapping", () => {
      setSessionWorktree("test-session-1", "/path/to/worktree");
      clearSessionWorktree("test-session-1");

      expect(getSessionWorktree("test-session-1")).toBeUndefined();
    });

    test("no-op for unknown session", () => {
      // Should not throw
      clearSessionWorktree("unknown-session");
    });
  });

  describe("hasSessionWorktree", () => {
    test("returns true when worktree exists", () => {
      setSessionWorktree("test-session-1", "/path/to/worktree");

      expect(hasSessionWorktree("test-session-1")).toBe(true);
    });

    test("returns false when no worktree", () => {
      expect(hasSessionWorktree("test-session-1")).toBe(false);
    });

    test("returns false after clearing", () => {
      setSessionWorktree("test-session-1", "/path/to/worktree");
      clearSessionWorktree("test-session-1");

      expect(hasSessionWorktree("test-session-1")).toBe(false);
    });
  });
});
