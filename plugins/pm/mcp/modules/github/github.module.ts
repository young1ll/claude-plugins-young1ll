import { Module } from '@nestjs/common';
import { GitHubService } from './github.service.js';
import { GitHubController } from './github.controller.js';
import { TaskModule } from '../task/task.module.js';
import { ProjectModule } from '../project/project.module.js';

@Module({
  imports: [TaskModule, ProjectModule],
  providers: [GitHubService],
  controllers: [GitHubController],
  exports: [GitHubService],
})
export class GitHubModule {}
