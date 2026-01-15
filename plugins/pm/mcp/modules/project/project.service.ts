import { Injectable } from '@nestjs/common';
import { ProjectRepository } from './project.repository.js';
import { CreateProjectDto } from './dto/create-project.dto.js';

@Injectable()
export class ProjectService {
  constructor(private readonly projectRepository: ProjectRepository) {}

  async create(dto: CreateProjectDto) {
    return this.projectRepository.create(dto.name, dto.description);
  }

  async list() {
    return this.projectRepository.list();
  }

  async get(id: string) {
    const project = this.projectRepository.getById(id);
    if (!project) {
      throw new Error(`Project not found: ${id}`);
    }
    return project;
  }

  async update(id: string, updates: Record<string, unknown>) {
    return this.projectRepository.update(id, updates);
  }
}
