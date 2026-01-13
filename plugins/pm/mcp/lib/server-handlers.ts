/**
 * PM MCP Server Handlers
 *
 * Extracted handler logic from server.ts for testability.
 * These functions implement the core logic for MCP Resources, Tools, and Prompts.
 */

import { randomUUID } from "crypto";
import { EventStore, createTaskEvent } from "../../storage/lib/events.js";
import {
  ProjectRepository,
  SprintRepository,
  TaskRepository,
  AnalyticsRepository,
} from "./projections.js";
import {
  getCurrentBranch,
  getGitStatus,
  parseCommitMessage,
  getGitStats,
  getGitHotspots,
} from "./server-helpers.js";

// ============================================
// Types
// ============================================

export interface Repositories {
  projectRepo: ProjectRepository;
  sprintRepo: SprintRepository;
  taskRepo: TaskRepository;
  analyticsRepo: AnalyticsRepository;
  eventStore: EventStore;
}

export interface ResourceContent {
  uri: string;
  mimeType: string;
  text: string;
}

export interface ToolResult {
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

export interface PromptMessage {
  role: "user" | "assistant";
  content: {
    type: "text";
    text: string;
  };
}

// ============================================
// Resource Schemas (Static)
// ============================================

export const TASK_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    title: { type: "string", minLength: 1 },
    description: { type: "string" },
    status: {
      type: "string",
      enum: ["todo", "in_progress", "in_review", "done", "blocked"],
    },
    priority: {
      type: "string",
      enum: ["critical", "high", "medium", "low"],
    },
    type: {
      type: "string",
      enum: ["epic", "story", "task", "bug", "subtask"],
    },
    estimatePoints: { type: "integer", minimum: 0 },
    estimateHours: { type: "number", minimum: 0 },
    sprintId: { type: "string", format: "uuid" },
    assignee: { type: "string" },
    labels: { type: "array", items: { type: "string" } },
    dueDate: { type: "string", format: "date" },
  },
  required: ["title"],
};

export const SPRINT_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string", minLength: 1 },
    goal: { type: "string" },
    startDate: { type: "string", format: "date" },
    endDate: { type: "string", format: "date" },
    status: {
      type: "string",
      enum: ["planning", "active", "completed", "cancelled"],
    },
  },
  required: ["name", "startDate", "endDate"],
};

export const VELOCITY_METHOD_TEXT = `Velocity Calculation Method:
- Unit: Story Points
- Window: Last 3 sprints rolling average
- Formula: SUM(completed_points) / sprint_count
- Confidence: Standard deviation of last 5 sprints`;

export const PM_CONVENTIONS_MD = `# PM Conventions

## Task Naming
- Use imperative mood: "Add feature" not "Added feature"
- Be specific: "Implement user authentication" not "Auth"

## Story Points
- 1: Trivial (< 1 hour)
- 2: Small (half day)
- 3: Medium (1 day)
- 5: Large (2-3 days)
- 8: Very Large (1 week)
- 13: Epic (needs breakdown)

## Git Branch Naming (LEVEL_1)
- Format: {issue_number}-{type}-{description}
- Types: feat, fix, refactor, docs, test, chore
- Example: 42-feat-user-authentication

## Commit Messages (Conventional Commits)
- Format: <type>(<scope>): <description> [#issue]
- Types: feat, fix, docs, style, refactor, test, chore
- Magic Words: fixes #42, closes #42, refs #42

## Status Transitions
- todo → in_progress (branch created)
- in_progress → in_review (PR created)
- in_review → done (PR merged with fixes/closes)
`;

// ============================================
// Resource Handlers
// ============================================

