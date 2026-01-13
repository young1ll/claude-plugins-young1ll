/**
 * MCP Tools Integration Tests
 *
 * Tests for MCP tool handlers with real database integration.
 * These tests simulate the actual tool invocations.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "crypto";
import {
  createTestContext,
  cleanupTestContext,
  type TestContext,
} from "../helpers/mcp-test-helper.js";
import { createTaskEvent } from "../../storage/lib/events.js";

describe("MCP Tools Integration", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
  });

  afterEach(() => {
    cleanupTestContext(ctx);
  });

  // ============================================
  // Project Tools
  // ============================================
  describe("Project Tools", () => {
    describe("pm_project_create", () => {
      it("should create a new project", () => {
        const project = ctx.projectRepo.create("Test Project", "A test project");

        expect(project).toBeDefined();
        expect(project.id).toBeDefined();
        expect(project.name).toBe("Test Project");
        expect(project.description).toBe("A test project");
        expect(project.status).toBe("active");
      });

      it("should create project without description", () => {
        const project = ctx.projectRepo.create("Minimal Project");

        expect(project.name).toBe("Minimal Project");
        expect(project.description).toBeNull();
      });
    });

    describe("pm_project_list", () => {
      it("should list all projects", () => {
        ctx.projectRepo.create("Project 1");
        ctx.projectRepo.create("Project 2");
        ctx.projectRepo.create("Project 3");

        const projects = ctx.projectRepo.list();

        expect(projects).toHaveLength(3);
      });

      it("should return empty array when no projects", () => {
        const projects = ctx.projectRepo.list();

        expect(projects).toHaveLength(0);
      });
    });
  });

  // ============================================
  // Task Tools
  // ============================================
  describe("Task Tools", () => {
    let projectId: string;

    beforeEach(() => {
      const project = ctx.projectRepo.create("Test Project");
      projectId = project.id;
    });

    describe("pm_task_create", () => {
      it("should create a task with events", () => {
        const taskId = randomUUID();

        createTaskEvent(ctx.eventStore, "TaskCreated", taskId, {
          title: "Test Task",
          description: "Task description",
          projectId,
          type: "task",
          priority: "medium",
        });

        const task = ctx.taskRepo.syncFromEvents(taskId);

        expect(task).toBeDefined();
        expect(task?.id).toBe(taskId);
        expect(task?.title).toBe("Test Task");
        expect(task?.status).toBe("todo");
      });

      it("should create task with estimate", () => {
        const taskId = randomUUID();

        createTaskEvent(ctx.eventStore, "TaskCreated", taskId, {
          title: "Estimated Task",
          projectId,
          type: "story",
          priority: "high",
        });

        createTaskEvent(ctx.eventStore, "TaskEstimated", taskId, {
          points: 5,
        });

        const task = ctx.taskRepo.syncFromEvents(taskId);

        expect(task?.estimate_points).toBe(5);
      });

      it("should create task and add to sprint", () => {
        const sprint = ctx.sprintRepo.create(
          projectId,
          "Sprint 1",
          "2025-01-01",
          "2025-01-14"
        );
        const taskId = randomUUID();

        createTaskEvent(ctx.eventStore, "TaskCreated", taskId, {
          title: "Sprint Task",
          projectId,
          type: "task",
          priority: "medium",
        });

        createTaskEvent(ctx.eventStore, "TaskAddedToSprint", taskId, {
          sprintId: sprint.id,
        });

        const task = ctx.taskRepo.syncFromEvents(taskId);

        expect(task?.sprint_id).toBe(sprint.id);
      });
    });

    describe("pm_task_list", () => {
      beforeEach(() => {
        // Create multiple tasks
        for (let i = 1; i <= 5; i++) {
          const taskId = randomUUID();
          createTaskEvent(ctx.eventStore, "TaskCreated", taskId, {
            title: `Task ${i}`,
            projectId,
            type: i % 2 === 0 ? "bug" : "task",
            priority: i <= 2 ? "high" : "medium",
          });
          ctx.taskRepo.syncFromEvents(taskId);
        }
      });

      it("should list all tasks for project", () => {
        const tasks = ctx.taskRepo.list({ projectId });

        expect(tasks).toHaveLength(5);
      });

      it("should filter tasks by type", () => {
        const bugs = ctx.taskRepo.list({ projectId, type: "bug" });
        const regularTasks = ctx.taskRepo.list({ projectId, type: "task" });

        expect(bugs).toHaveLength(2);
        expect(regularTasks).toHaveLength(3);
      });

      it("should filter tasks by priority", () => {
        const highPriority = ctx.taskRepo.list({ projectId, priority: "high" });

        expect(highPriority).toHaveLength(2);
      });

      it("should support pagination", () => {
        const page1 = ctx.taskRepo.list({ projectId, limit: 2, offset: 0 });
        const page2 = ctx.taskRepo.list({ projectId, limit: 2, offset: 2 });

        expect(page1).toHaveLength(2);
        expect(page2).toHaveLength(2);
      });
    });

    describe("pm_task_get", () => {
      it("should get task by ID", () => {
        const taskId = randomUUID();
        createTaskEvent(ctx.eventStore, "TaskCreated", taskId, {
          title: "Specific Task",
          projectId,
          type: "task",
          priority: "high",
        });
        ctx.taskRepo.syncFromEvents(taskId);

        const task = ctx.taskRepo.getById(taskId);

        expect(task).toBeDefined();
        expect(task?.title).toBe("Specific Task");
      });

      it("should return undefined for non-existent task", () => {
        const task = ctx.taskRepo.getById("non-existent-id");

        expect(task).toBeUndefined();
      });
    });

    describe("pm_task_update", () => {
      it("should update task title", () => {
        const taskId = randomUUID();
        createTaskEvent(ctx.eventStore, "TaskCreated", taskId, {
          title: "Original Title",
          projectId,
          type: "task",
          priority: "medium",
        });
        ctx.taskRepo.syncFromEvents(taskId);

        createTaskEvent(ctx.eventStore, "TaskUpdated", taskId, {
          title: "Updated Title",
        });
        const updated = ctx.taskRepo.syncFromEvents(taskId);

        expect(updated?.title).toBe("Updated Title");
      });

      it("should update task assignee", () => {
        const taskId = randomUUID();
        createTaskEvent(ctx.eventStore, "TaskCreated", taskId, {
          title: "Task",
          projectId,
          type: "task",
          priority: "medium",
        });
        ctx.taskRepo.syncFromEvents(taskId);

        createTaskEvent(ctx.eventStore, "TaskUpdated", taskId, {
          assignee: "developer",
        });
        const updated = ctx.taskRepo.syncFromEvents(taskId);

        expect(updated?.assignee).toBe("developer");
      });

      it("should update estimate points", () => {
        const taskId = randomUUID();
        createTaskEvent(ctx.eventStore, "TaskCreated", taskId, {
          title: "Task",
          projectId,
          type: "task",
          priority: "medium",
        });
        ctx.taskRepo.syncFromEvents(taskId);

        createTaskEvent(ctx.eventStore, "TaskEstimated", taskId, {
          points: 8,
        });
        const updated = ctx.taskRepo.syncFromEvents(taskId);

        expect(updated?.estimate_points).toBe(8);
      });
    });

    describe("pm_task_status", () => {
      it("should change task status", () => {
        const taskId = randomUUID();
        createTaskEvent(ctx.eventStore, "TaskCreated", taskId, {
          title: "Task",
          projectId,
          type: "task",
          priority: "medium",
        });
        ctx.taskRepo.syncFromEvents(taskId);

        createTaskEvent(ctx.eventStore, "TaskStatusChanged", taskId, {
          from: "todo",
          to: "in_progress",
          reason: "Starting work",
        });
        const updated = ctx.taskRepo.syncFromEvents(taskId);

        expect(updated?.status).toBe("in_progress");
      });

      it("should track status through workflow", () => {
        const taskId = randomUUID();
        createTaskEvent(ctx.eventStore, "TaskCreated", taskId, {
          title: "Task",
          projectId,
          type: "task",
          priority: "medium",
        });
        ctx.taskRepo.syncFromEvents(taskId);

        // todo -> in_progress -> in_review -> done
        const transitions = [
          { from: "todo", to: "in_progress" },
          { from: "in_progress", to: "in_review" },
          { from: "in_review", to: "done" },
        ];

        transitions.forEach(({ from, to }) => {
          createTaskEvent(ctx.eventStore, "TaskStatusChanged", taskId, {
            from,
            to,
          });
        });

        const updated = ctx.taskRepo.syncFromEvents(taskId);

        expect(updated?.status).toBe("done");
        expect(updated?.completed_at).toBeDefined();
      });
    });

    describe("pm_task_board", () => {
      beforeEach(() => {
        // Create tasks with different statuses
        const statuses = ["todo", "in_progress", "in_review", "done", "blocked"];

        statuses.forEach((status, i) => {
          const taskId = randomUUID();
          createTaskEvent(ctx.eventStore, "TaskCreated", taskId, {
            title: `Task ${status}`,
            projectId,
            type: "task",
            priority: "medium",
          });

          if (status !== "todo") {
            createTaskEvent(ctx.eventStore, "TaskStatusChanged", taskId, {
              from: "todo",
              to: status,
            });
          }

          ctx.taskRepo.syncFromEvents(taskId);
        });
      });

      it("should group tasks by status", () => {
        const board = ctx.taskRepo.getByStatus(projectId);

        expect(board.todo).toHaveLength(1);
        expect(board.in_progress).toHaveLength(1);
        expect(board.in_review).toHaveLength(1);
        expect(board.done).toHaveLength(1);
        expect(board.blocked).toHaveLength(1);
      });
    });
  });

  // ============================================
  // Sprint Tools
  // ============================================
  describe("Sprint Tools", () => {
    let projectId: string;

    beforeEach(() => {
      const project = ctx.projectRepo.create("Test Project");
      projectId = project.id;
    });

    describe("pm_sprint_create", () => {
      it("should create a sprint", () => {
        const sprint = ctx.sprintRepo.create(
          projectId,
          "Sprint 1",
          "2025-01-01",
          "2025-01-14",
          "Complete auth module"
        );

        expect(sprint).toBeDefined();
        expect(sprint.name).toBe("Sprint 1");
        expect(sprint.goal).toBe("Complete auth module");
        expect(sprint.status).toBe("planning");
      });

      it("should create sprint without goal", () => {
        const sprint = ctx.sprintRepo.create(
          projectId,
          "Sprint 2",
          "2025-01-15",
          "2025-01-28"
        );

        expect(sprint.goal).toBeNull();
      });
    });

    describe("pm_sprint_list", () => {
      it("should list sprints for project", () => {
        ctx.sprintRepo.create(projectId, "Sprint 1", "2025-01-01", "2025-01-14");
        ctx.sprintRepo.create(projectId, "Sprint 2", "2025-01-15", "2025-01-28");

        const sprints = ctx.sprintRepo.list(projectId);

        expect(sprints).toHaveLength(2);
      });
    });

    describe("pm_sprint_start", () => {
      it("should start a sprint", () => {
        const sprint = ctx.sprintRepo.create(
          projectId,
          "Sprint 1",
          "2025-01-01",
          "2025-01-14"
        );

        const started = ctx.sprintRepo.start(sprint.id);

        expect(started?.status).toBe("active");
      });
    });

    describe("pm_sprint_complete", () => {
      it("should complete a sprint", () => {
        const sprint = ctx.sprintRepo.create(
          projectId,
          "Sprint 1",
          "2025-01-01",
          "2025-01-14"
        );
        ctx.sprintRepo.start(sprint.id);

        const completed = ctx.sprintRepo.complete(sprint.id);

        expect(completed?.status).toBe("completed");
        expect(completed?.completed_at).toBeDefined();
      });
    });

    describe("pm_sprint_add_tasks", () => {
      it("should add tasks to sprint", () => {
        const sprint = ctx.sprintRepo.create(
          projectId,
          "Sprint 1",
          "2025-01-01",
          "2025-01-14"
        );

        const taskIds: string[] = [];
        for (let i = 0; i < 3; i++) {
          const taskId = randomUUID();
          createTaskEvent(ctx.eventStore, "TaskCreated", taskId, {
            title: `Task ${i + 1}`,
            projectId,
            type: "task",
            priority: "medium",
          });
          ctx.taskRepo.syncFromEvents(taskId);
          taskIds.push(taskId);
        }

        ctx.sprintRepo.addTasks(sprint.id, taskIds);
        const status = ctx.sprintRepo.getStatus(sprint.id);

        expect(status?.tasks).toHaveLength(3);
      });
    });

    describe("pm_sprint_status", () => {
      it("should return sprint status with breakdown", () => {
        const sprint = ctx.sprintRepo.create(
          projectId,
          "Sprint 1",
          "2025-01-01",
          "2025-01-14"
        );

        // Create tasks with different statuses and points
        const tasks = [
          { status: "todo", points: 3 },
          { status: "in_progress", points: 5 },
          { status: "done", points: 2 },
          { status: "done", points: 3 },
        ];

        tasks.forEach(({ status, points }, i) => {
          const taskId = randomUUID();
          createTaskEvent(ctx.eventStore, "TaskCreated", taskId, {
            title: `Task ${i + 1}`,
            projectId,
            type: "task",
            priority: "medium",
          });
          createTaskEvent(ctx.eventStore, "TaskEstimated", taskId, { points });
          createTaskEvent(ctx.eventStore, "TaskAddedToSprint", taskId, {
            sprintId: sprint.id,
          });

          if (status !== "todo") {
            createTaskEvent(ctx.eventStore, "TaskStatusChanged", taskId, {
              from: "todo",
              to: status,
            });
          }

          ctx.taskRepo.syncFromEvents(taskId);
        });

        const status = ctx.sprintRepo.getStatus(sprint.id);

        expect(status).toBeDefined();
        expect(status?.tasks).toHaveLength(4);
        expect(status?.totalPoints).toBe(13); // 3+5+2+3
        expect(status?.completedPoints).toBe(5); // 2+3 (done tasks)
      });
    });
  });

  // ============================================
  // Analytics Tools
  // ============================================
  describe("Analytics Tools", () => {
    let projectId: string;

    beforeEach(() => {
      const project = ctx.projectRepo.create("Test Project");
      projectId = project.id;
    });

    describe("pm_velocity_calculate", () => {
      it("should calculate velocity from completed sprints", () => {
        // Create and complete sprints with velocity records
        const sprintData = [
          { name: "Sprint 1", velocity: 20 },
          { name: "Sprint 2", velocity: 25 },
          { name: "Sprint 3", velocity: 22 },
        ];

        sprintData.forEach(({ name, velocity }) => {
          const sprint = ctx.sprintRepo.create(
            projectId,
            name,
            "2025-01-01",
            "2025-01-14"
          );

          // Manually insert velocity history record
          ctx.dbManager.execute(
            `INSERT INTO velocity_history (project_id, sprint_id, committed_points, completed_points, completion_rate)
             VALUES (?, ?, ?, ?, ?)`,
            [projectId, sprint.id, velocity, velocity, 1.0]
          );
        });

        const result = ctx.analyticsRepo.calculateVelocity(projectId, 3);

        expect(result.average).toBeCloseTo(22.33, 1); // (20+25+22)/3
        expect(result.trend).toHaveLength(3);
      });

      it("should return zero velocity when no completed sprints", () => {
        const result = ctx.analyticsRepo.calculateVelocity(projectId);

        expect(result.average).toBe(0);
        expect(result.trend).toHaveLength(0);
      });
    });

    describe("pm_burndown_data", () => {
      it("should return burndown data for sprint", () => {
        const sprint = ctx.sprintRepo.create(
          projectId,
          "Sprint 1",
          "2025-01-01",
          "2025-01-14"
        );

        // Create tasks
        const taskId1 = randomUUID();
        createTaskEvent(ctx.eventStore, "TaskCreated", taskId1, {
          title: "Task 1",
          projectId,
          type: "task",
          priority: "medium",
        });
        createTaskEvent(ctx.eventStore, "TaskEstimated", taskId1, { points: 5 });
        createTaskEvent(ctx.eventStore, "TaskAddedToSprint", taskId1, {
          sprintId: sprint.id,
        });
        ctx.taskRepo.syncFromEvents(taskId1);

        const burndown = ctx.analyticsRepo.getBurndownData(sprint.id);

        // Should have data points for each day of sprint
        expect(burndown.length).toBeGreaterThan(0);
      });
    });
  });

  // ============================================
  // Git Integration Tools
  // ============================================
  describe("Git Integration Tools", () => {
    let projectId: string;

    beforeEach(() => {
      const project = ctx.projectRepo.create("Test Project");
      projectId = project.id;
    });

    describe("pm_git_branch_create simulation", () => {
      it("should generate branch name for task", () => {
        const taskId = randomUUID();
        createTaskEvent(ctx.eventStore, "TaskCreated", taskId, {
          title: "Add user authentication",
          projectId,
          type: "task",
          priority: "high",
        });
        const task = ctx.taskRepo.syncFromEvents(taskId);

        // Simulate branch name generation
        const type = "feat";
        const description = task!.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 30);
        const branchName = `${task!.id.slice(0, 8)}-${type}-${description}`;

        expect(branchName).toMatch(/^[a-f0-9]{8}-feat-add-user-authentication$/);
      });
    });

    describe("pm_git_commit_link", () => {
      it("should link commit to task", () => {
        const taskId = randomUUID();
        createTaskEvent(ctx.eventStore, "TaskCreated", taskId, {
          title: "Task",
          projectId,
          type: "task",
          priority: "medium",
        });
        ctx.taskRepo.syncFromEvents(taskId);

        createTaskEvent(ctx.eventStore, "TaskLinkedToCommit", taskId, {
          commitSha: "abc1234567890",
          branch: "feat/test",
          message: "feat: implement feature",
        });
        ctx.taskRepo.syncFromEvents(taskId);

        // Verify event was recorded
        const events = ctx.eventStore.getEvents("task", taskId);
        const linkEvent = events.find(e => e.eventType === "TaskLinkedToCommit");

        expect(linkEvent).toBeDefined();
        expect((linkEvent!.payload as any).commitSha).toBe("abc1234567890");
      });
    });
  });

  // ============================================
  // Event Sourcing Integration
  // ============================================
  describe("Event Sourcing Integration", () => {
    let projectId: string;

    beforeEach(() => {
      const project = ctx.projectRepo.create("Test Project");
      projectId = project.id;
    });

    it("should replay all events to reconstruct task state", () => {
      const taskId = randomUUID();

      // Create a series of events
      createTaskEvent(ctx.eventStore, "TaskCreated", taskId, {
        title: "Original Title",
        projectId,
        type: "task",
        priority: "low",
      });

      createTaskEvent(ctx.eventStore, "TaskUpdated", taskId, {
        title: "Updated Title",
        priority: "high",
      });

      createTaskEvent(ctx.eventStore, "TaskEstimated", taskId, {
        points: 5,
      });

      createTaskEvent(ctx.eventStore, "TaskStatusChanged", taskId, {
        from: "todo",
        to: "in_progress",
      });

      createTaskEvent(ctx.eventStore, "TaskAssigned", taskId, {
        assignee: "developer",
      });

      // Sync from events
      const task = ctx.taskRepo.syncFromEvents(taskId);

      // Verify final state
      expect(task?.title).toBe("Updated Title");
      expect(task?.priority).toBe("high");
      expect(task?.estimate_points).toBe(5);
      expect(task?.status).toBe("in_progress");
      expect(task?.assignee).toBe("developer");
    });

    it("should preserve event history", () => {
      const taskId = randomUUID();

      createTaskEvent(ctx.eventStore, "TaskCreated", taskId, {
        title: "Task",
        projectId,
        type: "task",
        priority: "medium",
      });

      createTaskEvent(ctx.eventStore, "TaskStatusChanged", taskId, {
        from: "todo",
        to: "in_progress",
      });

      createTaskEvent(ctx.eventStore, "TaskStatusChanged", taskId, {
        from: "in_progress",
        to: "done",
      });

      ctx.taskRepo.syncFromEvents(taskId);

      const events = ctx.eventStore.getEvents("task", taskId);

      expect(events).toHaveLength(3);
      expect(events[0].eventType).toBe("TaskCreated");
      expect(events[1].eventType).toBe("TaskStatusChanged");
      expect(events[2].eventType).toBe("TaskStatusChanged");
    });
  });
});
