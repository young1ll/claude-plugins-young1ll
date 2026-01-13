/**
 * Server Handlers Unit Tests
 *
 * Tests for the extracted handler logic from server.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createTestContext,
  cleanupTestContext,
  TestContext,
} from "../helpers/mcp-test-helper.js";
import {
  handleReadResource,
  handleCallTool,
  handleGetPrompt,
  handleProjectCreate,
  handleProjectList,
  handleTaskCreate,
  handleTaskList,
  handleTaskGet,
  handleTaskUpdate,
  handleTaskStatus,
  handleTaskBoard,
  handleSprintCreate,
  handleSprintList,
  handleSprintStatus,
  handleSprintStart,
  handleSprintComplete,
  handleSprintAddTasks,
  handleVelocityCalculate,
  handleBurndownData,
  handleGitBranchCreate,
  handleGitCommitLink,
  handleGitParseBranch,
  handleGitParseCommit,
  handleGitStats,
  handleGitHotspots,
  TASK_SCHEMA,
  SPRINT_SCHEMA,
  VELOCITY_METHOD_TEXT,
  PM_CONVENTIONS_MD,
  Repositories,
} from "../../mcp/lib/server-handlers.js";

// Mock server-helpers for git functions
vi.mock("../../mcp/lib/server-helpers.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../mcp/lib/server-helpers.js")>();
  return {
    ...actual,
    getCurrentBranch: vi.fn().mockResolvedValue("main"),
    getGitStatus: vi.fn().mockResolvedValue({
      branch: "main",
      hasChanges: false,
      changedFiles: 0,
      unpushedCommits: 0,
    }),
    getGitStats: vi.fn().mockResolvedValue({
      range: "HEAD~30..HEAD",
      commits: 10,
      linesAdded: 500,
      linesDeleted: 200,
      recentCommits: [],
    }),
    getGitHotspots: vi.fn().mockResolvedValue([
      { file: "src/index.ts", changes: 25, risk: "high" },
      { file: "src/utils.ts", changes: 15, risk: "medium" },
    ]),
  };
});

describe("Server Handlers", () => {
  let ctx: TestContext;
  let repos: Repositories;

  beforeEach(() => {
    ctx = createTestContext();
    repos = {
      projectRepo: ctx.projectRepo,
      sprintRepo: ctx.sprintRepo,
      taskRepo: ctx.taskRepo,
      analyticsRepo: ctx.analyticsRepo,
      eventStore: ctx.eventStore,
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanupTestContext(ctx);
  });

  // ============================================
  // Schema Constants Tests
  // ============================================

  describe("Schema Constants", () => {
    it("TASK_SCHEMA has required properties", () => {
      expect(TASK_SCHEMA.type).toBe("object");
      expect(TASK_SCHEMA.properties.id).toBeDefined();
      expect(TASK_SCHEMA.properties.title).toBeDefined();
      expect(TASK_SCHEMA.properties.status).toBeDefined();
      expect(TASK_SCHEMA.required).toContain("title");
    });

    it("SPRINT_SCHEMA has required properties", () => {
      expect(SPRINT_SCHEMA.type).toBe("object");
      expect(SPRINT_SCHEMA.properties.id).toBeDefined();
      expect(SPRINT_SCHEMA.properties.name).toBeDefined();
      expect(SPRINT_SCHEMA.required).toContain("name");
      expect(SPRINT_SCHEMA.required).toContain("startDate");
      expect(SPRINT_SCHEMA.required).toContain("endDate");
    });

    it("VELOCITY_METHOD_TEXT contains formula", () => {
      expect(VELOCITY_METHOD_TEXT).toContain("Story Points");
      expect(VELOCITY_METHOD_TEXT).toContain("Formula");
    });

    it("PM_CONVENTIONS_MD contains conventions", () => {
      expect(PM_CONVENTIONS_MD).toContain("Task Naming");
      expect(PM_CONVENTIONS_MD).toContain("Story Points");
      expect(PM_CONVENTIONS_MD).toContain("Git Branch Naming");
    });
  });

  // ============================================
  // Resource Handler Tests
  // ============================================

  describe("handleReadResource", () => {
    it("returns task schema for pm://schema/task", async () => {
      const result = await handleReadResource("pm://schema/task", repos);
      expect(result.uri).toBe("pm://schema/task");
      expect(result.mimeType).toBe("application/json");
      const schema = JSON.parse(result.text);
      expect(schema.type).toBe("object");
      expect(schema.properties.title).toBeDefined();
    });

    it("returns sprint schema for pm://schema/sprint", async () => {
      const result = await handleReadResource("pm://schema/sprint", repos);
      expect(result.uri).toBe("pm://schema/sprint");
      expect(result.mimeType).toBe("application/json");
      const schema = JSON.parse(result.text);
      expect(schema.properties.startDate).toBeDefined();
    });

    it("returns velocity method for pm://meta/velocity-method", async () => {
      const result = await handleReadResource("pm://meta/velocity-method", repos);
      expect(result.mimeType).toBe("text/plain");
      expect(result.text).toContain("Story Points");
    });

    it("returns conventions for pm://docs/conventions", async () => {
      const result = await handleReadResource("pm://docs/conventions", repos);
      expect(result.mimeType).toBe("text/markdown");
      expect(result.text).toContain("PM Conventions");
    });

    it("returns config for pm://config", async () => {
      // Create a project first
      repos.projectRepo.create("Test Project");

      const result = await handleReadResource("pm://config", repos);
      expect(result.mimeType).toBe("application/json");
      const config = JSON.parse(result.text);
      expect(config.projects).toBeDefined();
      expect(config.projects.length).toBe(1);
    });

    it("returns active context for pm://context/active", async () => {
      const result = await handleReadResource("pm://context/active", repos);
      const context = JSON.parse(result.text);
      expect(context.project).toBeDefined();
      expect(context.sprint).toBeDefined();
      expect(context.gitBranch).toBeDefined();
    });

    it("returns git status for pm://git/status", async () => {
      const result = await handleReadResource("pm://git/status", repos);
      const status = JSON.parse(result.text);
      expect(status.branch).toBe("main");
    });

    it("throws error for unknown resource", async () => {
      await expect(
        handleReadResource("pm://unknown", repos)
      ).rejects.toThrow("Resource not found");
    });
  });

  // ============================================
  // Project Tool Handler Tests
  // ============================================

  describe("Project Handlers", () => {
    describe("handleProjectCreate", () => {
      it("creates a project", () => {
        const result = handleProjectCreate({ name: "Test Project" }, repos);
        expect(result.content[0].text).toContain("Test Project");
        const project = JSON.parse(result.content[0].text);
        expect(project.name).toBe("Test Project");
        expect(project.id).toBeDefined();
      });

      it("creates a project with description", () => {
        const result = handleProjectCreate(
          { name: "Test", description: "A test project" },
          repos
        );
        const project = JSON.parse(result.content[0].text);
        expect(project.description).toBe("A test project");
      });
    });

    describe("handleProjectList", () => {
      it("lists all projects", () => {
        repos.projectRepo.create("Project 1");
        repos.projectRepo.create("Project 2");

        const result = handleProjectList(repos);
        const projects = JSON.parse(result.content[0].text);
        expect(projects.length).toBe(2);
      });

      it("returns empty array when no projects", () => {
        const result = handleProjectList(repos);
        const projects = JSON.parse(result.content[0].text);
        expect(projects).toEqual([]);
      });
    });
  });

  // ============================================
  // Task Tool Handler Tests
  // ============================================

  describe("Task Handlers", () => {
    let projectId: string;

    beforeEach(() => {
      const project = repos.projectRepo.create("Test Project");
      projectId = project.id;
    });

    describe("handleTaskCreate", () => {
      it("creates a task with required fields", () => {
        const result = handleTaskCreate(
          { title: "Test Task", projectId },
          repos
        );
        const task = JSON.parse(result.content[0].text);
        expect(task.title).toBe("Test Task");
        expect(task.status).toBe("todo");
        expect(task.type).toBe("task");
        expect(task.priority).toBe("medium");
      });

      it("creates a task with all fields", () => {
        const result = handleTaskCreate(
          {
            title: "Full Task",
            projectId,
            description: "A detailed task",
            type: "bug",
            priority: "high",
            estimatePoints: 5,
          },
          repos
        );
        const task = JSON.parse(result.content[0].text);
        expect(task.type).toBe("bug");
        expect(task.priority).toBe("high");
        expect(task.estimate_points).toBe(5); // DB uses snake_case
      });

      it("creates a task and adds to sprint", () => {
        const sprint = repos.sprintRepo.create(
          projectId,
          "Sprint 1",
          "2024-01-01",
          "2024-01-14"
        );

        const result = handleTaskCreate(
          { title: "Sprint Task", projectId, sprintId: sprint.id },
          repos
        );
        const task = JSON.parse(result.content[0].text);
        expect(task.sprint_id).toBe(sprint.id); // DB uses snake_case
      });
    });

    describe("handleTaskList", () => {
      beforeEach(() => {
        handleTaskCreate({ title: "Task 1", projectId }, repos);
        handleTaskCreate({ title: "Task 2", projectId, priority: "high" }, repos);
      });

      it("lists all tasks", () => {
        const result = handleTaskList({}, repos);
        const tasks = JSON.parse(result.content[0].text);
        expect(tasks.length).toBe(2);
      });

      it("filters by project", () => {
        const otherProject = repos.projectRepo.create("Other");
        handleTaskCreate({ title: "Other Task", projectId: otherProject.id }, repos);

        const result = handleTaskList({ projectId }, repos);
        const tasks = JSON.parse(result.content[0].text);
        expect(tasks.length).toBe(2);
      });

      it("filters by priority", () => {
        const result = handleTaskList({ priority: "high" }, repos);
        const tasks = JSON.parse(result.content[0].text);
        expect(tasks.length).toBe(1);
        expect(tasks[0].priority).toBe("high");
      });

      it("respects limit and offset", () => {
        const result = handleTaskList({ limit: 1, offset: 0 }, repos);
        const tasks = JSON.parse(result.content[0].text);
        expect(tasks.length).toBe(1);
      });
    });

    describe("handleTaskGet", () => {
      it("returns task by ID", () => {
        const created = handleTaskCreate({ title: "Test", projectId }, repos);
        const task = JSON.parse(created.content[0].text);

        const result = handleTaskGet({ taskId: task.id }, repos);
        const retrieved = JSON.parse(result.content[0].text);
        expect(retrieved.id).toBe(task.id);
        expect(retrieved.title).toBe("Test");
      });

      it("returns not found for invalid ID", () => {
        const result = handleTaskGet({ taskId: "invalid-id" }, repos);
        expect(result.content[0].text).toContain("Task not found");
      });
    });

    describe("handleTaskUpdate", () => {
      it("updates task fields", () => {
        const created = handleTaskCreate({ title: "Original", projectId }, repos);
        const task = JSON.parse(created.content[0].text);

        const result = handleTaskUpdate(
          { taskId: task.id, title: "Updated", priority: "high" },
          repos
        );
        const updated = JSON.parse(result.content[0].text);
        expect(updated.title).toBe("Updated");
        expect(updated.priority).toBe("high");
      });

      it("updates estimate points", () => {
        const created = handleTaskCreate({ title: "Test", projectId }, repos);
        const task = JSON.parse(created.content[0].text);

        const result = handleTaskUpdate(
          { taskId: task.id, estimatePoints: 8 },
          repos
        );
        const updated = JSON.parse(result.content[0].text);
        expect(updated.estimate_points).toBe(8); // DB uses snake_case
      });
    });

    describe("handleTaskStatus", () => {
      it("changes task status", () => {
        const created = handleTaskCreate({ title: "Test", projectId }, repos);
        const task = JSON.parse(created.content[0].text);

        const result = handleTaskStatus(
          { taskId: task.id, status: "in_progress" },
          repos
        );
        const updated = JSON.parse(result.content[0].text);
        expect(updated.status).toBe("in_progress");
      });

      it("includes reason in event", () => {
        const created = handleTaskCreate({ title: "Test", projectId }, repos);
        const task = JSON.parse(created.content[0].text);

        handleTaskStatus(
          { taskId: task.id, status: "blocked", reason: "Waiting for API" },
          repos
        );

        const events = repos.eventStore.getEvents("task", task.id);
        const statusEvent = events.find((e) => e.eventType === "TaskStatusChanged");
        expect(statusEvent?.payload.reason).toBe("Waiting for API");
      });

      it("returns not found for invalid task", () => {
        const result = handleTaskStatus(
          { taskId: "invalid", status: "done" },
          repos
        );
        expect(result.content[0].text).toContain("Task not found");
      });
    });

    describe("handleTaskBoard", () => {
      it("returns tasks grouped by status", () => {
        handleTaskCreate({ title: "Todo Task", projectId }, repos);
        const inProgress = handleTaskCreate({ title: "WIP Task", projectId }, repos);
        handleTaskStatus(
          { taskId: JSON.parse(inProgress.content[0].text).id, status: "in_progress" },
          repos
        );

        const result = handleTaskBoard({ projectId }, repos);
        const board = JSON.parse(result.content[0].text);
        expect(board.todo).toBeDefined();
        expect(board.in_progress).toBeDefined();
      });
    });
  });

  // ============================================
  // Sprint Tool Handler Tests
  // ============================================

  describe("Sprint Handlers", () => {
    let projectId: string;

    beforeEach(() => {
      const project = repos.projectRepo.create("Test Project");
      projectId = project.id;
    });

    describe("handleSprintCreate", () => {
      it("creates a sprint", () => {
        const result = handleSprintCreate(
          {
            name: "Sprint 1",
            projectId,
            startDate: "2024-01-01",
            endDate: "2024-01-14",
          },
          repos
        );
        const sprint = JSON.parse(result.content[0].text);
        expect(sprint.name).toBe("Sprint 1");
        expect(sprint.status).toBe("planning");
      });

      it("creates a sprint with goal", () => {
        const result = handleSprintCreate(
          {
            name: "Sprint 1",
            projectId,
            startDate: "2024-01-01",
            endDate: "2024-01-14",
            goal: "Complete authentication",
          },
          repos
        );
        const sprint = JSON.parse(result.content[0].text);
        expect(sprint.goal).toBe("Complete authentication");
      });
    });

    describe("handleSprintList", () => {
      it("lists sprints for project", () => {
        repos.sprintRepo.create(projectId, "Sprint 1", "2024-01-01", "2024-01-14");
        repos.sprintRepo.create(projectId, "Sprint 2", "2024-01-15", "2024-01-28");

        const result = handleSprintList({ projectId }, repos);
        const sprints = JSON.parse(result.content[0].text);
        expect(sprints.length).toBe(2);
      });
    });

    describe("handleSprintStatus", () => {
      it("returns sprint status with progress", () => {
        const sprint = repos.sprintRepo.create(
          projectId,
          "Sprint 1",
          "2024-01-01",
          "2024-01-14"
        );

        // Create tasks
        handleTaskCreate(
          { title: "Task 1", projectId, sprintId: sprint.id, estimatePoints: 3 },
          repos
        );

        const result = handleSprintStatus({ sprintId: sprint.id }, repos);
        const status = JSON.parse(result.content[0].text);
        expect(status.sprint.name).toBe("Sprint 1");
        expect(status.progress).toBeDefined();
        expect(status.byStatus).toBeDefined();
      });

      it("returns not found for invalid sprint", () => {
        const result = handleSprintStatus({ sprintId: "invalid" }, repos);
        expect(result.content[0].text).toContain("Sprint not found");
      });
    });

    describe("handleSprintStart", () => {
      it("starts a sprint", () => {
        const sprint = repos.sprintRepo.create(
          projectId,
          "Sprint 1",
          "2024-01-01",
          "2024-01-14"
        );

        const result = handleSprintStart({ sprintId: sprint.id }, repos);
        const started = JSON.parse(result.content[0].text);
        expect(started.status).toBe("active");
      });
    });

    describe("handleSprintComplete", () => {
      it("completes a sprint and records velocity", () => {
        const sprint = repos.sprintRepo.create(
          projectId,
          "Sprint 1",
          "2024-01-01",
          "2024-01-14"
        );
        repos.sprintRepo.start(sprint.id);

        const result = handleSprintComplete({ sprintId: sprint.id }, repos);
        const completed = JSON.parse(result.content[0].text);
        expect(completed.status).toBe("completed");
        expect(completed.velocityRecorded).toBe(true);
      });
    });

    describe("handleSprintAddTasks", () => {
      it("adds tasks to sprint", () => {
        const sprint = repos.sprintRepo.create(
          projectId,
          "Sprint 1",
          "2024-01-01",
          "2024-01-14"
        );

        const task1 = JSON.parse(
          handleTaskCreate({ title: "Task 1", projectId }, repos).content[0].text
        );
        const task2 = JSON.parse(
          handleTaskCreate({ title: "Task 2", projectId }, repos).content[0].text
        );

        const result = handleSprintAddTasks(
          { sprintId: sprint.id, taskIds: [task1.id, task2.id] },
          repos
        );
        expect(result.content[0].text).toContain("Added 2 tasks");
      });
    });
  });

  // ============================================
  // Analytics Tool Handler Tests
  // ============================================

  describe("Analytics Handlers", () => {
    let projectId: string;

    beforeEach(() => {
      const project = repos.projectRepo.create("Test Project");
      projectId = project.id;
    });

    describe("handleVelocityCalculate", () => {
      it("calculates velocity", () => {
        const result = handleVelocityCalculate({ projectId }, repos);
        const velocity = JSON.parse(result.content[0].text);
        expect(velocity).toBeDefined();
      });

      it("accepts sprintCount parameter", () => {
        const result = handleVelocityCalculate({ projectId, sprintCount: 5 }, repos);
        expect(result.content[0].text).toBeDefined();
      });
    });

    describe("handleBurndownData", () => {
      it("returns burndown data", () => {
        const sprint = repos.sprintRepo.create(
          projectId,
          "Sprint 1",
          "2024-01-01",
          "2024-01-14"
        );

        const result = handleBurndownData({ sprintId: sprint.id }, repos);
        expect(result.content[0].text).toBeDefined();
      });
    });
  });

  // ============================================
  // Git Tool Handler Tests
  // ============================================

  describe("Git Handlers", () => {
    let projectId: string;

    beforeEach(() => {
      const project = repos.projectRepo.create("Test Project");
      projectId = project.id;
    });

    describe("handleGitBranchCreate", () => {
      it("creates branch name for task", () => {
        const task = JSON.parse(
          handleTaskCreate({ title: "Add user authentication", projectId }, repos)
            .content[0].text
        );

        const result = handleGitBranchCreate({ taskId: task.id }, repos);
        const data = JSON.parse(result.content[0].text);
        expect(data.branchName).toContain("feat");
        expect(data.branchName).toContain("add-user-authentication");
        expect(data.command).toContain("git checkout -b");
      });

      it("uses specified type", () => {
        const task = JSON.parse(
          handleTaskCreate({ title: "Fix bug", projectId }, repos).content[0].text
        );

        const result = handleGitBranchCreate({ taskId: task.id, type: "fix" }, repos);
        const data = JSON.parse(result.content[0].text);
        expect(data.branchName).toContain("fix");
      });

      it("returns not found for invalid task", () => {
        const result = handleGitBranchCreate({ taskId: "invalid" }, repos);
        expect(result.content[0].text).toContain("Task not found");
      });
    });

    describe("handleGitCommitLink", () => {
      it("links commit to task", () => {
        const task = JSON.parse(
          handleTaskCreate({ title: "Test", projectId }, repos).content[0].text
        );

        const result = handleGitCommitLink(
          { taskId: task.id, commitSha: "abc123def456" },
          repos
        );
        expect(result.content[0].text).toContain("Linked commit abc123d");

        // Verify event was created
        const events = repos.eventStore.getEvents("task", task.id);
        const linkEvent = events.find((e) => e.eventType === "TaskLinkedToCommit");
        expect(linkEvent).toBeDefined();
        expect(linkEvent?.payload.commitSha).toBe("abc123def456");
      });

      it("includes branch and message", () => {
        const task = JSON.parse(
          handleTaskCreate({ title: "Test", projectId }, repos).content[0].text
        );

        handleGitCommitLink(
          {
            taskId: task.id,
            commitSha: "abc123",
            branch: "feature/test",
            message: "feat: add test",
          },
          repos
        );

        const events = repos.eventStore.getEvents("task", task.id);
        const linkEvent = events.find((e) => e.eventType === "TaskLinkedToCommit");
        expect(linkEvent?.payload.branch).toBe("feature/test");
        expect(linkEvent?.payload.message).toBe("feat: add test");
      });
    });

    describe("handleGitParseBranch", () => {
      it("parses current branch", async () => {
        const result = await handleGitParseBranch();
        const data = JSON.parse(result.content[0].text);
        expect(data.branch).toBe("main");
      });
    });

    describe("handleGitParseCommit", () => {
      it("parses conventional commit", () => {
        const result = handleGitParseCommit({
          message: "feat(auth): add login feature fixes #42",
        });
        const data = JSON.parse(result.content[0].text);
        expect(data.type).toBe("feat");
        expect(data.scope).toBe("auth");
        expect(data.magicWords).toHaveLength(1);
        expect(data.magicWords[0].action).toBe("fixes");
        expect(data.magicWords[0].issueIds).toContain(42);
      });

      it("detects breaking change", () => {
        const result = handleGitParseCommit({
          message: "feat!: breaking change",
        });
        const data = JSON.parse(result.content[0].text);
        expect(data.breaking).toBe(true);
      });
    });

    describe("handleGitStats", () => {
      it("returns git statistics", async () => {
        const result = await handleGitStats({});
        const stats = JSON.parse(result.content[0].text);
        expect(stats.commits).toBe(10);
        expect(stats.linesAdded).toBe(500);
      });
    });

    describe("handleGitHotspots", () => {
      it("returns hotspot files", async () => {
        const result = await handleGitHotspots({});
        const hotspots = JSON.parse(result.content[0].text);
        expect(hotspots.length).toBe(2);
        expect(hotspots[0].risk).toBe("high");
      });

      it("accepts limit parameter", async () => {
        const result = await handleGitHotspots({ limit: 5 });
        expect(result.content[0].text).toBeDefined();
      });
    });
  });

  // ============================================
  // Main Dispatcher Tests
  // ============================================

  describe("handleCallTool", () => {
    let projectId: string;

    beforeEach(() => {
      const project = repos.projectRepo.create("Test Project");
      projectId = project.id;
    });

    it("dispatches to correct handler", async () => {
      const result = await handleCallTool(
        "pm_project_list",
        {},
        repos
      );
      const projects = JSON.parse(result.content[0].text);
      expect(projects.length).toBe(1);
    });

    it("handles unknown tool", async () => {
      const result = await handleCallTool(
        "unknown_tool",
        {},
        repos
      );
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Unknown tool");
    });

    it("handles tool errors gracefully", async () => {
      const result = await handleCallTool(
        "pm_task_get",
        { taskId: "nonexistent" },
        repos
      );
      expect(result.content[0].text).toContain("Task not found");
    });
  });

  // ============================================
  // Prompt Handler Tests
  // ============================================

  describe("handleGetPrompt", () => {
    describe("sprint-planning", () => {
      it("returns sprint planning prompt", () => {
        const result = handleGetPrompt("sprint-planning", { sprintName: "Sprint 1" });
        expect(result.messages.length).toBe(1);
        expect(result.messages[0].role).toBe("user");
        expect(result.messages[0].content.text).toContain("Sprint Planning");
        expect(result.messages[0].content.text).toContain("Sprint 1");
      });

      it("uses default name when not provided", () => {
        const result = handleGetPrompt("sprint-planning", {});
        expect(result.messages[0].content.text).toContain("New Sprint");
      });

      it("includes duration", () => {
        const result = handleGetPrompt("sprint-planning", { duration: 7 });
        expect(result.messages[0].content.text).toContain("7 days");
      });
    });

    describe("retrospective", () => {
      it("returns retrospective prompt", () => {
        const result = handleGetPrompt("retrospective", { sprintId: "sprint-123" });
        expect(result.messages[0].content.text).toContain("Sprint Retrospective");
        expect(result.messages[0].content.text).toContain("sprint-123");
        expect(result.messages[0].content.text).toContain("Start-Stop-Continue");
      });
    });

    describe("daily-standup", () => {
      it("returns standup prompt", () => {
        const result = handleGetPrompt("daily-standup", {});
        expect(result.messages[0].content.text).toContain("Daily Standup");
        expect(result.messages[0].content.text).toContain("blockers");
      });
    });

    describe("risk-assessment", () => {
      it("returns risk assessment prompt", () => {
        const result = handleGetPrompt("risk-assessment", { projectId: "proj-123" });
        expect(result.messages[0].content.text).toContain("Risk Assessment");
        expect(result.messages[0].content.text).toContain("proj-123");
        expect(result.messages[0].content.text).toContain("Hotspots");
      });
    });

    describe("release-plan", () => {
      it("returns release plan prompt", () => {
        const result = handleGetPrompt("release-plan", { version: "2.0.0" });
        expect(result.messages[0].content.text).toContain("Release Planning");
        expect(result.messages[0].content.text).toContain("2.0.0");
      });

      it("uses default version when not provided", () => {
        const result = handleGetPrompt("release-plan", {});
        expect(result.messages[0].content.text).toContain("Next");
      });
    });

    describe("unknown prompt", () => {
      it("throws error for unknown prompt", () => {
        expect(() => handleGetPrompt("unknown", {})).toThrow("Unknown prompt");
      });
    });
  });
});
