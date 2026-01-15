import { Controller } from '@nestjs/common';
import { SyncService } from './sync.service.js';
import { MCPTool } from '../../core/common/decorators/mcp-tool.decorator.js';

@Controller()
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @MCPTool({
    name: 'pm_sync_queue_list',
    description: 'List sync queue items',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'processing', 'completed', 'failed'],
          description: 'Filter by status',
        },
        limit: {
          type: 'number',
          description: 'Max items to return (default: 10)',
        },
      },
    },
  })
  async listQueue(args: { status?: string; limit?: number }) {
    const items = await this.syncService.list(args.status, args.limit);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(items, null, 2),
        },
      ],
    };
  }

  @MCPTool({
    name: 'pm_sync_queue_process',
    description: 'Process sync queue items (manual retry)',
    inputSchema: {
      type: 'object',
      properties: {
        queueId: {
          type: 'number',
          description: 'Specific queue item ID (optional, processes all if omitted)',
        },
      },
    },
  })
  async processQueue(args: { queueId?: number }) {
    const result = await this.syncService.process(args.queueId);
    return {
      content: [
        {
          type: 'text',
          text: args.queueId
            ? `Processed queue item #${args.queueId}`
            : `Processed ${result.processed} items${result.failed ? `, ${result.failed} failed` : ''}`,
        },
      ],
    };
  }

  @MCPTool({
    name: 'pm_sync_queue_stats',
    description: 'Get sync queue statistics',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  })
  async getStats() {
    const stats = await this.syncService.getStats();
    return {
      content: [
        {
          type: 'text',
          text: `Sync Queue Statistics:
Pending: ${stats.pending}
Processing: ${stats.processing}
Completed: ${stats.completed}
Failed: ${stats.failed}`,
        },
      ],
    };
  }

  @MCPTool({
    name: 'pm_sync_queue_clear',
    description: 'Clear completed items from sync queue',
    inputSchema: {
      type: 'object',
      properties: {
        daysOld: {
          type: 'number',
          description: 'Clear items completed more than N days ago (default: 7)',
        },
      },
    },
  })
  async clearQueue(args: { daysOld?: number }) {
    const result = await this.syncService.clear(args.daysOld);
    return {
      content: [
        {
          type: 'text',
          text: `Cleared ${result.cleared} completed items`,
        },
      ],
    };
  }

  @MCPTool({
    name: 'pm_sync_queue_retry',
    description: 'Retry a failed sync queue item',
    inputSchema: {
      type: 'object',
      properties: {
        queueId: {
          type: 'number',
          description: 'Queue item ID to retry',
        },
      },
      required: ['queueId'],
    },
  })
  async retryQueue(args: { queueId: number }) {
    await this.syncService.retry(args.queueId);
    return {
      content: [
        {
          type: 'text',
          text: `Reset queue item #${args.queueId} to pending for retry`,
        },
      ],
    };
  }
}
