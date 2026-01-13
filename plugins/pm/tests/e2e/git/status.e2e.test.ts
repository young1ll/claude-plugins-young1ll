/**
 * Git E2E Tests
 *
 * Tests real Git command execution without mocks.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  getCurrentBranch,
  getGitStatus,
  isGitRepository,
  getGitRoot,
  getRecentCommits,
  getCommitStats,
  getHotspots,
} from "../../../lib/git.js";
import { GitHubE2EHelper } from "../helpers/github-helper.js";
import { getE2EConfig } from "../config/env.js";

describe("Git E2E", () => {
  let helper: GitHubE2EHelper;
  let originalBranch: string | null;
  let config: ReturnType<typeof getE2EConfig>;

  beforeAll(() => {
    helper = new GitHubE2EHelper();
    originalBranch = getCurrentBranch();
    config = getE2EConfig();
  });

  afterAll(() => {
    // Return to original branch if needed
    if (originalBranch) {
      try {
        const { execSync } = require("child_process");
        execSync(`git checkout ${originalBranch}`, { stdio: "pipe" });
      } catch {
        // Ignore
      }
    }
    helper.cleanupTestBranches();
  });

  describe("Repository Detection", () => {
    it("detects git repository", () => {
      expect(isGitRepository()).toBe(true);
    });

    it("gets git root directory", () => {
      const root = getGitRoot();
      expect(root).not.toBeNull();
      expect(typeof root).toBe("string");
      expect(root!.length).toBeGreaterThan(0);
    });
  });

  describe("Branch Operations", () => {
    it("gets current branch name", () => {
      const branch = getCurrentBranch();
      expect(branch).not.toBeNull();
      expect(typeof branch).toBe("string");
    });

    it("gets git status", () => {
      const status = getGitStatus();
      expect(status).not.toBeNull();
      expect(status?.branch).toBeDefined();
      expect(typeof status?.isClean).toBe("boolean");
    });

    it("creates and lists test branch", () => {
      const timestamp = Date.now();
      const testBranch = helper.createTestBranch(`git-test-${timestamp}`);

      expect(testBranch.name).toContain(config.git.testBranchPrefix);
      expect(testBranch.sha).toBeDefined();
      expect(testBranch.sha.length).toBe(40); // SHA-1 hash length

      // Verify branch exists
      const branches = helper.listTestBranches();
      expect(branches).toContain(testBranch.name);
    });
  });

  describe("Commit History", () => {
    it("gets recent commits", () => {
      const commits = getRecentCommits(10);

      expect(Array.isArray(commits)).toBe(true);
      expect(commits.length).toBeGreaterThan(0);
      expect(commits.length).toBeLessThanOrEqual(10);

      // Verify commit structure
      const commit = commits[0];
      expect(commit.sha).toBeDefined();
      expect(commit.sha.length).toBe(40);
      expect(commit.message).toBeDefined();
      expect(commit.author).toBeDefined();
      expect(commit.date).toBeDefined();
    });

    it("gets commits with limit", () => {
      const fiveCommits = getRecentCommits(5);
      const tenCommits = getRecentCommits(10);

      expect(fiveCommits.length).toBeLessThanOrEqual(5);
      expect(tenCommits.length).toBeLessThanOrEqual(10);

      if (tenCommits.length > 5) {
        expect(tenCommits.length).toBeGreaterThan(fiveCommits.length);
      }
    });
  });

  describe("Git Statistics", () => {
    it("gets commit stats", () => {
      // getCommitStats requires a range that exists - use a small range
      const stats = getCommitStats("HEAD~5", "HEAD");

      expect(stats).toBeDefined();
      expect(stats.commits).toBeGreaterThanOrEqual(0);
      expect(stats.authors).toBeDefined();
      expect(Array.isArray(stats.authors)).toBe(true);
    });

    it("identifies hotspots", () => {
      const hotspots = getHotspots(10);

      expect(Array.isArray(hotspots)).toBe(true);

      if (hotspots.length > 0) {
        const hotspot = hotspots[0];
        expect(hotspot.file).toBeDefined();
        expect(hotspot.changes).toBeGreaterThan(0);
        expect(["high", "medium", "low"]).toContain(hotspot.risk);
      }
    });
  });

  describe("Branch Cleanup", () => {
    it("deletes local branch", () => {
      const timestamp = Date.now();
      const testBranch = helper.createTestBranch(`cleanup-test-${timestamp}`);

      // Verify branch was created
      let branches = helper.listTestBranches();
      expect(branches).toContain(testBranch.name);

      // Delete branch
      const deleted = helper.deleteLocalBranch(testBranch.name);
      expect(deleted).toBe(true);

      // Verify branch was deleted
      branches = helper.listTestBranches();
      expect(branches).not.toContain(testBranch.name);
    });

    it("cleans up all test branches", () => {
      // Create multiple test branches
      for (let i = 0; i < 3; i++) {
        helper.createTestBranch(`multi-cleanup-${i}-${Date.now()}`);
      }

      // Verify branches were created
      expect(helper.getCreatedBranches().length).toBeGreaterThan(0);

      // Clean up
      helper.cleanupTestBranches();

      // Verify branches were deleted
      expect(helper.getCreatedBranches().length).toBe(0);
    });
  });
});
