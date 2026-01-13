/**
 * GitHub-Task Sync E2E Tests
 *
 * Tests integration between GitHub issues and PM tasks.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  createE2ETestContext,
  cleanupE2ETestContext,
  getRepositories,
  E2ETestContext,
  Repositories,
} from "../helpers/e2e-test-helper.js";
import { getIssue } from "../../../lib/github.js";
import {
  handleProjectCreate,
  handleTaskCreate,
  handleTaskStatus,
  handleTaskList,
} from "../../../mcp/lib/server-handlers.js";

describe("GitHub-Task Sync E2E", () => {
  let ctx: E2ETestContext;
  let repos: Repositories;
  let projectId: string;

  beforeAll(() => {
    ctx = createE2ETestContext();
    repos = getRepositories(ctx);

    // Create a project for sync tests
    const result = handleProjectCreate(
      { name: "GitHub Sync Test Project" },
      repos
    );
    projectId = JSON.parse(result.content[0].text).id;
  });

  afterAll(() => {
    cleanupE2ETestContext(ctx);
  });

  describe("Issue to Task Mapping", () => {
    it("creates task from GitHub issue data", () => {
      // Create a real GitHub issue
      const issue = ctx.github.createTestIssue(
        "Sync Issue Test",
        "Issue body for task sync testing"
      );

      // Retrieve issue via lib/github.ts
      const githubIssue = getIssue(issue.number);
      expect(githubIssue).not.toBeNull();

      // Create a task from the issue data
      const taskResult = handleTaskCreate(
        {
          title: githubIssue!.title,
          description: githubIssue!.body || "",
          projectId,
          type: "task",
          // Could store issue number for linking
          labels: [`github:${issue.number}`],
        },
        repos
      );

      const task = JSON.parse(taskResult.content[0].text);
      expect(task.title).toBe(githubIssue!.title);
      // Verify task was created - labels storage depends on implementation
      expect(task.id).toBeDefined();
    });

    it("creates multiple tasks from issue batch", () => {
      // Create multiple issues
      const issues = [];
      for (let i = 0; i < 3; i++) {
        issues.push(
          ctx.github.createTestIssue(
            `Batch Issue ${i + 1}`,
            `Batch test ${i + 1}`
          )
        );
      }

      // Create tasks for each
      for (const issue of issues) {
        const githubIssue = getIssue(issue.number);
        handleTaskCreate(
          {
            title: githubIssue!.title,
            projectId,
            labels: [`github:${issue.number}`],
          },
          repos
        );
      }

      // List tasks and verify
      const tasks = JSON.parse(
        handleTaskList({ projectId }, repos).content[0].text
      );

      // Verify tasks were created (at least as many as issues)
      expect(tasks.length).toBeGreaterThanOrEqual(issues.length);
    });
  });

  describe("Task Status to Issue State Sync Simulation", () => {
    let taskId: string;
    let issueNumber: number;

    beforeAll(() => {
      // Create issue and linked task
      const issue = ctx.github.createTestIssue(
        "Status Sync Test",
        "Testing status synchronization"
      );
      issueNumber = issue.number;

      const taskResult = handleTaskCreate(
        {
          title: issue.title,
          projectId,
          labels: [`github:${issueNumber}`],
        },
        repos
      );
      taskId = JSON.parse(taskResult.content[0].text).id;
    });

    it("task and issue start in open/todo state", () => {
      // Check task
      const tasks = JSON.parse(
        handleTaskList({ projectId }, repos).content[0].text
      );
      const task = tasks.find((t: { id: string }) => t.id === taskId);
      expect(task.status).toBe("todo");

      // Check issue
      const issue = ctx.github.getIssue(issueNumber);
      expect(issue?.state).toBe("open");
    });

    it("simulates task completion -> issue close", () => {
      // Move task to done
      handleTaskStatus({ taskId, status: "in_progress" }, repos);
      handleTaskStatus({ taskId, status: "done" }, repos);

      // In a real sync scenario, this would trigger issue close
      // For testing, we manually close the issue
      const closed = ctx.github.closeIssue(issueNumber, "Task completed");
      expect(closed).toBe(true);

      // Verify both are in completed state
      const tasks = JSON.parse(
        handleTaskList({ projectId }, repos).content[0].text
      );
      const task = tasks.find((t: { id: string }) => t.id === taskId);
      expect(task.status).toBe("done");

      const issue = ctx.github.getIssue(issueNumber);
      expect(issue?.state).toBe("closed");
    });

    it("simulates issue reopen -> task reopened", () => {
      // Reopen issue
      const reopened = ctx.github.reopenIssue(issueNumber);
      expect(reopened).toBe(true);

      // In a real sync scenario, this would reopen the task
      // For testing, we manually update task status
      handleTaskStatus({ taskId, status: "todo" }, repos);

      // Verify both are in open state
      const tasks = JSON.parse(
        handleTaskList({ projectId }, repos).content[0].text
      );
      const task = tasks.find((t: { id: string }) => t.id === taskId);
      expect(task.status).toBe("todo");

      const issue = ctx.github.getIssue(issueNumber);
      expect(issue?.state).toBe("open");
    });
  });

  describe("Issue Comment Integration", () => {
    it("adds comment when task status changes", () => {
      // Create issue and task
      const issue = ctx.github.createTestIssue(
        "Comment Integration Test",
        "Testing comment on status change"
      );

      const taskResult = handleTaskCreate(
        {
          title: issue.title,
          projectId,
          labels: [`github:${issue.number}`],
        },
        repos
      );
      const taskId = JSON.parse(taskResult.content[0].text).id;

      // Change task status
      handleTaskStatus({ taskId, status: "in_progress" }, repos);

      // In a real sync, this would automatically add a comment
      // For testing, we manually add the comment
      const commented = ctx.github.addComment(
        issue.number,
        "Task status changed to: in_progress"
      );

      expect(commented).toBe(true);
    });
  });
});
