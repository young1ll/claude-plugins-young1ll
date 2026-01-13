/**
 * PM Plugin MCP Server
 *
 * Model Context Protocol server for project management integration.
 * Exposes Resources, Tools, and Prompts for Claude Code.
 *
 * LEVEL_1 Implementation - Git-First, GitHub Flow based
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  ReadResourceRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { EventStore, createTaskEvent } from "../storage/lib/events.js";
import { getDatabase, DatabaseManager } from "./lib/db.js";
import {
  ProjectRepository,
  SprintRepository,
  TaskRepository,
  AnalyticsRepository,
} from "./lib/projections.js";
import {
  getCurrentBranch,
  getGitStatus,
  parseCommitMessage,
  getGitStats,
  getGitHotspots,
} from "./lib/server-helpers.js";
import { randomUUID } from "crypto";

// ============================================
// Server Configuration
// ============================================

const DB_PATH = process.env.PM_DB_PATH || ".claude/pm.db";

const server = new Server(
  {
    name: "pm-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
      prompts: {},
    },
  }
);

let eventStore: EventStore;
let dbManager: DatabaseManager;
let projectRepo: ProjectRepository;
let sprintRepo: SprintRepository;
let taskRepo: TaskRepository;
let analyticsRepo: AnalyticsRepository;

// ============================================
// Resources (Static, User/App Controlled)
// ============================================

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "pm://schema/task",
        mimeType: "application/json",
        name: "Task Schema",
        description: "Task entity schema definition",
      },
      {
        uri: "pm://schema/sprint",
        mimeType: "application/json",
        name: "Sprint Schema",
        description: "Sprint entity schema definition",
      },
      {
        uri: "pm://meta/velocity-method",
        mimeType: "text/plain",
        name: "Velocity Calculation Method",
        description: "How velocity is calculated for this project",
      },
      {
        uri: "pm://docs/conventions",
        mimeType: "text/markdown",
        name: "PM Conventions",
        description: "Project management conventions and best practices",
      },
      {
        uri: "pm://config",
        mimeType: "application/json",
        name: "Project Config",
        description: "Current project configuration",
      },
      {
        uri: "pm://context/active",
        mimeType: "application/json",
        name: "Active Context",
        description: "Current active sprint and task context",
      },
      {
        uri: "pm://git/status",
        mimeType: "application/json",
        name: "Git Status",
        description: "Current Git repository status",
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  switch (uri) {
    case "pm://schema/task":
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(
              {
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
              },
              null,
              2
            ),
          },
        ],
      };

    case "pm://schema/sprint":
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(
              {
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
              },
              null,
              2
            ),
          },
        ],
      };

    case "pm://meta/velocity-method":
      return {
        contents: [
          {
            uri,
            mimeType: "text/plain",
            text: `Velocity Calculation Method:
- Unit: Story Points
- Window: Last 3 sprints rolling average
- Formula: SUM(completed_points) / sprint_count
- Confidence: Standard deviation of last 5 sprints`,
          },
        ],
      };

    case "pm://docs/conventions":
      return {
        contents: [
          {
            uri,
            mimeType: "text/markdown",
            text: `# PM Conventions

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
`,
          },
        ],
      };

    case "pm://config":
      const projects = projectRepo.list();
      return {
        contents: [
          {
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
          },
        ],
      };

    case "pm://context/active":
      const activeProjects = projectRepo.list();
      const activeProject = activeProjects[0];
      const activeSprint = activeProject
        ? sprintRepo.getActive(activeProject.id)
        : null;

      return {
        contents: [
          {
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
          },
        ],
      };

    case "pm://git/status":
      return {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(await getGitStatus(), null, 2),
          },
        ],
      };

    default:
      throw new Error(`Resource not found: ${uri}`);
  }
});

// ============================================
// Tools (Dynamic, Model Invoked)
// ============================================

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // Project Tools
      {
        name: "pm_project_create",
        description: "Create a new project",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Project name" },
            description: { type: "string", description: "Project description" },
          },
          required: ["name"],
        },
      },
      {
        name: "pm_project_list",
        description: "List all projects",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },

      // Task CRUD
      {
        name: "pm_task_create",
        description: "Create a new task",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "Task title" },
            description: { type: "string", description: "Task description" },
            projectId: { type: "string", description: "Project ID" },
            type: {
              type: "string",
              enum: ["epic", "story", "task", "bug", "subtask"],
              default: "task",
            },
            priority: {
              type: "string",
              enum: ["critical", "high", "medium", "low"],
              default: "medium",
            },
            estimatePoints: { type: "integer", description: "Story points" },
            sprintId: { type: "string", description: "Sprint to add task to" },
          },
          required: ["title", "projectId"],
        },
      },
      {
        name: "pm_task_list",
        description: "List tasks with optional filtering",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string" },
            sprintId: { type: "string" },
            status: { type: "string" },
            assignee: { type: "string" },
            type: { type: "string" },
            priority: { type: "string" },
            limit: { type: "integer", default: 50 },
            offset: { type: "integer", default: 0 },
          },
        },
      },
      {
        name: "pm_task_get",
        description: "Get a specific task by ID",
        inputSchema: {
          type: "object",
          properties: {
            taskId: { type: "string", description: "Task ID" },
          },
          required: ["taskId"],
        },
      },
      {
        name: "pm_task_update",
        description: "Update a task",
        inputSchema: {
          type: "object",
          properties: {
            taskId: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            status: { type: "string" },
            priority: { type: "string" },
            estimatePoints: { type: "integer" },
            assignee: { type: "string" },
          },
          required: ["taskId"],
        },
      },
      {
        name: "pm_task_status",
        description: "Change task status",
        inputSchema: {
          type: "object",
          properties: {
            taskId: { type: "string" },
            status: {
              type: "string",
              enum: ["todo", "in_progress", "in_review", "done", "blocked"],
            },
            reason: { type: "string", description: "Reason for status change" },
          },
          required: ["taskId", "status"],
        },
      },
      {
        name: "pm_task_board",
        description: "Get task board view grouped by status",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string" },
            sprintId: { type: "string" },
          },
          required: ["projectId"],
        },
      },

      // Sprint Tools
      {
        name: "pm_sprint_create",
        description: "Create a new sprint",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
            projectId: { type: "string" },
            startDate: { type: "string", format: "date" },
            endDate: { type: "string", format: "date" },
            goal: { type: "string" },
          },
          required: ["name", "projectId", "startDate", "endDate"],
        },
      },
      {
        name: "pm_sprint_list",
        description: "List sprints for a project",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string" },
          },
          required: ["projectId"],
        },
      },
      {
        name: "pm_sprint_status",
        description: "Get sprint status with task breakdown",
        inputSchema: {
          type: "object",
          properties: {
            sprintId: { type: "string" },
          },
          required: ["sprintId"],
        },
      },
      {
        name: "pm_sprint_start",
        description: "Start a sprint",
        inputSchema: {
          type: "object",
          properties: {
            sprintId: { type: "string" },
          },
          required: ["sprintId"],
        },
      },
      {
        name: "pm_sprint_complete",
        description: "Complete a sprint and record velocity",
        inputSchema: {
          type: "object",
          properties: {
            sprintId: { type: "string" },
          },
          required: ["sprintId"],
        },
      },
      {
        name: "pm_sprint_add_tasks",
        description: "Add tasks to a sprint",
        inputSchema: {
          type: "object",
          properties: {
            sprintId: { type: "string" },
            taskIds: { type: "array", items: { type: "string" } },
          },
          required: ["sprintId", "taskIds"],
        },
      },

      // Analytics Tools
      {
        name: "pm_velocity_calculate",
        description: "Calculate velocity for a project",
        inputSchema: {
          type: "object",
          properties: {
            projectId: { type: "string" },
            sprintCount: { type: "integer", default: 3 },
          },
          required: ["projectId"],
        },
      },
      {
        name: "pm_burndown_data",
        description: "Get burndown chart data for a sprint",
        inputSchema: {
          type: "object",
          properties: {
            sprintId: { type: "string" },
          },
          required: ["sprintId"],
        },
      },

      // Git Integration
      {
        name: "pm_git_branch_create",
        description: "Create a branch for a task (LEVEL_1 format)",
        inputSchema: {
          type: "object",
          properties: {
            taskId: { type: "string" },
            type: {
              type: "string",
              enum: ["feat", "fix", "refactor", "docs", "test", "chore"],
              default: "feat",
            },
          },
          required: ["taskId"],
        },
      },
      {
        name: "pm_git_commit_link",
        description: "Link a commit to a task",
        inputSchema: {
          type: "object",
          properties: {
            taskId: { type: "string" },
            commitSha: { type: "string" },
            branch: { type: "string" },
            message: { type: "string" },
          },
          required: ["taskId", "commitSha"],
        },
      },
      {
        name: "pm_git_parse_branch",
        description: "Parse current branch to extract task info",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "pm_git_parse_commit",
        description: "Parse a commit message for magic words",
        inputSchema: {
          type: "object",
          properties: {
            message: { type: "string" },
          },
          required: ["message"],
        },
      },

      // Git Analytics (LEVEL_1 Section 5)
      {
        name: "pm_git_stats",
        description: "Get git commit statistics",
        inputSchema: {
          type: "object",
          properties: {
            from: { type: "string", description: "Start date or ref" },
            to: { type: "string", description: "End date or ref" },
            author: { type: "string", description: "Filter by author" },
          },
        },
      },
      {
        name: "pm_git_hotspots",
        description: "Find frequently changed files (risk indicators)",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "integer", default: 10 },
          },
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: rawArgs } = request.params;
  const args = rawArgs ?? {};

  try {
    switch (name) {
      // ============================================
      // Project Tools
      // ============================================
      case "pm_project_create": {
        const project = projectRepo.create(
          args.name as string,
          args.description as string | undefined
        );
        return { content: [{ type: "text", text: JSON.stringify(project, null, 2) }] };
      }

      case "pm_project_list": {
        const projects = projectRepo.list();
        return { content: [{ type: "text", text: JSON.stringify(projects, null, 2) }] };
      }

      // ============================================
      // Task Tools
      // ============================================
      case "pm_task_create": {
        const taskId = randomUUID();
        createTaskEvent(eventStore, "TaskCreated", taskId, {
          title: args.title,
          description: args.description,
          projectId: args.projectId,
          type: args.type || "task",
          priority: args.priority || "medium",
        });

        if (args.estimatePoints) {
          createTaskEvent(eventStore, "TaskEstimated", taskId, {
            points: args.estimatePoints,
          });
        }

        if (args.sprintId) {
          createTaskEvent(eventStore, "TaskAddedToSprint", taskId, {
            sprintId: args.sprintId,
          });
        }

        // Sync projection
        const task = taskRepo.syncFromEvents(taskId);
        return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
      }

      case "pm_task_list": {
        const tasks = taskRepo.list({
          projectId: args.projectId as string,
          sprintId: args.sprintId as string,
          status: args.status as string,
          assignee: args.assignee as string,
          type: args.type as string,
          priority: args.priority as string,
          limit: (args.limit as number) || 50,
          offset: (args.offset as number) || 0,
        });
        return { content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }] };
      }

      case "pm_task_get": {
        const task = taskRepo.getById(args.taskId as string);
        if (!task) {
          return { content: [{ type: "text", text: `Task not found: ${args.taskId}` }] };
        }
        return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
      }

      case "pm_task_update": {
        const taskId = args.taskId as string;

        // Create update event
        createTaskEvent(eventStore, "TaskUpdated", taskId, {
          title: args.title,
          description: args.description,
          priority: args.priority,
          assignee: args.assignee,
        });

        if (args.estimatePoints !== undefined) {
          createTaskEvent(eventStore, "TaskEstimated", taskId, {
            points: args.estimatePoints,
          });
        }

        // Sync and return
        const updated = taskRepo.syncFromEvents(taskId);
        return { content: [{ type: "text", text: JSON.stringify(updated, null, 2) }] };
      }

      case "pm_task_status": {
        const taskId = args.taskId as string;
        const currentTask = taskRepo.getById(taskId);
        if (!currentTask) {
          return { content: [{ type: "text", text: `Task not found: ${taskId}` }] };
        }

        createTaskEvent(eventStore, "TaskStatusChanged", taskId, {
          from: currentTask.status,
          to: args.status,
          reason: args.reason,
        });

        const updated = taskRepo.syncFromEvents(taskId);
        return { content: [{ type: "text", text: JSON.stringify(updated, null, 2) }] };
      }

      case "pm_task_board": {
        const board = taskRepo.getByStatus(
          args.projectId as string,
          args.sprintId as string | undefined
        );
        return { content: [{ type: "text", text: JSON.stringify(board, null, 2) }] };
      }

      // ============================================
      // Sprint Tools
      // ============================================
      case "pm_sprint_create": {
        const sprint = sprintRepo.create(
          args.projectId as string,
          args.name as string,
          args.startDate as string,
          args.endDate as string,
          args.goal as string | undefined
        );
        return { content: [{ type: "text", text: JSON.stringify(sprint, null, 2) }] };
      }

      case "pm_sprint_list": {
        const sprints = sprintRepo.list(args.projectId as string);
        return { content: [{ type: "text", text: JSON.stringify(sprints, null, 2) }] };
      }

      case "pm_sprint_status": {
        const status = sprintRepo.getStatus(args.sprintId as string);
        if (!status) {
          return { content: [{ type: "text", text: `Sprint not found: ${args.sprintId}` }] };
        }

        // Compact format for token efficiency
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
            todo: status.tasks.filter(t => t.status === "todo").length,
            in_progress: status.tasks.filter(t => t.status === "in_progress").length,
            in_review: status.tasks.filter(t => t.status === "in_review").length,
            done: status.tasks.filter(t => t.status === "done").length,
            blocked: status.tasks.filter(t => t.status === "blocked").length,
          },
        };

        return { content: [{ type: "text", text: JSON.stringify(compact, null, 2) }] };
      }

      case "pm_sprint_start": {
        const sprint = sprintRepo.start(args.sprintId as string);
        return { content: [{ type: "text", text: JSON.stringify(sprint, null, 2) }] };
      }

      case "pm_sprint_complete": {
        const sprint = sprintRepo.complete(args.sprintId as string);
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

      case "pm_sprint_add_tasks": {
        sprintRepo.addTasks(args.sprintId as string, args.taskIds as string[]);
        const status = sprintRepo.getStatus(args.sprintId as string);
        return {
          content: [
            {
              type: "text",
              text: `Added ${(args.taskIds as string[]).length} tasks to sprint. Total: ${status?.tasks.length || 0} tasks`,
            },
          ],
        };
      }

      // ============================================
      // Analytics Tools
      // ============================================
      case "pm_velocity_calculate": {
        const velocity = analyticsRepo.calculateVelocity(
          args.projectId as string,
          (args.sprintCount as number) || 3
        );
        return { content: [{ type: "text", text: JSON.stringify(velocity, null, 2) }] };
      }

      case "pm_burndown_data": {
        const burndown = analyticsRepo.getBurndownData(args.sprintId as string);

        // ASCII burndown chart
        if (burndown.length > 0) {
          const maxPoints = burndown[0].remaining_points;
          const chart = burndown
            .map(point => {
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

      // ============================================
      // Git Integration Tools
      // ============================================
      case "pm_git_branch_create": {
        const task = taskRepo.getById(args.taskId as string);
        if (!task) {
          return { content: [{ type: "text", text: `Task not found: ${args.taskId}` }] };
        }

        const type = (args.type as string) || "feat";
        const description = task.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 30);

        // LEVEL_1 format: {issue_number}-{type}-{description}
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

      case "pm_git_commit_link": {
        createTaskEvent(eventStore, "TaskLinkedToCommit", args.taskId as string, {
          commitSha: args.commitSha,
          branch: args.branch,
          message: args.message,
        });

        taskRepo.syncFromEvents(args.taskId as string);

        return {
          content: [
            {
              type: "text",
              text: `Linked commit ${(args.commitSha as string).substring(0, 7)} to task ${args.taskId}`,
            },
          ],
        };
      }

      case "pm_git_parse_branch": {
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

        // Also try old PM-123 format
        const legacyMatch = branch.match(/^([A-Z]+-\d+)/);
        if (legacyMatch) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ branch, taskId: legacyMatch[1], format: "legacy" }, null, 2),
              },
            ],
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify({ branch, taskId: null }, null, 2) }],
        };
      }

      case "pm_git_parse_commit": {
        const message = args.message as string;
        const result = parseCommitMessage(message);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      case "pm_git_stats": {
        const stats = await getGitStats(
          args.from as string | undefined,
          args.to as string | undefined,
          args.author as string | undefined
        );
        return { content: [{ type: "text", text: JSON.stringify(stats, null, 2) }] };
      }

      case "pm_git_hotspots": {
        const hotspots = await getGitHotspots((args.limit as number) || 10);
        return { content: [{ type: "text", text: JSON.stringify(hotspots, null, 2) }] };
      }

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
});

// ============================================
// Prompts (Templates, User Initiated)
// ============================================

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: "sprint-planning",
        description: "Sprint planning session template",
        arguments: [
          { name: "sprintName", description: "Name of the sprint", required: true },
          { name: "duration", description: "Sprint duration in days", required: false },
        ],
      },
      {
        name: "retrospective",
        description: "Sprint retrospective template with Git analysis",
        arguments: [
          { name: "sprintId", description: "Sprint ID to review", required: true },
        ],
      },
      {
        name: "daily-standup",
        description: "Daily standup template",
        arguments: [],
      },
      {
        name: "risk-assessment",
        description: "Project risk assessment with hotspot analysis",
        arguments: [
          { name: "projectId", description: "Project ID", required: true },
        ],
      },
      {
        name: "release-plan",
        description: "Release planning with changelog generation",
        arguments: [
          { name: "version", description: "Target version", required: false },
        ],
      },
    ],
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

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
});

// ============================================
// Server Startup
// ============================================

async function main() {
  // Initialize database
  dbManager = getDatabase(DB_PATH);
  eventStore = new EventStore(DB_PATH);

  // Initialize repositories
  projectRepo = new ProjectRepository(dbManager, eventStore);
  sprintRepo = new SprintRepository(dbManager, eventStore);
  taskRepo = new TaskRepository(dbManager, eventStore);
  analyticsRepo = new AnalyticsRepository(dbManager);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("PM MCP Server running on stdio");
}

main().catch(console.error);