export async function handleReadResource(
  uri: string,
  repos: Repositories
): Promise<ResourceContent> {
  switch (uri) {
    case "pm://schema/task":
      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(TASK_SCHEMA, null, 2),
      };

    case "pm://schema/sprint":
      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(SPRINT_SCHEMA, null, 2),
      };

    case "pm://meta/velocity-method":
      return {
        uri,
        mimeType: "text/plain",
        text: VELOCITY_METHOD_TEXT,
      };

    case "pm://docs/conventions":
      return {
        uri,
        mimeType: "text/markdown",
        text: PM_CONVENTIONS_MD,
      };

    case "pm://config": {
      const projects = repos.projectRepo.list();
      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(
          {
            projects,
            activeProject: projects[0] || null,
          },
          null,
          2
        ),
      };
    }

    case "pm://context/active": {
      const activeProjects = repos.projectRepo.list();
      const activeProject = activeProjects[0];
      const activeSprint = activeProject
        ? repos.sprintRepo.getActive(activeProject.id)
        : null;

      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(
          {
            project: activeProject || null,
            sprint: activeSprint || null,
            gitBranch: await getCurrentBranch(),
          },
          null,
          2
        ),
      };
    }

    case "pm://git/status":
      return {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(await getGitStatus(), null, 2),
      };

    default:
      throw new Error(`Resource not found: ${uri}`);
  }
}

// ============================================
// Tool Handlers
// ============================================

// Project Tools
export function handleProjectCreate(
  args: { name: string; description?: string },
  repos: Repositories
): ToolResult {
  const project = repos.projectRepo.create(args.name, args.description);
  return { content: [{ type: "text", text: JSON.stringify(project, null, 2) }] };
}

export function handleProjectList(repos: Repositories): ToolResult {
  const projects = repos.projectRepo.list();
  return { content: [{ type: "text", text: JSON.stringify(projects, null, 2) }] };
}

// Task Tools
export function handleTaskCreate(
  args: {
    title: string;
    description?: string;
    projectId: string;
    type?: string;
    priority?: string;
    estimatePoints?: number;
    sprintId?: string;
  },
  repos: Repositories
): ToolResult {
  const taskId = randomUUID();
  createTaskEvent(repos.eventStore, "TaskCreated", taskId, {
    title: args.title,
    description: args.description,
    projectId: args.projectId,
    type: args.type || "task",
    priority: args.priority || "medium",
  });

  if (args.estimatePoints) {
    createTaskEvent(repos.eventStore, "TaskEstimated", taskId, {
      points: args.estimatePoints,
    });
  }

  if (args.sprintId) {
    createTaskEvent(repos.eventStore, "TaskAddedToSprint", taskId, {
      sprintId: args.sprintId,
    });
  }

  const task = repos.taskRepo.syncFromEvents(taskId);
  return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
}

export function handleTaskList(
  args: {
    projectId?: string;
    sprintId?: string;
    status?: string;
    assignee?: string;
    type?: string;
    priority?: string;
    limit?: number;
    offset?: number;
  },
  repos: Repositories
): ToolResult {
  const tasks = repos.taskRepo.list({
    projectId: args.projectId,
    sprintId: args.sprintId,
    status: args.status,
    assignee: args.assignee,
    type: args.type,
    priority: args.priority,
    limit: args.limit || 50,
    offset: args.offset || 0,
  });
  return { content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }] };
}

export function handleTaskGet(
  args: { taskId: string },
  repos: Repositories
): ToolResult {
  const task = repos.taskRepo.getById(args.taskId);
  if (!task) {
    return { content: [{ type: "text", text: `Task not found: ${args.taskId}` }] };
  }
  return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
}

export function handleTaskUpdate(
  args: {
    taskId: string;
    title?: string;
    description?: string;
    priority?: string;
    assignee?: string;
    estimatePoints?: number;
  },
  repos: Repositories
): ToolResult {
  createTaskEvent(repos.eventStore, "TaskUpdated", args.taskId, {
    title: args.title,
    description: args.description,
    priority: args.priority,
    assignee: args.assignee,
  });

  if (args.estimatePoints !== undefined) {
    createTaskEvent(repos.eventStore, "TaskEstimated", args.taskId, {
      points: args.estimatePoints,
    });
  }

  const updated = repos.taskRepo.syncFromEvents(args.taskId);
  return { content: [{ type: "text", text: JSON.stringify(updated, null, 2) }] };
}

