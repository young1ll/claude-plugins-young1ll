import { Module } from '@nestjs/common';
import { GitService } from './git.service.js';
import { CommitRepository } from './commit.repository.js';
import { PullRequestRepository } from './pull-request.repository.js';
import { GitController } from './git.controller.js';

@Module({
  providers: [GitService, CommitRepository, PullRequestRepository],
  controllers: [GitController],
  exports: [GitService],
})
export class GitModule {}
