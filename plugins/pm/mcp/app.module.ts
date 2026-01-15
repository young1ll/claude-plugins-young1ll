import { Module } from '@nestjs/common';
import { DatabaseModule } from './core/database/database.module.js';
import { EventsModule } from './core/events/events.module.js';
import { TaskModule } from './modules/task/task.module.js';
import { ProjectModule } from './modules/project/project.module.js';
import { SprintModule } from './modules/sprint/sprint.module.js';
import { GitModule } from './modules/git/git.module.js';
import { GitHubModule } from './modules/github/github.module.js';

/**
 * Root application module
 *
 * This module imports all feature modules and provides
 * the NestJS application context for the MCP server.
 */
@Module({
  imports: [
    // Core modules
    DatabaseModule,
    EventsModule,

    // Feature modules
    TaskModule,
    ProjectModule,
    SprintModule,
    GitModule,
    GitHubModule,

    // To be added:
    // SyncModule,
  ],
})
export class AppModule {}