export function handleTaskStatus(
  args: { taskId: string; status: string; reason?: string },
  repos: Repositories
): ToolResult {
  const currentTask = repos.taskRepo.getById(args.taskId);
  if (!currentTask) {
    return { content: [{ type: "text", text: `Task not found: ${args.taskId}` }] };
  }

  createTaskEvent(repos.eventStore, "TaskStatusChanged", args.taskId, {
    from: currentTask.status,
    to: args.status,
    reason: args.reason,
  });

  const updated = repos.taskRepo.syncFromEvents(args.taskId);
  return { content: [{ type: "text", text: JSON.stringify(updated, null, 2) }] };
}

export function handleTaskBoard(
  args: { projectId: string; sprintId?: string },
  repos: Repositories
): ToolResult {
  const board = repos.taskRepo.getByStatus(args.projectId, args.sprintId);
  return { content: [{ type: "text", text: JSON.stringify(board, null, 2) }] };
}

// Sprint Tools
export function handleSprintCreate(
  args: {
    name: string;
    projectId: string;
    startDate: string;
    endDate: string;
    goal?: string;
  },
  repos: Repositories
): ToolResult {
  const sprint = repos.sprintRepo.create(
    args.projectId,
    args.name,
    args.startDate,
    args.endDate,
    args.goal
  );
  return { content: [{ type: "text", text: JSON.stringify(sprint, null, 2) }] };
}

export function handleSprintList(
  args: { projectId: string },
  repos: Repositories
): ToolResult {
  const sprints = repos.sprintRepo.list(args.projectId);
  return { content: [{ type: "text", text: JSON.stringify(sprints, null, 2) }] };
}

export function handleSprintStatus(
  args: { sprintId: string },
  repos: Repositories
): ToolResult {
  const status = repos.sprintRepo.getStatus(args.sprintId);
  if (!status) {
    return { content: [{ type: "text", text: `Sprint not found: ${args.sprintId}` }] };
  }

  const compact = {
    sprint: {
      id: status.sprint.id,
      name: status.sprint.name,
      status: status.sprint.status,
      dates: `${status.sprint.start_date} ~ ${status.sprint.end_date}`,
    },
    progress: {
      points: `${status.completedPoints}/${status.totalPoints}`,
      pct: `${status.progressPct}%`,
      tasks: status.tasks.length,
    },
    byStatus: {
      todo: status.tasks.filter((t) => t.status === "todo").length,
      in_progress: status.tasks.filter((t) => t.status === "in_progress").length,
      in_review: status.tasks.filter((t) => t.status === "in_review").length,
      done: status.tasks.filter((t) => t.status === "done").length,
      blocked: status.tasks.filter((t) => t.status === "blocked").length,
    },
  };

  return { content: [{ type: "text", text: JSON.stringify(compact, null, 2) }] };
}

export function handleSprintStart(
  args: { sprintId: string },
  repos: Repositories
): ToolResult {
  const sprint = repos.sprintRepo.start(args.sprintId);
  return { content: [{ type: "text", text: JSON.stringify(sprint, null, 2) }] };
}

export function handleSprintComplete(
  args: { sprintId: string },
  repos: Repositories
): ToolResult {
  const sprint = repos.sprintRepo.complete(args.sprintId);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            ...sprint,
            velocityRecorded: true,
          },
          null,
          2
        ),
      },
    ],
  };
}

export function handleSprintAddTasks(
  args: { sprintId: string; taskIds: string[] },
  repos: Repositories
): ToolResult {
  repos.sprintRepo.addTasks(args.sprintId, args.taskIds);
  const status = repos.sprintRepo.getStatus(args.sprintId);
  return {
    content: [
      {
        type: "text",
        text: `Added ${args.taskIds.length} tasks to sprint. Total: ${status?.tasks.length || 0} tasks`,
      },
    ],
  };
}

