/**
 * GitHub Integration Unit Tests
 *
 * Tests for GitHub CLI wrapper with mocked execSync.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { execSync } from "child_process";

// Mock child_process
vi.mock("child_process", () => ({
  execSync: vi.fn(),
}));

// Import after mocking
import {
  getRepoInfo,
  isAuthenticated,
  getIssue,
  listIssues,
  createIssue,
  updateIssueState,
  addIssueComment,
  getPR,
  createPR,
  listPRs,
  getProjectItems,
  createRelease,
  generateReleaseNotes,
} from "../../lib/github.js";

const mockedExecSync = vi.mocked(execSync);

describe("getRepoInfo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return repo info", () => {
    mockedExecSync.mockReturnValue(
      JSON.stringify({ owner: { login: "myorg" }, name: "myrepo" })
    );

    const result = getRepoInfo();

    expect(result).toEqual({ owner: "myorg", repo: "myrepo" });
    expect(mockedExecSync).toHaveBeenCalledWith(
      "gh repo view --json owner,name",
      expect.any(Object)
    );
  });

  it("should return null on error", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("Not in a git repo");
    });

    const result = getRepoInfo();

    expect(result).toBeNull();
  });
});

describe("isAuthenticated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return true when authenticated", () => {
    mockedExecSync.mockReturnValue("✓ Logged in");

    expect(isAuthenticated()).toBe(true);
  });

  it("should return false when not authenticated", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("Not authenticated");
    });

    expect(isAuthenticated()).toBe(false);
  });
});

describe("getIssue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return issue details", () => {
    mockedExecSync.mockReturnValue(
      JSON.stringify({
        number: 42,
        title: "Test Issue",
        body: "Issue description",
        state: "open",
        labels: [{ name: "bug" }, { name: "urgent" }],
        assignees: [{ login: "developer" }],
        milestone: { number: 1, title: "v1.0" },
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-02T00:00:00Z",
        closedAt: null,
      })
    );

    const result = getIssue(42);

    expect(result).toEqual({
      number: 42,
      title: "Test Issue",
      body: "Issue description",
      state: "open",
      labels: ["bug", "urgent"],
      assignees: ["developer"],
      milestone: { number: 1, title: "v1.0" },
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-02T00:00:00Z",
      closedAt: null,
    });
  });

  it("should return null for non-existent issue", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("Issue not found");
    });

    const result = getIssue(999);

    expect(result).toBeNull();
  });
});

describe("listIssues", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return list of issues", () => {
    mockedExecSync.mockReturnValue(
      JSON.stringify([
        {
          number: 1,
          title: "Issue 1",
          body: "",
          state: "open",
          labels: [],
          assignees: [],
          createdAt: "2025-01-01T00:00:00Z",
          updatedAt: "2025-01-01T00:00:00Z",
        },
        {
          number: 2,
          title: "Issue 2",
          body: "",
          state: "closed",
          labels: [{ name: "done" }],
          assignees: [{ login: "dev" }],
          createdAt: "2025-01-02T00:00:00Z",
          updatedAt: "2025-01-02T00:00:00Z",
          closedAt: "2025-01-03T00:00:00Z",
        },
      ])
    );

    const result = listIssues();

    expect(result).toHaveLength(2);
    expect(result[0].number).toBe(1);
    expect(result[1].labels).toContain("done");
  });

  it("should pass filter options", () => {
    mockedExecSync.mockReturnValue("[]");

    listIssues({ state: "open", labels: ["bug"], assignee: "dev", limit: 10 });

    const call = mockedExecSync.mock.calls[0][0] as string;
    expect(call).toContain("--state open");
    expect(call).toContain("--label");
    expect(call).toContain("--assignee dev");
    expect(call).toContain("--limit 10");
  });

  it("should return empty array on error", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("Error");
    });

    const result = listIssues();

    expect(result).toEqual([]);
  });
});

describe("createIssue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create issue and return it", () => {
    mockedExecSync
      .mockReturnValueOnce("https://github.com/org/repo/issues/42") // create
      .mockReturnValueOnce(
        JSON.stringify({
          number: 42,
          title: "New Issue",
          body: "Description",
          state: "open",
          labels: [],
          assignees: [],
          createdAt: "2025-01-01T00:00:00Z",
          updatedAt: "2025-01-01T00:00:00Z",
        })
      ); // getIssue

    const result = createIssue({ title: "New Issue", body: "Description" });

    expect(result?.number).toBe(42);
    expect(mockedExecSync.mock.calls[0][0]).toContain("issue create");
  });

  it("should return null on error", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("Error");
    });

    const result = createIssue({ title: "Test" });

    expect(result).toBeNull();
  });
});

describe("updateIssueState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should close issue", () => {
    mockedExecSync.mockReturnValue("");

    const result = updateIssueState(42, "closed");

    expect(result).toBe(true);
    expect(mockedExecSync).toHaveBeenCalledWith(
      "gh issue close 42",
      expect.any(Object)
    );
  });

  it("should reopen issue", () => {
    mockedExecSync.mockReturnValue("");

    const result = updateIssueState(42, "open");

    expect(result).toBe(true);
    expect(mockedExecSync).toHaveBeenCalledWith(
      "gh issue reopen 42",
      expect.any(Object)
    );
  });

  it("should return false on error", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("Error");
    });

    const result = updateIssueState(42, "closed");

    expect(result).toBe(false);
  });
});

describe("addIssueComment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should add comment to issue", () => {
    mockedExecSync.mockReturnValue("");

    const result = addIssueComment(42, "This is a comment");

    expect(result).toBe(true);
    expect(mockedExecSync).toHaveBeenCalledWith(
      expect.stringContaining("issue comment 42"),
      expect.any(Object)
    );
  });

  it("should return false on error", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("Error");
    });

    const result = addIssueComment(42, "Comment");

    expect(result).toBe(false);
  });
});

describe("getPR", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return PR details", () => {
    mockedExecSync.mockReturnValue(
      JSON.stringify({
        number: 10,
        title: "Feature PR",
        body: "PR description",
        state: "OPEN",
        headRefName: "feature-branch",
        baseRefName: "main",
        isDraft: false,
        labels: [{ name: "enhancement" }],
        assignees: [{ login: "developer" }],
        reviewRequests: [{ login: "reviewer" }],
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-02T00:00:00Z",
        mergedAt: null,
      })
    );

    const result = getPR(10);

    expect(result).toEqual({
      number: 10,
      title: "Feature PR",
      body: "PR description",
      state: "open",
      head: "feature-branch",
      base: "main",
      draft: false,
      labels: ["enhancement"],
      assignees: ["developer"],
      reviewers: ["reviewer"],
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-02T00:00:00Z",
      mergedAt: null,
    });
  });

  it("should detect merged PR", () => {
    mockedExecSync.mockReturnValue(
      JSON.stringify({
        number: 10,
        title: "Merged PR",
        body: "",
        state: "CLOSED",
        headRefName: "feature",
        baseRefName: "main",
        isDraft: false,
        labels: [],
        assignees: [],
        reviewRequests: [],
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-02T00:00:00Z",
        mergedAt: "2025-01-02T10:00:00Z",
      })
    );

    const result = getPR(10);

    expect(result?.state).toBe("merged");
  });

  it("should return null for non-existent PR", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("PR not found");
    });

    const result = getPR(999);

    expect(result).toBeNull();
  });
});

describe("createPR", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create PR and return it", () => {
    mockedExecSync
      .mockReturnValueOnce("https://github.com/org/repo/pull/10") // create
      .mockReturnValueOnce(
        JSON.stringify({
          number: 10,
          title: "New PR",
          body: "",
          state: "OPEN",
          headRefName: "feature",
          baseRefName: "main",
          isDraft: false,
          labels: [],
          assignees: [],
          reviewRequests: [],
          createdAt: "2025-01-01T00:00:00Z",
          updatedAt: "2025-01-01T00:00:00Z",
        })
      ); // getPR

    const result = createPR({ title: "New PR" });

    expect(result?.number).toBe(10);
  });

  it("should pass all options", () => {
    mockedExecSync
      .mockReturnValueOnce("https://github.com/org/repo/pull/10")
      .mockReturnValueOnce(
        JSON.stringify({
          number: 10,
          title: "PR",
          body: "",
          state: "OPEN",
          headRefName: "feature",
          baseRefName: "main",
          isDraft: true,
          labels: [],
          assignees: [],
          reviewRequests: [],
          createdAt: "2025-01-01T00:00:00Z",
          updatedAt: "2025-01-01T00:00:00Z",
        })
      );

    createPR({
      title: "PR",
      body: "Description",
      base: "main",
      head: "feature",
      draft: true,
      labels: ["bug"],
      assignees: ["dev"],
      reviewers: ["reviewer"],
    });

    const call = mockedExecSync.mock.calls[0][0] as string;
    expect(call).toContain("pr create");
    expect(call).toContain("--draft");
    expect(call).toContain("--base main");
  });

  it("should return null on error", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("Error");
    });

    const result = createPR({ title: "Test" });

    expect(result).toBeNull();
  });
});

describe("listPRs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return list of PRs", () => {
    mockedExecSync.mockReturnValue(
      JSON.stringify([
        {
          number: 1,
          title: "PR 1",
          body: "",
          state: "OPEN",
          headRefName: "feature1",
          baseRefName: "main",
          isDraft: false,
          labels: [],
          assignees: [],
          reviewRequests: [],
          createdAt: "2025-01-01T00:00:00Z",
          updatedAt: "2025-01-01T00:00:00Z",
        },
        {
          number: 2,
          title: "PR 2",
          body: "",
          state: "CLOSED",
          headRefName: "feature2",
          baseRefName: "main",
          isDraft: false,
          labels: [],
          assignees: [],
          reviewRequests: [],
          createdAt: "2025-01-02T00:00:00Z",
          updatedAt: "2025-01-02T00:00:00Z",
          mergedAt: "2025-01-03T00:00:00Z",
        },
      ])
    );

    const result = listPRs();

    expect(result).toHaveLength(2);
    expect(result[0].state).toBe("open");
    expect(result[1].state).toBe("merged");
  });

  it("should pass filter options", () => {
    mockedExecSync.mockReturnValue("[]");

    listPRs({ state: "open", base: "main", head: "feature", limit: 10 });

    const call = mockedExecSync.mock.calls[0][0] as string;
    expect(call).toContain("--state open");
    expect(call).toContain("--base main");
    expect(call).toContain("--head feature");
    expect(call).toContain("--limit 10");
  });

  it("should return empty array on error", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("Error");
    });

    const result = listPRs();

    expect(result).toEqual([]);
  });
});

describe("getProjectItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return project items for an issue", () => {
    mockedExecSync.mockReturnValue(
      JSON.stringify({
        projectItems: {
          nodes: [
            {
              id: "proj-item-1",
              project: { number: 1 },
              content: { number: 42, type: "Issue" },
              fieldValues: {
                nodes: [
                  { field: { name: "Status" }, text: "In Progress" },
                  { field: { name: "Priority" }, text: "High" },
                  { field: { name: "Empty" } }, // No text field
                ],
              },
            },
          ],
        },
      })
    );

    const result = getProjectItems(42);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("proj-item-1");
    expect(result[0].contentId).toBe(42);
    expect(result[0].contentType).toBe("Issue");
    expect(result[0].fields.Status).toBe("In Progress");
    expect(result[0].fields.Priority).toBe("High");
    expect(result[0].fields.Empty).toBeUndefined();
  });

  it("should return empty array when no project items", () => {
    mockedExecSync.mockReturnValue(
      JSON.stringify({
        projectItems: {
          nodes: [],
        },
      })
    );

    const result = getProjectItems(42);

    expect(result).toEqual([]);
  });

  it("should return empty array on error", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("Error");
    });

    const result = getProjectItems(42);

    expect(result).toEqual([]);
  });

  it("should handle PullRequest content type", () => {
    mockedExecSync.mockReturnValue(
      JSON.stringify({
        projectItems: {
          nodes: [
            {
              id: "proj-item-2",
              project: { number: 1 },
              content: { number: 10, type: "PullRequest" },
              fieldValues: {
                nodes: [{ field: { name: "Status" }, text: "Review" }],
              },
            },
          ],
        },
      })
    );

    const result = getProjectItems(10);

    expect(result[0].contentType).toBe("PullRequest");
  });
});

describe("createRelease", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create a release with required params", () => {
    mockedExecSync.mockReturnValue("");

    const result = createRelease({
      tag: "v1.0.0",
      title: "Version 1.0.0",
    });

    expect(result).toBe(true);
    const call = mockedExecSync.mock.calls[0][0] as string;
    expect(call).toContain("release create v1.0.0");
    expect(call).toContain('--title "Version 1.0.0"');
  });

  it("should create a release with notes", () => {
    mockedExecSync.mockReturnValue("");

    createRelease({
      tag: "v1.0.0",
      title: "Version 1.0.0",
      notes: "Release notes here",
    });

    const call = mockedExecSync.mock.calls[0][0] as string;
    expect(call).toContain('--notes "Release notes here"');
  });

  it("should create a draft release", () => {
    mockedExecSync.mockReturnValue("");

    createRelease({
      tag: "v1.0.0",
      title: "Version 1.0.0",
      draft: true,
    });

    const call = mockedExecSync.mock.calls[0][0] as string;
    expect(call).toContain("--draft");
  });

  it("should create a prerelease", () => {
    mockedExecSync.mockReturnValue("");

    createRelease({
      tag: "v1.0.0-beta",
      title: "Version 1.0.0 Beta",
      prerelease: true,
    });

    const call = mockedExecSync.mock.calls[0][0] as string;
    expect(call).toContain("--prerelease");
  });

  it("should create release with target branch", () => {
    mockedExecSync.mockReturnValue("");

    createRelease({
      tag: "v1.0.0",
      title: "Version 1.0.0",
      target: "release/1.0",
    });

    const call = mockedExecSync.mock.calls[0][0] as string;
    expect(call).toContain("--target release/1.0");
  });

  it("should create release with all options", () => {
    mockedExecSync.mockReturnValue("");

    createRelease({
      tag: "v2.0.0-rc.1",
      title: "Version 2.0.0 RC1",
      notes: "Release candidate",
      draft: true,
      prerelease: true,
      target: "main",
    });

    const call = mockedExecSync.mock.calls[0][0] as string;
    expect(call).toContain("release create v2.0.0-rc.1");
    expect(call).toContain("--notes");
    expect(call).toContain("--draft");
    expect(call).toContain("--prerelease");
    expect(call).toContain("--target main");
  });

  it("should return false on error", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("Error");
    });

    const result = createRelease({
      tag: "v1.0.0",
      title: "Version 1.0.0",
    });

    expect(result).toBe(false);
  });
});

describe("generateReleaseNotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should generate release notes for a tag", () => {
    mockedExecSync.mockReturnValue("## What's Changed\n* Feature A\n* Bug fix B");

    const result = generateReleaseNotes({ tag: "v1.0.0" });

    expect(result).toContain("What's Changed");
    const call = mockedExecSync.mock.calls[0][0] as string;
    expect(call).toContain("release create v1.0.0");
    expect(call).toContain("--generate-notes");
    expect(call).toContain("--dry-run");
  });

  it("should generate notes from previous tag", () => {
    mockedExecSync.mockReturnValue("## Changes since v0.9.0\n* New features");

    const result = generateReleaseNotes({
      tag: "v1.0.0",
      previousTag: "v0.9.0",
    });

    expect(result).toContain("Changes");
    const call = mockedExecSync.mock.calls[0][0] as string;
    expect(call).toContain("--notes-start-tag v0.9.0");
  });

  it("should return empty string on error", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("Error");
    });

    const result = generateReleaseNotes({ tag: "v1.0.0" });

    expect(result).toBe("");
  });
});
