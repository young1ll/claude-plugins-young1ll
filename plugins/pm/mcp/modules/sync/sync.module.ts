import { Module } from '@nestjs/common';
import { SyncService } from './sync.service.js';
import { SyncRepository } from './sync.repository.js';
import { SyncController } from './sync.controller.js';

@Module({
  providers: [SyncService, SyncRepository],
  controllers: [SyncController],
  exports: [SyncService],
})
export class SyncModule {}
