import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../core/database/database.service.js';
import { SyncQueueRepository as LegacySyncQueueRepository } from '../../lib/projections.js';

@Injectable()
export class SyncRepository {
  private legacyRepo: LegacySyncQueueRepository;

  constructor(private readonly databaseService: DatabaseService) {
    this.legacyRepo = new LegacySyncQueueRepository(
      this.databaseService.getManager()
    );
  }

  enqueue(
    action: string,
    entityType: string,
    entityId: string,
    payload: Record<string, unknown>
  ) {
    return this.legacyRepo.enqueue(action, entityType, entityId, payload);
  }

  getPending(limit?: number) {
    return this.legacyRepo.getPending(limit);
  }

  getByEntity(entityType: string, entityId: string) {
    return this.legacyRepo.getByEntity(entityType, entityId);
  }

  markProcessing(id: number) {
    return this.legacyRepo.markProcessing(id);
  }

  markCompleted(id: number) {
    return this.legacyRepo.markCompleted(id);
  }

  markFailed(id: number, errorMessage: string) {
    return this.legacyRepo.markFailed(id, errorMessage);
  }

  retry(id: number) {
    return this.legacyRepo.retry(id);
  }

  getStats() {
    return this.legacyRepo.getStats();
  }

  clearOld(daysOld?: number) {
    return this.legacyRepo.clearOld(daysOld);
  }
}
