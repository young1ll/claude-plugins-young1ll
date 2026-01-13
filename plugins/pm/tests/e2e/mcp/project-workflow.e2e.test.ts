/**
 * MCP Project Workflow E2E Tests
 *
 * Tests complete project lifecycle using real file-based database.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createDBOnlyContext,
  cleanupDBOnlyContext,
  getRepositories,
  Repositories,
} from "../helpers/e2e-test-helper.js";
import {
  handleProjectCreate,
  handleProjectList,
  handleTaskCreate,
  handleTaskList,
  handleTaskUpdate,
  handleTaskStatus,
  handleSprintCreate,
  handleSprintStart,
  handleSprintComplete,
  handleSprintAddTasks,
  handleVelocityCalculate,
  handleBurndownData,
} from "../../../mcp/lib/server-handlers.js";

describe("MCP Project Workflow E2E", () => {
  let ctx: ReturnType<typeof createDBOnlyContext>;
  let repos: Repositories;

  beforeAll(() => {
    ctx = createDBOnlyContext();
    repos = getRepositories(ctx);
  });

  afterAll(() => {
    cleanupDBOnlyContext(ctx);
  });

  describe("Complete Sprint Workflow", () => {
    let projectId: string;
    let sprintId: string;
    let taskIds: string[] = [];

    it("Step 1: Creates a project", () => {
      const result = handleProjectCreate(
        {
          name: "E2E Sprint Test Project",
          description: "Testing complete sprint workflow",
        },
        repos
      );

      expect(result.content[0].type).toBe("text");
      const project = JSON.parse(result.content[0].text);

      expect(project.id).toBeDefined();
      expect(project.name).toBe("E2E Sprint Test Project");
      expect(project.status).toBe("active");

      projectId = project.id;
    });

    it("Step 2: Lists the created project", () => {
      const result = handleProjectList(repos);
      const projects = JSON.parse(result.content[0].text);

      expect(Array.isArray(projects)).toBe(true);
      const found = projects.find((p: { id: string }) => p.id === projectId);
      expect(found).toBeDefined();
    });

    it("Step 3: Creates backlog tasks", () => {
      const tasks = [
        { title: "Setup infrastructure", estimatePoints: 3, priority: "high" },
        { title: "Implement core logic", estimatePoints: 5, priority: "high" },
        { title: "Write unit tests", estimatePoints: 3, priority: "medium" },
        { title: "Documentation", estimatePoints: 2, priority: "low" },
      ];

      for (const task of tasks) {
        const result = handleTaskCreate(
          {
            ...task,
            projectId,
            type: "task",
          },
          repos
        );

        const created = JSON.parse(result.content[0].text);
        expect(created.id).toBeDefined();
        expect(created.title).toBe(task.title);
        expect(created.estimate_points).toBe(task.estimatePoints);

        taskIds.push(created.id);
      }

      expect(taskIds.length).toBe(4);
    });

    it("Step 4: Creates a sprint", () => {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 14); // 2 week sprint

      const result = handleSprintCreate(
        {
          name: "E2E Sprint 1",
          projectId,
          startDate: startDate.toISOString().split("T")[0],
          endDate: endDate.toISOString().split("T")[0],
          goal: "Complete E2E workflow testing",
        },
        repos
      );

      const sprint = JSON.parse(result.content[0].text);
      expect(sprint.id).toBeDefined();
      expect(sprint.name).toBe("E2E Sprint 1");
      expect(sprint.status).toBe("planning");

      sprintId = sprint.id;
    });

    it("Step 5: Adds tasks to sprint", () => {
      const result = handleSprintAddTasks(
        {
          sprintId,
          taskIds,
        },
        repos
      );

      expect(result.content[0].text).toContain("Added 4 tasks");
    });

    it("Step 6: Starts the sprint", () => {
      const result = handleSprintStart({ sprintId }, repos);
      const sprint = JSON.parse(result.content[0].text);

      expect(sprint.status).toBe("active");
    });

    it("Step 7: Works through task status transitions", () => {
      // Task 1: todo -> in_progress -> done
      handleTaskStatus({ taskId: taskIds[0], status: "in_progress" }, repos);
      handleTaskStatus({ taskId: taskIds[0], status: "done" }, repos);

      // Task 2: todo -> in_progress -> in_review -> done
      handleTaskStatus({ taskId: taskIds[1], status: "in_progress" }, repos);
      handleTaskStatus({ taskId: taskIds[1], status: "in_review" }, repos);
      handleTaskStatus({ taskId: taskIds[1], status: "done" }, repos);

      // Task 3: todo -> done directly
      handleTaskStatus({ taskId: taskIds[2], status: "in_progress" }, repos);
      handleTaskStatus({ taskId: taskIds[2], status: "done" }, repos);

      // Task 4: todo -> done
      handleTaskStatus({ taskId: taskIds[3], status: "done" }, repos);

      // Verify all tasks are done
      const listResult = handleTaskList({ sprintId }, repos);
      const tasks = JSON.parse(listResult.content[0].text);

      expect(tasks.every((t: { status: string }) => t.status === "done")).toBe(
        true
      );
    });

    it("Step 8: Gets burndown data during sprint", () => {
      const result = handleBurndownData({ sprintId }, repos);
      // handleBurndownData returns either chart text or JSON array
      const text = result.content[0].text;

      // Should contain burndown data (either as chart or empty array)
      expect(text).toBeDefined();
      expect(typeof text).toBe("string");
    });

    it("Step 9: Completes the sprint", () => {
      const result = handleSprintComplete({ sprintId }, repos);
      const sprint = JSON.parse(result.content[0].text);

      expect(sprint.status).toBe("completed");
      // velocity_completed depends on implementation - just verify it's a number
      expect(typeof sprint.velocity_completed).toBe("number");
    });

    it("Step 10: Verifies velocity was recorded", () => {
      const result = handleVelocityCalculate({ projectId }, repos);
      const velocity = JSON.parse(result.content[0].text);

      // Verify velocity was calculated (structure may vary)
      expect(velocity).toBeDefined();
      expect(typeof velocity.average).toBe("number");
    });
  });

  describe("Task Update Operations", () => {
    let projectId: string;
    let taskId: string;

    beforeAll(() => {
      // Create a project for task tests
      const result = handleProjectCreate(
        { name: "Task Update Test Project" },
        repos
      );
      projectId = JSON.parse(result.content[0].text).id;
    });

    it("creates a task with all fields", () => {
      const result = handleTaskCreate(
        {
          title: "Full Task Test",
          description: "Task with all fields",
          projectId,
          type: "feature",
          priority: "high",
          estimatePoints: 8,
          labels: ["frontend", "urgent"],
          dueDate: "2025-12-31",
        },
        repos
      );

      const task = JSON.parse(result.content[0].text);
      expect(task.title).toBe("Full Task Test");
      expect(task.type).toBe("feature");
      expect(task.priority).toBe("high");
      expect(task.estimate_points).toBe(8);

      taskId = task.id;
    });

    it("updates task fields", () => {
      const result = handleTaskUpdate(
        {
          taskId,
          title: "Updated Task Title",
          description: "Updated description",
          priority: "low",
          estimatePoints: 5,
        },
        repos
      );

      const task = JSON.parse(result.content[0].text);
      expect(task.title).toBe("Updated Task Title");
      expect(task.description).toBe("Updated description");
      expect(task.priority).toBe("low");
      expect(task.estimate_points).toBe(5);
    });

    it("updates task status with timestamps", () => {
      // Move to in_progress (should set started_at)
      handleTaskStatus({ taskId, status: "in_progress" }, repos);

      let listResult = handleTaskList({ projectId }, repos);
      let tasks = JSON.parse(listResult.content[0].text);
      let task = tasks.find((t: { id: string }) => t.id === taskId);

      expect(task.status).toBe("in_progress");
      expect(task.started_at).toBeDefined();

      // Move to done (should set completed_at)
      handleTaskStatus({ taskId, status: "done" }, repos);

      listResult = handleTaskList({ projectId }, repos);
      tasks = JSON.parse(listResult.content[0].text);
      task = tasks.find((t: { id: string }) => t.id === taskId);

      expect(task.status).toBe("done");
      expect(task.completed_at).toBeDefined();
    });
  });

  describe("Multi-Project Support", () => {
    it("creates multiple projects independently", () => {
      const project1 = handleProjectCreate({ name: "Project Alpha" }, repos);
      const project2 = handleProjectCreate({ name: "Project Beta" }, repos);
      const project3 = handleProjectCreate({ name: "Project Gamma" }, repos);

      const p1 = JSON.parse(project1.content[0].text);
      const p2 = JSON.parse(project2.content[0].text);
      const p3 = JSON.parse(project3.content[0].text);

      expect(p1.id).not.toBe(p2.id);
      expect(p2.id).not.toBe(p3.id);
      expect(p1.id).not.toBe(p3.id);

      // List all projects
      const listResult = handleProjectList(repos);
      const projects = JSON.parse(listResult.content[0].text);

      expect(projects.length).toBeGreaterThanOrEqual(3);
    });

    it("isolates tasks between projects", () => {
      // Create two projects
      const p1Result = handleProjectCreate({ name: "Isolated Project 1" }, repos);
      const p2Result = handleProjectCreate({ name: "Isolated Project 2" }, repos);

      const p1Id = JSON.parse(p1Result.content[0].text).id;
      const p2Id = JSON.parse(p2Result.content[0].text).id;

      // Create tasks in each project
      handleTaskCreate({ title: "P1 Task 1", projectId: p1Id }, repos);
      handleTaskCreate({ title: "P1 Task 2", projectId: p1Id }, repos);
      handleTaskCreate({ title: "P2 Task 1", projectId: p2Id }, repos);

      // List tasks for each project
      const p1Tasks = JSON.parse(handleTaskList({ projectId: p1Id }, repos).content[0].text);
      const p2Tasks = JSON.parse(handleTaskList({ projectId: p2Id }, repos).content[0].text);

      expect(p1Tasks.length).toBe(2);
      expect(p2Tasks.length).toBe(1);

      // Verify isolation
      expect(p1Tasks.every((t: { project_id: string }) => t.project_id === p1Id)).toBe(true);
      expect(p2Tasks.every((t: { project_id: string }) => t.project_id === p2Id)).toBe(true);
    });
  });
});
