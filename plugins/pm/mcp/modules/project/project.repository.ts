import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../core/database/database.service.js';
import { EventStoreService } from '../../core/events/event-store.service.js';
import { ProjectRepository as LegacyProjectRepository } from '../../lib/projections.js';

@Injectable()
export class ProjectRepository {
  private legacyRepo: LegacyProjectRepository;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly eventStoreService: EventStoreService
  ) {
    this.legacyRepo = new LegacyProjectRepository(
      this.databaseService.getManager(),
      this.eventStoreService.getStore()
    );
  }

  create(name: string, description?: string, settings?: Record<string, unknown>) {
    return this.legacyRepo.create(name, description, settings);
  }

  getById(id: string) {
    return this.legacyRepo.getById(id);
  }

  list() {
    return this.legacyRepo.list();
  }

  update(id: string, updates: Record<string, unknown>) {
    return this.legacyRepo.update(id, updates);
  }
}
