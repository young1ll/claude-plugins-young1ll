import { Module } from '@nestjs/common';
import { SprintService } from './sprint.service.js';
import { SprintRepository } from './sprint.repository.js';
import { SprintController } from './sprint.controller.js';

@Module({
  providers: [SprintService, SprintRepository],
  controllers: [SprintController],
  exports: [SprintService],
})
export class SprintModule {}
