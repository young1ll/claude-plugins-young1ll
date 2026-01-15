import { Injectable } from '@nestjs/common';
import { SprintRepository } from './sprint.repository.js';
import { CreateSprintDto } from './dto/create-sprint.dto.js';
import { AddTasksToSprintDto } from './dto/add-tasks-to-sprint.dto.js';
import { GetSprintStatusDto } from './dto/get-sprint-status.dto.js';

@Injectable()
export class SprintService {
  constructor(private readonly sprintRepository: SprintRepository) {}

  async create(dto: CreateSprintDto) {
    return this.sprintRepository.create(
      dto.projectId,
      dto.name,
      dto.startDate,
      dto.endDate,
      dto.goal
    );
  }

  async list(projectId: string) {
    return this.sprintRepository.list(projectId);
  }

  async getStatus(dto: GetSprintStatusDto) {
    return this.sprintRepository.getStatus(dto.sprintId);
  }

  async start(sprintId: string) {
    const sprint = this.sprintRepository.start(sprintId);
    if (!sprint) {
      throw new Error(`Sprint not found: ${sprintId}`);
    }
    return sprint;
  }

  async complete(sprintId: string) {
    const sprint = this.sprintRepository.complete(sprintId);
    if (!sprint) {
      throw new Error(`Sprint not found: ${sprintId}`);
    }
    return sprint;
  }

  async addTasks(dto: AddTasksToSprintDto) {
    this.sprintRepository.addTasks(dto.sprintId, dto.taskIds);
    return this.sprintRepository.getById(dto.sprintId);
  }
}