// Analytics Tools
export function handleVelocityCalculate(
  args: { projectId: string; sprintCount?: number },
  repos: Repositories
): ToolResult {
  const velocity = repos.analyticsRepo.calculateVelocity(
    args.projectId,
    args.sprintCount || 3
  );
  return { content: [{ type: "text", text: JSON.stringify(velocity, null, 2) }] };
}

export function handleBurndownData(
  args: { sprintId: string },
  repos: Repositories
): ToolResult {
  const burndown = repos.analyticsRepo.getBurndownData(args.sprintId);

  if (burndown.length > 0) {
    const maxPoints = burndown[0].remaining_points;
    const chart = burndown
      .map((point) => {
        const remainingBar = "█".repeat(
          Math.round((point.remaining_points / maxPoints) * 20)
        );
        return `${point.date.slice(5)}: ${remainingBar.padEnd(20)} ${point.remaining_points}/${point.ideal_points}`;
      })
      .join("\n");

    return {
      content: [
        {
          type: "text",
          text: `Burndown Chart:\n${chart}\n\nData:\n${JSON.stringify(burndown, null, 2)}`,
        },
      ],
    };
  }

  return { content: [{ type: "text", text: JSON.stringify(burndown, null, 2) }] };
}

// Git Tools
export function handleGitBranchCreate(
  args: { taskId: string; type?: string },
  repos: Repositories
): ToolResult {
  const task = repos.taskRepo.getById(args.taskId);
  if (!task) {
    return { content: [{ type: "text", text: `Task not found: ${args.taskId}` }] };
  }

  const type = args.type || "feat";
  const description = task.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);

  const branchName = `${task.id.slice(0, 8)}-${type}-${description}`;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            branchName,
            command: `git checkout -b ${branchName}`,
            taskId: task.id,
            taskTitle: task.title,
          },
          null,
          2
        ),
      },
    ],
  };
}

export function handleGitCommitLink(
  args: { taskId: string; commitSha: string; branch?: string; message?: string },
  repos: Repositories
): ToolResult {
  createTaskEvent(repos.eventStore, "TaskLinkedToCommit", args.taskId, {
    commitSha: args.commitSha,
    branch: args.branch,
    message: args.message,
  });

  repos.taskRepo.syncFromEvents(args.taskId);

  return {
    content: [
      {
        type: "text",
        text: `Linked commit ${args.commitSha.substring(0, 7)} to task ${args.taskId}`,
      },
    ],
  };
}

export async function handleGitParseBranch(): Promise<ToolResult> {
  const branch = await getCurrentBranch();
  if (!branch) {
    return { content: [{ type: "text", text: "Not in a git repository" }] };
  }

  // Parse LEVEL_1 format: {issue_id}-{type}-{description}
  const match = branch.match(/^([a-f0-9-]+)-(\w+)-(.+)$/);
  if (match) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              branch,
              taskId: match[1],
              type: match[2],
              description: match[3],
            },
            null,
            2
          ),
        },
      ],
    };
  }

  // Legacy PM-123 format
  const legacyMatch = branch.match(/^([A-Z]+-\d+)/);
  if (legacyMatch) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { branch, taskId: legacyMatch[1], format: "legacy" },
            null,
            2
          ),
        },
      ],
    };
  }

  return {
    content: [{ type: "text", text: JSON.stringify({ branch, taskId: null }, null, 2) }],
  };
}

