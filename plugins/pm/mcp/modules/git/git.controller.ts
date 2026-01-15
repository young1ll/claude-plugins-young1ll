import { Controller } from '@nestjs/common';
import { GitService } from './git.service.js';
import { MCPTool } from '../../core/common/decorators/mcp-tool.decorator.js';
import { ListCommitsDto } from './dto/list-commits.dto.js';
import { CreatePullRequestDto } from './dto/create-pull-request.dto.js';
import { LinkPullRequestDto } from './dto/link-pull-request.dto.js';

@Controller()
export class GitController {
  constructor(private readonly gitService: GitService) {}

  @MCPTool({
    name: 'pm_commit_list',
    description: 'List commits with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Filter by task UUID' },
        branch: { type: 'string', description: 'Filter by branch name' },
        limit: { type: 'number', description: 'Max results (default: 50)' },
      },
    },
  })
  async listCommits(args: ListCommitsDto) {
    const commits = await this.gitService.listCommits(args);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(commits, null, 2),
        },
      ],
    };
  }

  @MCPTool({
    name: 'pm_commit_get',
    description: 'Get commit details by SHA',
    inputSchema: {
      type: 'object',
      properties: {
        sha: { type: 'string', description: 'Commit SHA (full or short)' },
      },
      required: ['sha'],
    },
  })
  async getCommit(args: { sha: string }) {
    const commit = await this.gitService.getCommit(args.sha);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(commit, null, 2),
        },
      ],
    };
  }

  @MCPTool({
    name: 'pm_commit_stats',
    description: 'Get commit statistics for a range',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start ref (default: HEAD~30)' },
        to: { type: 'string', description: 'End ref (default: HEAD)' },
      },
    },
  })
  async getCommitStats(args: { from?: string; to?: string }) {
    const stats = this.gitService.getCommitStats(args.from, args.to);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(stats, null, 2),
        },
      ],
    };
  }

  @MCPTool({
    name: 'pm_pr_create',
    description: 'Create and track a new pull request',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task UUID' },
        number: { type: 'number', description: 'PR number' },
        title: { type: 'string', description: 'PR title' },
        repo: { type: 'string', description: 'Repository name (optional)' },
        url: { type: 'string', description: 'PR URL (optional)' },
      },
      required: ['taskId', 'number', 'title'],
    },
  })
  async createPullRequest(args: CreatePullRequestDto) {
    const pr = await this.gitService.createPullRequest(args);
    return {
      content: [
        {
          type: 'text',
          text: `Pull request created: #${pr.number} - ${pr.title}`,
        },
      ],
    };
  }

  @MCPTool({
    name: 'pm_pr_link',
    description: 'Link an existing pull request to a task',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task UUID' },
        prNumber: { type: 'number', description: 'PR number' },
      },
      required: ['taskId', 'prNumber'],
    },
  })
  async linkPullRequest(args: LinkPullRequestDto) {
    const pr = await this.gitService.linkPullRequest(args);
    return {
      content: [
        {
          type: 'text',
          text: `Linked PR #${pr.number} to task`,
        },
      ],
    };
  }

  @MCPTool({
    name: 'pm_pr_list',
    description: 'List pull requests with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Filter by task UUID' },
        status: {
          type: 'string',
          enum: ['open', 'merged', 'closed'],
          description: 'Filter by status',
        },
      },
    },
  })
  async listPullRequests(args: { taskId?: string; status?: string }) {
    const prs = await this.gitService.listPullRequests(args.taskId, args.status);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(prs, null, 2),
        },
      ],
    };
  }

  @MCPTool({
    name: 'pm_pr_status',
    description: 'Get pull request status',
    inputSchema: {
      type: 'object',
      properties: {
        prNumber: { type: 'number', description: 'PR number' },
        repo: { type: 'string', description: 'Repository name (optional)' },
      },
      required: ['prNumber'],
    },
  })
  async getPullRequestStatus(args: { prNumber: number; repo?: string }) {
    const pr = await this.gitService.getPullRequestStatus(args.prNumber, args.repo);
    return {
      content: [
        {
          type: 'text',
          text: `PR #${pr.number}: ${pr.title}
Status: ${pr.status}
${pr.merged_at ? `Merged at: ${pr.merged_at}` : ''}
URL: ${pr.url || 'N/A'}`,
        },
      ],
    };
  }
}
