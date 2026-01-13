/**
 * Sync Engine Unit Tests
 *
 * Tests for GitHub sync engine with mocked GitHub module.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the entire github module
vi.mock("../../lib/github.js", () => ({
  getRepoInfo: vi.fn(),
  isAuthenticated: vi.fn(),
  getIssue: vi.fn(),
  listIssues: vi.fn(),
  createIssue: vi.fn(),
  updateIssueState: vi.fn(),
  addIssueComment: vi.fn(),
}));

// Import mocked functions
import {
  getRepoInfo,
  isAuthenticated,
  getIssue,
  listIssues,
  createIssue,
  updateIssueState,
  addIssueComment,
} from "../../lib/github.js";

// Import after mocking
import { SyncEngine, createSyncEngine, type LocalTask } from "../../lib/sync-engine.js";

const mockedGetRepoInfo = vi.mocked(getRepoInfo);
const mockedIsAuthenticated = vi.mocked(isAuthenticated);
const mockedGetIssue = vi.mocked(getIssue);
const mockedListIssues = vi.mocked(listIssues);
const mockedCreateIssue = vi.mocked(createIssue);
const mockedUpdateIssueState = vi.mocked(updateIssueState);
const mockedAddIssueComment = vi.mocked(addIssueComment);

describe("SyncEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetRepoInfo.mockReturnValue({ owner: "myorg", repo: "myrepo" });
    mockedIsAuthenticated.mockReturnValue(true);
  });

  describe("constructor", () => {
    it("should create with default config from repo info", () => {
      const engine = new SyncEngine({});

      expect(mockedGetRepoInfo).toHaveBeenCalled();
    });

    it("should use provided config", () => {
      const engine = new SyncEngine({
        enabled: true,
        owner: "custom",
        repo: "repo",
        autoSync: false,
      });

      expect(engine.canSync()).toBe(true);
    });
  });

  describe("canSync", () => {
    it("should return false when disabled", () => {
      const engine = new SyncEngine({ enabled: false });

      expect(engine.canSync()).toBe(false);
    });

    it("should return false when no repo info", () => {
      mockedGetRepoInfo.mockReturnValue(null);
      const engine = new SyncEngine({ enabled: true, owner: "", repo: "" });

      expect(engine.canSync()).toBe(false);
    });

    it("should return false when not authenticated", () => {
      mockedIsAuthenticated.mockReturnValue(false);
      const engine = new SyncEngine({ enabled: true });

      expect(engine.canSync()).toBe(false);
    });

    it("should return true when all conditions met", () => {
      const engine = new SyncEngine({ enabled: true });

      expect(engine.canSync()).toBe(true);
    });
  });

  describe("pullFromGitHub", () => {
    it("should return error when sync not available", async () => {
      const engine = new SyncEngine({ enabled: false });

      const result = await engine.pullFromGitHub([]);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    it("should sync issues to local tasks", async () => {
      mockedListIssues.mockReturnValue([
        {
          number: 1,
          title: "Issue 1",
          body: "",
          state: "open",
          labels: [],
          assignees: [],
          createdAt: "2025-01-01T00:00:00Z",
          updatedAt: "2025-01-02T00:00:00Z",
        },
        {
          number: 2,
          title: "Issue 2",
          body: "",
          state: "closed",
          labels: [],
          assignees: [],
          createdAt: "2025-01-01T00:00:00Z",
          updatedAt: "2025-01-02T00:00:00Z",
        },
      ]);

      const localTasks: LocalTask[] = [
        { id: "t1", title: "Task 1", status: "todo", issueNumber: 1, updatedAt: "2025-01-01T00:00:00Z" },
      ];

      const engine = new SyncEngine({ enabled: true });
      const result = await engine.pullFromGitHub(localTasks);

      expect(result.success).toBe(true);
      expect(result.synced).toBe(2);
      expect(result.created).toBe(1); // Issue 2 is new
    });

    it("should detect conflicts when local is newer", async () => {
      mockedListIssues.mockReturnValue([
        {
          number: 1,
          title: "Issue 1",
          body: "",
          state: "closed",
          labels: [],
          assignees: [],
          createdAt: "2025-01-01T00:00:00Z",
          updatedAt: "2025-01-02T00:00:00Z",
        },
      ]);

      const localTasks: LocalTask[] = [
        {
          id: "t1",
          title: "Task 1",
          status: "in_progress", // Different from remote (done)
          issueNumber: 1,
          updatedAt: "2025-01-03T00:00:00Z", // Newer than remote
        },
      ];

      const engine = new SyncEngine({
        enabled: true,
        conflictResolution: "manual",
      });
      const result = await engine.pullFromGitHub(localTasks);

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].localStatus).toBe("in_progress");
      expect(result.conflicts[0].remoteStatus).toBe("done");
    });

    it("should update local when github wins", async () => {
      mockedListIssues.mockReturnValue([
        {
          number: 1,
          title: "Issue 1",
          body: "",
          state: "closed",
          labels: [],
          assignees: [],
          createdAt: "2025-01-01T00:00:00Z",
          updatedAt: "2025-01-02T00:00:00Z",
        },
      ]);

      const localTasks: LocalTask[] = [
        {
          id: "t1",
          title: "Task 1",
          status: "in_progress",
          issueNumber: 1,
          updatedAt: "2025-01-03T00:00:00Z",
        },
      ];

      const engine = new SyncEngine({
        enabled: true,
        conflictResolution: "github", // GitHub wins
      });
      const result = await engine.pullFromGitHub(localTasks);

      expect(result.conflicts).toHaveLength(0);
      expect(result.updated).toBe(1);
    });
  });

  describe("pushToGitHub", () => {
    it("should create new issue", async () => {
      mockedCreateIssue.mockReturnValue({
        number: 42,
        title: "New Task",
        body: "",
        state: "open",
        labels: [],
        assignees: [],
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      });

      const task: LocalTask = {
        id: "t1",
        title: "New Task",
        description: "Description",
        status: "todo",
        updatedAt: "2025-01-01T00:00:00Z",
      };

      const engine = new SyncEngine({ enabled: true });
      const result = await engine.pushToGitHub(task, "create");

      expect(result.success).toBe(true);
      expect(result.issueNumber).toBe(42);
      expect(mockedCreateIssue).toHaveBeenCalledWith({
        title: "New Task",
        body: "Description",
      });
    });

    it("should update issue state", async () => {
      mockedGetIssue.mockReturnValue({
        number: 42,
        title: "Task",
        body: "",
        state: "open",
        labels: [],
        assignees: [],
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      });
      mockedUpdateIssueState.mockReturnValue(true);

      const task: LocalTask = {
        id: "t1",
        title: "Task",
        status: "done",
        issueNumber: 42,
        updatedAt: "2025-01-01T00:00:00Z",
      };

      const engine = new SyncEngine({ enabled: true });
      const result = await engine.pushToGitHub(task, "update");

      expect(result.success).toBe(true);
      expect(mockedUpdateIssueState).toHaveBeenCalledWith(42, "closed");
    });

    it("should add comment to issue", async () => {
      mockedAddIssueComment.mockReturnValue(true);

      const task: LocalTask = {
        id: "t1",
        title: "Task",
        status: "in_progress",
        issueNumber: 42,
        updatedAt: "2025-01-01T00:00:00Z",
      };

      const engine = new SyncEngine({ enabled: true });
      const result = await engine.pushToGitHub(task, "comment");

      expect(result.success).toBe(true);
      expect(mockedAddIssueComment).toHaveBeenCalledWith(
        42,
        "Task status updated to: in_progress"
      );
    });

    it("should return error when no issue number for update", async () => {
      const task: LocalTask = {
        id: "t1",
        title: "Task",
        status: "done",
        updatedAt: "2025-01-01T00:00:00Z",
      };

      const engine = new SyncEngine({ enabled: true });
      const result = await engine.pushToGitHub(task, "update");

      expect(result.success).toBe(false);
      expect(result.error).toBe("No issue number linked");
    });
  });

  describe("syncTask", () => {
    it("should create issue when no issue number", async () => {
      mockedCreateIssue.mockReturnValue({
        number: 42,
        title: "Task",
        body: "",
        state: "open",
        labels: [],
        assignees: [],
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      });

      const task: LocalTask = {
        id: "t1",
        title: "Task",
        status: "todo",
        updatedAt: "2025-01-01T00:00:00Z",
      };

      const engine = new SyncEngine({ enabled: true });
      const result = await engine.syncTask(task);

      expect(result.success).toBe(true);
      expect(result.action).toBe("created");
    });

    it("should recreate issue when deleted", async () => {
      mockedGetIssue.mockReturnValue(null);
      mockedCreateIssue.mockReturnValue({
        number: 43,
        title: "Task",
        body: "",
        state: "open",
        labels: [],
        assignees: [],
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      });

      const task: LocalTask = {
        id: "t1",
        title: "Task",
        status: "todo",
        issueNumber: 42,
        updatedAt: "2025-01-01T00:00:00Z",
      };

      const engine = new SyncEngine({ enabled: true });
      const result = await engine.syncTask(task);

      expect(result.action).toBe("recreated");
    });

    it("should update when status differs", async () => {
      mockedGetIssue.mockReturnValue({
        number: 42,
        title: "Task",
        body: "",
        state: "open",
        labels: [],
        assignees: [],
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      });
      mockedUpdateIssueState.mockReturnValue(true);

      const task: LocalTask = {
        id: "t1",
        title: "Task",
        status: "done",
        issueNumber: 42,
        updatedAt: "2025-01-01T00:00:00Z",
      };

      const engine = new SyncEngine({ enabled: true });
      const result = await engine.syncTask(task);

      expect(result.action).toBe("updated");
    });

    it("should return unchanged when status matches", async () => {
      mockedGetIssue.mockReturnValue({
        number: 42,
        title: "Task",
        body: "",
        state: "open",
        labels: [],
        assignees: [],
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      });

      const task: LocalTask = {
        id: "t1",
        title: "Task",
        status: "todo", // Matches open state
        issueNumber: 42,
        updatedAt: "2025-01-01T00:00:00Z",
      };

      const engine = new SyncEngine({ enabled: true });
      const result = await engine.syncTask(task);

      expect(result.action).toBe("unchanged");
    });
  });

  describe("handleGitEvent", () => {
    it("should load issue context on checkout", async () => {
      mockedGetIssue.mockReturnValue({
        number: 42,
        title: "Feature Issue",
        body: "",
        state: "open",
        labels: [],
        assignees: [],
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      });

      const engine = new SyncEngine({ enabled: true });
      const result = await engine.handleGitEvent({
        type: "checkout",
        branch: "42-feat-feature",
        issueNumber: 42,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain("Feature Issue");
    });

    it("should add comment on commit", async () => {
      mockedAddIssueComment.mockReturnValue(true);

      const engine = new SyncEngine({ enabled: true });
      const result = await engine.handleGitEvent({
        type: "commit",
        issueNumber: 42,
        message: "feat: add new feature\n\nDetails here",
      });

      expect(result.success).toBe(true);
      expect(mockedAddIssueComment).toHaveBeenCalledWith(
        42,
        "Commit: feat: add new feature"
      );
    });

    it("should suggest PR creation on push", async () => {
      const engine = new SyncEngine({ enabled: true });
      const result = await engine.handleGitEvent({ type: "push" });

      expect(result.success).toBe(true);
      expect(result.message).toContain("PR");
    });

    it("should close issue on merge with done status", async () => {
      mockedUpdateIssueState.mockReturnValue(true);

      const engine = new SyncEngine({ enabled: true });
      const result = await engine.handleGitEvent({
        type: "merge",
        issueNumber: 42,
        status: "done",
      });

      expect(result.success).toBe(true);
      expect(mockedUpdateIssueState).toHaveBeenCalledWith(42, "closed");
    });
  });
});

describe("createSyncEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetRepoInfo.mockReturnValue({ owner: "org", repo: "repo" });
    mockedIsAuthenticated.mockReturnValue(true);
  });

  it("should create sync engine with default config", () => {
    const engine = createSyncEngine();

    expect(engine).toBeInstanceOf(SyncEngine);
  });

  it("should create sync engine with custom config", () => {
    const engine = createSyncEngine({ enabled: true, autoSync: false });

    expect(engine.canSync()).toBe(true);
  });
});