export function handleGitParseCommit(args: { message: string }): ToolResult {
  const result = parseCommitMessage(args.message);
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

export async function handleGitStats(args: {
  from?: string;
  to?: string;
  author?: string;
}): Promise<ToolResult> {
  const stats = await getGitStats(args.from, args.to, args.author);
  return { content: [{ type: "text", text: JSON.stringify(stats, null, 2) }] };
}

export async function handleGitHotspots(args: { limit?: number }): Promise<ToolResult> {
  const hotspots = await getGitHotspots(args.limit || 10);
  return { content: [{ type: "text", text: JSON.stringify(hotspots, null, 2) }] };
}

// ============================================
// Main Tool Dispatcher
// ============================================

export async function handleCallTool(
  name: string,
  args: Record<string, unknown>,
  repos: Repositories
): Promise<ToolResult> {
  try {
    switch (name) {
      // Project
      case "pm_project_create":
        return handleProjectCreate(
          args as { name: string; description?: string },
          repos
        );
      case "pm_project_list":
        return handleProjectList(repos);

      // Task
      case "pm_task_create":
        return handleTaskCreate(
          args as {
            title: string;
            projectId: string;
            description?: string;
            type?: string;
            priority?: string;
            estimatePoints?: number;
            sprintId?: string;
          },
          repos
        );
      case "pm_task_list":
        return handleTaskList(args as Record<string, unknown>, repos);
      case "pm_task_get":
        return handleTaskGet(args as { taskId: string }, repos);
      case "pm_task_update":
        return handleTaskUpdate(
          args as {
            taskId: string;
            title?: string;
            description?: string;
            priority?: string;
            assignee?: string;
            estimatePoints?: number;
          },
          repos
        );
      case "pm_task_status":
        return handleTaskStatus(
          args as { taskId: string; status: string; reason?: string },
          repos
        );
      case "pm_task_board":
        return handleTaskBoard(
          args as { projectId: string; sprintId?: string },
          repos
        );

      // Sprint
      case "pm_sprint_create":
        return handleSprintCreate(
          args as {
            name: string;
            projectId: string;
            startDate: string;
            endDate: string;
            goal?: string;
          },
          repos
        );
      case "pm_sprint_list":
        return handleSprintList(args as { projectId: string }, repos);
      case "pm_sprint_status":
        return handleSprintStatus(args as { sprintId: string }, repos);
      case "pm_sprint_start":
        return handleSprintStart(args as { sprintId: string }, repos);
      case "pm_sprint_complete":
        return handleSprintComplete(args as { sprintId: string }, repos);
      case "pm_sprint_add_tasks":
        return handleSprintAddTasks(
          args as { sprintId: string; taskIds: string[] },
          repos
        );

      // Analytics
      case "pm_velocity_calculate":
        return handleVelocityCalculate(
          args as { projectId: string; sprintCount?: number },
          repos
        );
      case "pm_burndown_data":
        return handleBurndownData(args as { sprintId: string }, repos);

      // Git
      case "pm_git_branch_create":
        return handleGitBranchCreate(
          args as { taskId: string; type?: string },
          repos
        );
      case "pm_git_commit_link":
        return handleGitCommitLink(
          args as {
            taskId: string;
            commitSha: string;
            branch?: string;
            message?: string;
          },
          repos
        );
      case "pm_git_parse_branch":
        return await handleGitParseBranch();
      case "pm_git_parse_commit":
        return handleGitParseCommit(args as { message: string });
      case "pm_git_stats":
        return await handleGitStats(
          args as { from?: string; to?: string; author?: string }
        );
      case "pm_git_hotspots":
        return await handleGitHotspots(args as { limit?: number });

      // LEVEL_1: Extended Git Tools
      case "pm_git_churn":
        return await handleGitChurn(args as { path?: string; days?: number });
      case "pm_git_coupling":
        return await handleGitCoupling(args as { path: string; limit?: number });
      case "pm_git_issue_commits":
        return await handleGitIssueCommits(args as { issueId: number });

      // LEVEL_1: Sync Tools
      case "pm_sync_pull":
        return handleSyncPull(args as { force?: boolean }, repos);
      case "pm_sync_push":
        return handleSyncPush(args as { dryRun?: boolean }, repos);

      // LEVEL_1: Release Tools
      case "pm_release_next_version":
        return await handleReleaseNextVersion();
      case "pm_release_notes":
        return await handleReleaseNotes(args as { from?: string; to?: string });

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

// ============================================
// Prompt Handlers
// ============================================

export function handleGetPrompt(
  name: string,
  args: Record<string, unknown> | undefined
): { messages: PromptMessage[] } {
  switch (name) {
    case "sprint-planning":
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `# Sprint Planning: ${args?.sprintName || "New Sprint"}

## Agenda
1. Review velocity from previous sprints
2. Discuss sprint goal
3. Select and estimate backlog items
4. Capacity planning
5. Commitment

## Steps
1. First, use pm_velocity_calculate to get team velocity
2. Review the product backlog with pm_task_list
3. For each selected item, ensure it has story points
4. Add tasks to sprint with pm_sprint_add_tasks
5. Verify total points don't exceed velocity

Duration: ${args?.duration || 14} days

Let's start by calculating the team's velocity.`,
            },
          },
        ],
      };

    case "retrospective":
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `# Sprint Retrospective

## Sprint: ${args?.sprintId}

## Format: Start-Stop-Continue

### What went well? (Continue)
-

### What didn't go well? (Stop)
-

### What should we try? (Start)
-

## Action Items
- [ ]

## Analysis Steps
1. Use pm_sprint_status to get completion metrics
2. Use pm_velocity_calculate to compare with historical
3. Use pm_git_stats to analyze commit patterns
4. Use pm_git_hotspots to identify risk areas
5. Review blocked tasks and resolution time

Let's start by getting the sprint status.`,
            },
          },
        ],
      };

    case "daily-standup":
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `# Daily Standup

## Format
For each team member:
1. What did you complete yesterday?
2. What will you work on today?
3. Any blockers?

## Quick Status Check
Use pm_task_board to see current sprint board:
- In Progress tasks
- Blocked tasks
- Recently completed

Let's get the current sprint board.`,
            },
          },
        ],
      };

    case "risk-assessment":
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `# Risk Assessment: ${args?.projectId}

## Analysis Areas
1. **Code Hotspots**: Files with high change frequency + complexity
2. **Blocked Tasks**: Tasks stuck in blocked status
3. **Sprint Progress**: Behind schedule indicators
4. **Technical Debt**: Accumulating issues

## Steps
1. Use pm_git_hotspots to find risky files
2. Use pm_task_list with status=blocked
3. Use pm_sprint_status for current sprint
4. Review tasks marked as technical debt

Let's start with hotspot analysis.`,
            },
          },
        ],
      };

    case "release-plan":
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `# Release Planning

## Target Version: ${args?.version || "Next"}

## Steps
1. Review completed tasks since last release
2. Analyze git commits for changelog
3. Identify breaking changes
4. Generate release notes

## Commands
1. pm_git_stats to see commit summary
2. pm_task_list with status=done for completed work
3. Review Conventional Commits for version bump type

Let's analyze the changes since the last release.`,
            },
          },
        ],
      };

    default:
      throw new Error(`Unknown prompt: ${name}`);
  }
}

