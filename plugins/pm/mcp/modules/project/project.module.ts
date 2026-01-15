import { Module } from '@nestjs/common';
import { ProjectService } from './project.service.js';
import { ProjectRepository } from './project.repository.js';
import { ProjectController } from './project.controller.js';

@Module({
  providers: [ProjectService, ProjectRepository],
  controllers: [ProjectController],
  exports: [ProjectService],
})
export class ProjectModule {}
