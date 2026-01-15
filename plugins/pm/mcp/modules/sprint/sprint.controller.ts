import { Controller } from '@nestjs/common';
import { SprintService } from './sprint.service.js';
import { MCPTool } from '../../core/common/decorators/mcp-tool.decorator.js';
import { CreateSprintDto } from './dto/create-sprint.dto.js';
import { AddTasksToSprintDto } from './dto/add-tasks-to-sprint.dto.js';
import { GetSprintStatusDto } from './dto/get-sprint-status.dto.js';

@Controller()
export class SprintController {
  constructor(private readonly sprintService: SprintService) {}

  @MCPTool({
    name: 'pm_sprint_create',
    description: 'Create a new sprint',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project UUID' },
        name: { type: 'string', description: 'Sprint name' },
        startDate: { type: 'string', description: 'Start date (ISO 8601)' },
        endDate: { type: 'string', description: 'End date (ISO 8601)' },
        goal: { type: 'string', description: 'Sprint goal (optional)' },
      },
      required: ['projectId', 'name', 'startDate', 'endDate'],
    },
  })
  async createSprint(args: CreateSprintDto) {
    const sprint = await this.sprintService.create(args);
    return {
      content: [
        {
          type: 'text',
          text: sprint
            ? `Sprint created: ${sprint.name} (${sprint.start_date} to ${sprint.end_date})`
            : 'Sprint creation failed',
        },
      ],
    };
  }

  @MCPTool({
    name: 'pm_sprint_list',
    description: 'List all sprints in a project',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project UUID' },
      },
      required: ['projectId'],
    },
  })
  async listSprints(args: { projectId: string }) {
    const sprints = await this.sprintService.list(args.projectId);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(sprints, null, 2),
        },
      ],
    };
  }

  @MCPTool({
    name: 'pm_sprint_status',
    description: 'Get sprint status with task breakdown',
    inputSchema: {
      type: 'object',
      properties: {
        sprintId: { type: 'string', description: 'Sprint UUID' },
        compact: { type: 'boolean', description: 'Compact format (default: false)' },
      },
      required: ['sprintId'],
    },
  })
  async getSprintStatus(args: GetSprintStatusDto) {
    const status = await this.sprintService.getStatus(args);
    if (!status) {
      return {
        content: [{ type: 'text', text: 'Sprint not found' }],
        isError: true,
      };
    }

    if (args.compact) {
      // Compact format
      const { sprint, totalPoints, completedPoints, progressPct } = status;
      const text = `Sprint: ${sprint.name} (${sprint.status})
Progress: ${completedPoints}/${totalPoints} pts (${progressPct}%)
Period: ${sprint.start_date} to ${sprint.end_date}`;
      return {
        content: [{ type: 'text', text }],
      };
    }

    // Full format
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(status, null, 2),
        },
      ],
    };
  }

  @MCPTool({
    name: 'pm_sprint_start',
    description: 'Start a sprint (set status to active)',
    inputSchema: {
      type: 'object',
      properties: {
        sprintId: { type: 'string', description: 'Sprint UUID' },
      },
      required: ['sprintId'],
    },
  })
  async startSprint(args: { sprintId: string }) {
    const sprint = await this.sprintService.start(args.sprintId);
    return {
      content: [
        {
          type: 'text',
          text: `Sprint started: ${sprint.name}`,
        },
      ],
    };
  }

  @MCPTool({
    name: 'pm_sprint_complete',
    description: 'Complete a sprint (records velocity)',
    inputSchema: {
      type: 'object',
      properties: {
        sprintId: { type: 'string', description: 'Sprint UUID' },
      },
      required: ['sprintId'],
    },
  })
  async completeSprint(args: { sprintId: string }) {
    const sprint = await this.sprintService.complete(args.sprintId);
    return {
      content: [
        {
          type: 'text',
          text: `Sprint completed: ${sprint.name}
Velocity - Committed: ${sprint.velocity_committed || 0} pts, Completed: ${sprint.velocity_completed || 0} pts`,
        },
      ],
    };
  }

  @MCPTool({
    name: 'pm_sprint_add_tasks',
    description: 'Add tasks to a sprint',
    inputSchema: {
      type: 'object',
      properties: {
        sprintId: { type: 'string', description: 'Sprint UUID' },
        taskIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of task UUIDs',
        },
      },
      required: ['sprintId', 'taskIds'],
    },
  })
  async addTasksToSprint(args: AddTasksToSprintDto) {
    const sprint = await this.sprintService.addTasks(args);
    return {
      content: [
        {
          type: 'text',
          text: sprint
            ? `Added ${args.taskIds.length} tasks to sprint: ${sprint.name}`
            : 'Failed to add tasks',
        },
      ],
    };
  }
}
