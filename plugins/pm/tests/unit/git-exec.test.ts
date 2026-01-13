/**
 * Git Exec Functions Unit Tests
 *
 * Tests for git command execution functions with mocked execSync.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execSync } from "child_process";

// Mock child_process
vi.mock("child_process", () => ({
  execSync: vi.fn(),
}));

// Import after mocking
import {
  getCurrentBranch,
  getGitStatus,
  getRecentCommits,
  getCommitInfo,
  getUnpushedCommits,
  isGitRepository,
  getGitRoot,
  getHotspots,
  getCommitStats,
} from "../../lib/git.js";

const mockedExecSync = vi.mocked(execSync);

describe("getCurrentBranch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return current branch name", () => {
    mockedExecSync.mockReturnValue("main\n");

    const result = getCurrentBranch();

    expect(result).toBe("main");
    expect(mockedExecSync).toHaveBeenCalledWith(
      "git rev-parse --abbrev-ref HEAD",
      expect.any(Object)
    );
  });

  it("should return feature branch name", () => {
    mockedExecSync.mockReturnValue("42-feat-new-feature\n");

    const result = getCurrentBranch();

    expect(result).toBe("42-feat-new-feature");
  });

  it("should return null on error", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("Not a git repository");
    });

    const result = getCurrentBranch();

    expect(result).toBeNull();
  });
});

describe("getGitStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return clean status", () => {
    mockedExecSync
      .mockReturnValueOnce("main\n") // getCurrentBranch
      .mockReturnValueOnce("") // git status --porcelain
      .mockReturnValueOnce("0\t0\n"); // ahead/behind

    const result = getGitStatus();

    expect(result).toEqual({
      branch: "main",
      isClean: true,
      staged: [],
      modified: [],
      untracked: [],
      ahead: 0,
      behind: 0,
    });
  });

  it("should parse staged and modified files", () => {
    mockedExecSync
      .mockReturnValueOnce("main\n")
      .mockReturnValueOnce("M  staged.ts\n M modified.ts\n?? untracked.ts")
      .mockReturnValueOnce("2\t1\n");

    const result = getGitStatus();

    expect(result).toEqual({
      branch: "main",
      isClean: false,
      staged: ["staged.ts"],
      modified: ["modified.ts"],
      untracked: ["untracked.ts"],
      ahead: 1,
      behind: 2,
    });
  });

  it("should return null when not in git repo", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("Not a git repository");
    });

    const result = getGitStatus();

    expect(result).toBeNull();
  });

  it("should handle no upstream branch", () => {
    mockedExecSync
      .mockReturnValueOnce("feature\n")
      .mockReturnValueOnce("")
      .mockImplementationOnce(() => {
        throw new Error("No upstream");
      });

    const result = getGitStatus();

    expect(result?.ahead).toBe(0);
    expect(result?.behind).toBe(0);
  });
});

describe("getRecentCommits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should parse commits with numstat", () => {
    const gitLog = `abc1234|John Doe|john@example.com|2025-01-01T10:00:00Z|feat: add feature
10\t5\tsrc/index.ts
def5678|Jane Doe|jane@example.com|2025-01-02T10:00:00Z|fix: bug fix
3\t1\tsrc/utils.ts`;

    mockedExecSync.mockReturnValue(gitLog);

    const result = getRecentCommits(2);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      sha: "abc1234",
      shortSha: "abc1234",
      author: "John Doe",
      message: "feat: add feature",
      linesAdded: 10,
      linesDeleted: 5,
    });
    expect(result[0].files).toContain("src/index.ts");
    expect(result[1]).toMatchObject({
      sha: "def5678",
      message: "fix: bug fix",
    });
  });

  it("should return empty array on error", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("Error");
    });

    const result = getRecentCommits();

    expect(result).toEqual([]);
  });

  it("should handle commits without file changes", () => {
    const gitLog = `abc1234|John|john@test.com|2025-01-01T10:00:00Z|chore: empty commit`;

    mockedExecSync.mockReturnValue(gitLog);

    const result = getRecentCommits(1);

    expect(result).toHaveLength(1);
    expect(result[0].files).toEqual([]);
    expect(result[0].linesAdded).toBe(0);
  });
});

describe("getCommitInfo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return commit info", () => {
    const gitShow = `abc1234567890|John Doe|john@example.com|2025-01-01T10:00:00Z|feat: add feature
10\t5\tsrc/index.ts
20\t3\tsrc/utils.ts`;

    mockedExecSync.mockReturnValue(gitShow);

    const result = getCommitInfo("abc1234");

    expect(result).toMatchObject({
      sha: "abc1234567890",
      shortSha: "abc1234",
      author: "John Doe",
      email: "john@example.com",
      message: "feat: add feature",
      linesAdded: 30,
      linesDeleted: 8,
    });
    expect(result?.files).toHaveLength(2);
  });

  it("should return null on error", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("Not found");
    });

    const result = getCommitInfo("invalid");

    expect(result).toBeNull();
  });
});

describe("getUnpushedCommits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return unpushed commits", () => {
    const gitLog = `abc123|John|john@test.com|2025-01-01T10:00:00Z|feat: local commit
def456|John|john@test.com|2025-01-02T10:00:00Z|fix: another local`;

    mockedExecSync.mockReturnValue(gitLog);

    const result = getUnpushedCommits();

    expect(result).toHaveLength(2);
    expect(result[0].sha).toBe("abc123");
    expect(result[1].sha).toBe("def456");
  });

  it("should return empty array when no unpushed commits", () => {
    mockedExecSync.mockReturnValue("");

    const result = getUnpushedCommits();

    expect(result).toEqual([]);
  });

  it("should return empty array on error", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("No upstream");
    });

    const result = getUnpushedCommits();

    expect(result).toEqual([]);
  });
});

describe("isGitRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return true in git repo", () => {
    mockedExecSync.mockReturnValue(".git\n");

    expect(isGitRepository()).toBe(true);
  });

  it("should return false outside git repo", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("Not a git repository");
    });

    expect(isGitRepository()).toBe(false);
  });
});

describe("getGitRoot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return git root path", () => {
    mockedExecSync.mockReturnValue("/home/user/project\n");

    const result = getGitRoot();

    expect(result).toBe("/home/user/project");
  });

  it("should return null outside git repo", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("Not a git repository");
    });

    const result = getGitRoot();

    expect(result).toBeNull();
  });
});

describe("getHotspots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return file hotspots with risk levels", () => {
    const output = `  25 src/core.ts
  15 src/utils.ts
   5 src/index.ts`;

    mockedExecSync.mockReturnValue(output);

    const result = getHotspots(10);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ file: "src/core.ts", changes: 25, risk: "high" });
    expect(result[1]).toEqual({ file: "src/utils.ts", changes: 15, risk: "medium" });
    expect(result[2]).toEqual({ file: "src/index.ts", changes: 5, risk: "low" });
  });

  it("should return empty array on error", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("Error");
    });

    const result = getHotspots();

    expect(result).toEqual([]);
  });
});

describe("getCommitStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return commit statistics", () => {
    mockedExecSync
      .mockReturnValueOnce("  10\tJohn Doe\n   5\tJane Doe") // shortlog
      .mockReturnValueOnce(" 100 insertions(+), 50 deletions(-)") // diff --shortstat
      .mockReturnValueOnce("15\n"); // rev-list --count

    const result = getCommitStats("v1.0.0", "v2.0.0");

    expect(result).toEqual({
      commits: 15,
      authors: ["John Doe", "Jane Doe"],
      linesAdded: 100,
      linesDeleted: 50,
    });
  });

  it("should handle single author", () => {
    mockedExecSync
      .mockReturnValueOnce("  10\tJohn Doe")
      .mockReturnValueOnce(" 50 insertions(+)")
      .mockReturnValueOnce("10\n");

    const result = getCommitStats();

    expect(result.authors).toEqual(["John Doe"]);
    expect(result.linesAdded).toBe(50);
    expect(result.linesDeleted).toBe(0);
  });

  it("should return empty stats on error", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("Error");
    });

    const result = getCommitStats();

    expect(result).toEqual({
      commits: 0,
      authors: [],
      linesAdded: 0,
      linesDeleted: 0,
    });
  });
});
