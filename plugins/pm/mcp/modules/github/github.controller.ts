import { Controller } from '@nestjs/common';
import { GitHubService } from './github.service.js';
import { MCPTool } from '../../core/common/decorators/mcp-tool.decorator.js';
import { TaskService } from '../task/task.service.js';
import { TaskRepository } from '../task/task.repository.js';
import { ProjectService } from '../project/project.service.js';

@Controller()
export class GitHubController {
  constructor(
    private readonly githubService: GitHubService,
    private readonly taskService: TaskService,
    private readonly taskRepository: TaskRepository,
    private readonly projectService: ProjectService
  ) {}

  @MCPTool({
    name: 'pm_github_status',
    description: 'Check GitHub CLI authentication and repository status',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  })
  async getStatus() {
    const authenticated = this.githubService.isAuthenticated();
    const repoInfo = authenticated ? this.githubService.getRepoInfo() : null;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              authenticated,
              repoInfo,
              message: authenticated
                ? 'GitHub CLI is authenticated'
                : 'Not authenticated. Run: gh auth login',
            },
            null,
            2
          ),
        },
      ],
    };
  }

  @MCPTool({
    name: 'pm_github_issue_create',
    description: 'Create a GitHub issue from a task',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task UUID or #seq' },
        projectId: { type: 'string', description: 'Required when using #seq' },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'GitHub labels to add',
        },
      },
      required: ['taskId'],
    },
  })
  async createIssue(args: {
    taskId: string;
    projectId?: string;
    labels?: string[];
  }) {
    // Check GitHub authentication
    if (!this.githubService.isAuthenticated()) {
      return {
        content: [
          {
            type: 'text',
            text: 'GitHub CLI not authenticated. Run: gh auth login',
          },
        ],
        isError: true,
      };
    }

    const repoInfo = this.githubService.getRepoInfo();
    if (!repoInfo) {
      return {
        content: [
          {
            type: 'text',
            text: 'Not in a git repository with GitHub remote',
          },
        ],
        isError: true,
      };
    }

    // Resolve task (support #seq format)
    let task;
    if (args.taskId.startsWith('#')) {
      if (!args.projectId) {
        return {
          content: [
            {
              type: 'text',
              text: 'projectId is required when using #seq format',
            },
          ],
          isError: true,
        };
      }

      const seq = parseInt(args.taskId.slice(1), 10);
      task = await this.taskService.getBySeq(args.projectId, seq);
    } else {
      task = await this.taskService.get(args.taskId);
    }

    if (!task) {
      return {
        content: [{ type: 'text', text: `Task not found: ${args.taskId}` }],
        isError: true,
      };
    }

    // Check if project has GitHub integration enabled
    const project = await this.projectService.get(task.project_id);
    const githubEnabled = project.settings?.githubEnabled === true;

    if (!githubEnabled) {
      return {
        content: [
          {
            type: 'text',
            text: `GitHub integration is disabled for this project. Enable with pm_github_config(projectId, "enable")`,
          },
        ],
        isError: true,
      };
    }

    // Create GitHub issue
    const issue = this.githubService.createIssue({
      title: task.title,
      body: task.description || undefined,
      labels: args.labels,
    });

    if (!issue) {
      return {
        content: [{ type: 'text', text: 'Failed to create GitHub issue' }],
        isError: true,
      };
    }

    // Update task with GitHub issue link (using direct repository update)
    const linkedPrs = task.linked_prs ? JSON.parse(task.linked_prs) : [];
    const issueLink = `issue:${issue.number}`;
    if (!linkedPrs.includes(issueLink)) {
      linkedPrs.push(issueLink);
    }

    this.taskRepository.update(task.id, {
      linked_prs: JSON.stringify(linkedPrs),
    });

    return {
      content: [
        {
          type: 'text',
          text: `GitHub issue created: #${issue.number}
URL: https://github.com/${repoInfo.owner}/${repoInfo.repo}/issues/${issue.number}`,
        },
      ],
    };
  }

  @MCPTool({
    name: 'pm_github_issue_link',
    description: 'Link a task to an existing GitHub issue',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task UUID or #seq' },
        projectId: { type: 'string', description: 'Required when using #seq' },
        issueNumber: { type: 'number', description: 'GitHub issue number' },
      },
      required: ['taskId', 'issueNumber'],
    },
  })
  async linkIssue(args: {
    taskId: string;
    projectId?: string;
    issueNumber: number;
  }) {
    // Check GitHub authentication
    if (!this.githubService.isAuthenticated()) {
      return {
        content: [
          {
            type: 'text',
            text: 'GitHub CLI not authenticated. Run: gh auth login',
          },
        ],
        isError: true,
      };
    }

    const repoInfo = this.githubService.getRepoInfo();
    if (!repoInfo) {
      return {
        content: [
          {
            type: 'text',
            text: 'Not in a git repository with GitHub remote',
          },
        ],
        isError: true,
      };
    }

    // Resolve task
    let task;
    if (args.taskId.startsWith('#')) {
      if (!args.projectId) {
        return {
          content: [
            {
              type: 'text',
              text: 'projectId is required when using #seq format',
            },
          ],
          isError: true,
        };
      }

      const seq = parseInt(args.taskId.slice(1), 10);
      task = await this.taskService.getBySeq(args.projectId, seq);
    } else {
      task = await this.taskService.get(args.taskId);
    }

    if (!task) {
      return {
        content: [{ type: 'text', text: `Task not found: ${args.taskId}` }],
        isError: true,
      };
    }

    // Check if project has GitHub integration enabled
    const project = await this.projectService.get(task.project_id);
    const githubEnabled = project.settings?.githubEnabled === true;

    if (!githubEnabled) {
      return {
        content: [
          {
            type: 'text',
            text: `GitHub integration is disabled for this project. Enable with pm_github_config(projectId, "enable")`,
          },
        ],
        isError: true,
      };
    }

    // Verify issue exists
    const issue = this.githubService.getIssue(args.issueNumber);
    if (!issue) {
      return {
        content: [
          { type: 'text', text: `GitHub issue #${args.issueNumber} not found` },
        ],
        isError: true,
      };
    }

    // Update task with GitHub issue link (using direct repository update)
    const linkedPrs = task.linked_prs ? JSON.parse(task.linked_prs) : [];
    const issueLink = `issue:${args.issueNumber}`;
    if (!linkedPrs.includes(issueLink)) {
      linkedPrs.push(issueLink);
    }

    this.taskRepository.update(task.id, {
      linked_prs: JSON.stringify(linkedPrs),
    });

    return {
      content: [
        {
          type: 'text',
          text: `Linked task to GitHub issue #${args.issueNumber}`,
        },
      ],
    };
  }

  @MCPTool({
    name: 'pm_github_config',
    description: 'Configure GitHub integration for a project',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        action: {
          type: 'string',
          enum: ['get', 'enable', 'disable'],
          description: 'Action to perform',
        },
      },
      required: ['projectId', 'action'],
    },
  })
  async configureGitHub(args: {
    projectId: string;
    action: 'get' | 'enable' | 'disable';
  }) {
    // Verify project exists
    const project = await this.projectService.get(args.projectId);

    if (!project) {
      return {
        content: [{ type: 'text', text: `Project ${args.projectId} not found` }],
        isError: true,
      };
    }

    switch (args.action) {
      case 'get': {
        const githubEnabled = project.settings?.githubEnabled === true;
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  projectId: project.id,
                  projectName: project.name,
                  githubEnabled,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case 'enable': {
        // Check if GitHub CLI is authenticated
        if (!this.githubService.isAuthenticated()) {
          return {
            content: [
              {
                type: 'text',
                text: 'GitHub CLI not authenticated. Run: gh auth login',
              },
            ],
            isError: true,
          };
        }

        const repoInfo = this.githubService.getRepoInfo();
        if (!repoInfo) {
          return {
            content: [
              {
                type: 'text',
                text: 'Not in a git repository with GitHub remote',
              },
            ],
            isError: true,
          };
        }

        // Enable GitHub integration
        await this.projectService.update(project.id, {
          settings: {
            ...project.settings,
            githubEnabled: true,
            githubOwner: repoInfo.owner,
            githubRepo: repoInfo.repo,
          },
        });

        return {
          content: [
            {
              type: 'text',
              text: `GitHub integration enabled for project: ${project.name}
Repository: ${repoInfo.owner}/${repoInfo.repo}`,
            },
          ],
        };
      }

      case 'disable': {
        // Disable GitHub integration
        await this.projectService.update(project.id, {
          settings: {
            ...project.settings,
            githubEnabled: false,
          },
        });

        return {
          content: [
            {
              type: 'text',
              text: `GitHub integration disabled for project: ${project.name}`,
            },
          ],
        };
      }

      default:
        return {
          content: [
            { type: 'text', text: `Unknown action: ${args.action}` },
          ],
          isError: true,
        };
    }
  }
}
