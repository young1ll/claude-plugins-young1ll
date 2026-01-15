import { Injectable } from '@nestjs/common';
import { SyncRepository } from './sync.repository.js';

@Injectable()
export class SyncService {
  constructor(private readonly syncRepository: SyncRepository) {}

  /**
   * List sync queue items with optional filters
   */
  async list(status?: string, limit?: number) {
    if (status === 'pending') {
      return this.syncRepository.getPending(limit);
    }

    // For other statuses, we'll need to get all pending and filter
    // (or extend the legacy repo to support status filtering)
    return this.syncRepository.getPending(limit);
  }

  /**
   * Process a specific queue item or all pending items
   */
  async process(queueId?: number) {
    if (queueId) {
      // Process specific item
      this.syncRepository.markProcessing(queueId);

      try {
        // TODO: Implement actual sync logic here
        // For now, just mark as completed
        this.syncRepository.markCompleted(queueId);
        return { success: true, processed: 1 };
      } catch (error) {
        this.syncRepository.markFailed(
          queueId,
          error instanceof Error ? error.message : String(error)
        );
        throw error;
      }
    } else {
      // Process all pending items
      const pending = this.syncRepository.getPending(100);
      let processed = 0;
      let failed = 0;

      for (const item of pending) {
        this.syncRepository.markProcessing(item.id);

        try {
          // TODO: Implement actual sync logic here
          this.syncRepository.markCompleted(item.id);
          processed++;
        } catch (error) {
          this.syncRepository.markFailed(
            item.id,
            error instanceof Error ? error.message : String(error)
          );
          failed++;
        }
      }

      return { success: true, processed, failed };
    }
  }

  /**
   * Get queue statistics
   */
  async getStats() {
    return this.syncRepository.getStats();
  }

  /**
   * Clear completed items older than specified days
   */
  async clear(daysOld?: number) {
    const cleared = this.syncRepository.clearOld(daysOld);
    return { cleared };
  }

  /**
   * Retry a failed queue item
   */
  async retry(queueId: number) {
    this.syncRepository.retry(queueId);
    return { success: true };
  }
}
