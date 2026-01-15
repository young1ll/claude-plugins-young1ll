import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../core/database/database.service.js';
import { EventStoreService } from '../../core/events/event-store.service.js';
import { SprintRepository as LegacySprintRepository } from '../../lib/projections.js';

@Injectable()
export class SprintRepository {
  private legacyRepo: LegacySprintRepository;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly eventStoreService: EventStoreService
  ) {
    this.legacyRepo = new LegacySprintRepository(
      this.databaseService.getManager(),
      this.eventStoreService.getStore()
    );
  }

  create(
    projectId: string,
    name: string,
    startDate: string,
    endDate: string,
    goal?: string
  ) {
    return this.legacyRepo.create(projectId, name, startDate, endDate, goal);
  }

  getById(id: string) {
    return this.legacyRepo.getById(id);
  }

  getActive(projectId: string) {
    return this.legacyRepo.getActive(projectId);
  }

  list(projectId: string) {
    return this.legacyRepo.list(projectId);
  }

  getStatus(sprintId: string) {
    return this.legacyRepo.getStatus(sprintId);
  }

  start(sprintId: string) {
    return this.legacyRepo.start(sprintId);
  }

  complete(sprintId: string) {
    return this.legacyRepo.complete(sprintId);
  }

  addTasks(sprintId: string, taskIds: string[]) {
    return this.legacyRepo.addTasks(sprintId, taskIds);
  }
}