// ============================================
// LEVEL_1: Extended Git Tools
// ============================================

export async function handleGitChurn(args: {
  path?: string;
  days?: number;
}): Promise<ToolResult> {
  try {
    const { execSync } = await import("child_process");
    const sinceArg = args.days ? `--since="${args.days} days ago"` : "";
    const pathArg = args.path || ".";

    const result = execSync(
      `git log ${sinceArg} --pretty=format: --name-only -- "${pathArg}" | sort | uniq -c | sort -rn | head -20`,
      { encoding: "utf-8" }
    );

    const files = result
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const match = line.trim().match(/^(\d+)\s+(.+)$/);
        if (match) {
          return { file: match[2], changes: parseInt(match[1], 10) };
        }
        return null;
      })
      .filter(Boolean);

    return { content: [{ type: "text", text: JSON.stringify(files, null, 2) }] };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error}` }],
      isError: true,
    };
  }
}

export async function handleGitCoupling(args: {
  path: string;
  limit?: number;
}): Promise<ToolResult> {
  try {
    const { execSync } = await import("child_process");
    const limit = args.limit || 10;

    // Get commits that modified the file
    const commits = execSync(
      `git log --format="%H" -- "${args.path}" | head -50`,
      { encoding: "utf-8" }
    )
      .trim()
      .split("\n")
      .filter(Boolean);

    if (commits.length === 0) {
      return { content: [{ type: "text", text: "[]" }] };
    }

    // Get files that were modified in the same commits
    const coupledFiles = new Map<string, number>();
    for (const sha of commits) {
      const files = execSync(`git show --format= --name-only ${sha}`, {
        encoding: "utf-8",
      })
        .trim()
        .split("\n")
        .filter((f) => f && f !== args.path);

      for (const file of files) {
        coupledFiles.set(file, (coupledFiles.get(file) || 0) + 1);
      }
    }

    const sorted = [...coupledFiles.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([file, count]) => ({
        file,
        couplingScore: count,
        percentage: Math.round((count / commits.length) * 100),
      }));

    return { content: [{ type: "text", text: JSON.stringify(sorted, null, 2) }] };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error}` }],
      isError: true,
    };
  }
}

export async function handleGitIssueCommits(args: {
  issueId: number;
}): Promise<ToolResult> {
  try {
    const { execSync } = await import("child_process");
    const patterns = [
      `#${args.issueId}`,
      `refs #${args.issueId}`,
      `fixes #${args.issueId}`,
      `closes #${args.issueId}`,
    ];

    const commits: Array<{
      sha: string;
      message: string;
      author: string;
      date: string;
    }> = [];

    for (const pattern of patterns) {
      const result = execSync(
        `git log --all --grep="${pattern}" --format="%H|%s|%an|%aI" 2>/dev/null || echo ""`,
        { encoding: "utf-8" }
      ).trim();

      if (result) {
        for (const line of result.split("\n")) {
          const [sha, message, author, date] = line.split("|");
          if (sha && !commits.find((c) => c.sha === sha)) {
            commits.push({ sha, message, author, date });
          }
        }
      }
    }

    return { content: [{ type: "text", text: JSON.stringify(commits, null, 2) }] };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error}` }],
      isError: true,
    };
  }
}

// ============================================
// LEVEL_1: Sync Tools
// ============================================

export function handleSyncPull(
  _args: { force?: boolean },
  _repos: Repositories
): ToolResult {
  // Placeholder for GitHub sync pull
  // In actual implementation, this would:
  // 1. Query GitHub Issues/Projects API
  // 2. Update local SQLite cache
  // 3. Return sync summary

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            success: true,
            pulled: { issues: 0, prs: 0, projects: 0 },
            message: "GitHub sync pull placeholder. Configure github_enabled in project settings.",
          },
          null,
          2
        ),
      },
    ],
  };
}

export function handleSyncPush(
  args: { dryRun?: boolean },
  _repos: Repositories
): ToolResult {
  // Placeholder for GitHub sync push
  // In actual implementation, this would:
  // 1. Process sync queue
  // 2. Push local changes to GitHub
  // 3. Return sync summary

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            success: true,
            pushed: { statusUpdates: 0, comments: 0 },
            dryRun: args.dryRun || false,
            message: "GitHub sync push placeholder. Configure github_enabled in project settings.",
          },
          null,
          2
        ),
      },
    ],
  };
}

// ============================================
// LEVEL_1: Release Tools
// ============================================

export async function handleReleaseNextVersion(): Promise<ToolResult> {
  try {
    const { execSync } = await import("child_process");

    // Get current version from latest tag
    let currentVersion = "0.0.0";
    try {
      currentVersion = execSync("git describe --tags --abbrev=0 2>/dev/null", {
        encoding: "utf-8",
      }).trim();
    } catch {
      // No tags yet
    }

    // Parse current version
    const versionMatch = currentVersion.match(/v?(\d+)\.(\d+)\.(\d+)/);
    let major = versionMatch ? parseInt(versionMatch[1], 10) : 0;
    let minor = versionMatch ? parseInt(versionMatch[2], 10) : 0;
    let patch = versionMatch ? parseInt(versionMatch[3], 10) : 0;

    // Get commits since last tag
    const range = currentVersion !== "0.0.0" ? `${currentVersion}..HEAD` : "HEAD~100..HEAD";
    const commits = execSync(`git log ${range} --format="%s" 2>/dev/null || echo ""`, {
      encoding: "utf-8",
    })
      .trim()
      .split("\n")
      .filter(Boolean);

    // Analyze commit types for version bump
    let hasBreaking = false;
    let hasFeature = false;
    let hasFix = false;

    for (const commit of commits) {
      if (commit.includes("BREAKING CHANGE") || commit.match(/^\w+!:/)) {
        hasBreaking = true;
      } else if (commit.startsWith("feat")) {
        hasFeature = true;
      } else if (commit.startsWith("fix")) {
        hasFix = true;
      }
    }

    // Calculate next version
    if (hasBreaking) {
      major++;
      minor = 0;
      patch = 0;
    } else if (hasFeature) {
      minor++;
      patch = 0;
    } else if (hasFix) {
      patch++;
    }

    const nextVersion = `v${major}.${minor}.${patch}`;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              current: currentVersion,
              next: nextVersion,
              bumpType: hasBreaking ? "major" : hasFeature ? "minor" : "patch",
              commits: commits.length,
              analysis: { hasBreaking, hasFeature, hasFix },
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error}` }],
      isError: true,
    };
  }
}

export async function handleReleaseNotes(args: {
  from?: string;
  to?: string;
}): Promise<ToolResult> {
  try {
    const { execSync } = await import("child_process");

    // Get range
    let fromTag = args.from;
    const toRef = args.to || "HEAD";

    if (!fromTag) {
      try {
        fromTag = execSync("git describe --tags --abbrev=0 2>/dev/null", {
          encoding: "utf-8",
        }).trim();
      } catch {
        fromTag = "";
      }
    }

    const range = fromTag ? `${fromTag}..${toRef}` : `HEAD~50..${toRef}`;

    // Get commits grouped by type
    const commits = execSync(
      `git log ${range} --format="%s|%h" 2>/dev/null || echo ""`,
      { encoding: "utf-8" }
    )
      .trim()
      .split("\n")
      .filter(Boolean);

    const features: string[] = [];
    const fixes: string[] = [];
    const docs: string[] = [];
    const other: string[] = [];

    for (const line of commits) {
      const [message, sha] = line.split("|");
      const entry = `- ${message} (${sha})`;

      if (message.startsWith("feat")) {
        features.push(entry);
      } else if (message.startsWith("fix")) {
        fixes.push(entry);
      } else if (message.startsWith("docs")) {
        docs.push(entry);
      } else {
        other.push(entry);
      }
    }

    // Generate markdown
    let notes = `# Release Notes\n\n`;
    notes += `**Range**: ${fromTag || "beginning"} → ${toRef}\n\n`;

    if (features.length > 0) {
      notes += `## Features\n${features.join("\n")}\n\n`;
    }
    if (fixes.length > 0) {
      notes += `## Bug Fixes\n${fixes.join("\n")}\n\n`;
    }
    if (docs.length > 0) {
      notes += `## Documentation\n${docs.join("\n")}\n\n`;
    }
    if (other.length > 0) {
      notes += `## Other Changes\n${other.join("\n")}\n\n`;
    }

    return { content: [{ type: "text", text: notes }] };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error}` }],
      isError: true,
    };
  }
}
