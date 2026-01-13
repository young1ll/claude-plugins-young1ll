/**
 * E2E Test Context Helper
 *
 * Provides a complete test context with real database and GitHub access.
 */

import { EventStore } from "../../../storage/lib/events.js";
import {
  ProjectRepository,
  SprintRepository,
  TaskRepository,
  AnalyticsRepository,
} from "../../../mcp/lib/projections.js";
import { GitHubE2EHelper } from "./github-helper.js";
import { DBE2EHelper } from "./db-helper.js";

export interface E2ETestContext {
  // Helpers
  github: GitHubE2EHelper;
  dbHelper: DBE2EHelper;

  // Repositories (file-based DB)
  eventStore: EventStore;
  projectRepo: ProjectRepository;
  sprintRepo: SprintRepository;
  taskRepo: TaskRepository;
  analyticsRepo: AnalyticsRepository;
}

/**
 * Create a complete E2E test context with real file-based database
 */
export function createE2ETestContext(): E2ETestContext {
  const github = new GitHubE2EHelper();
  const dbHelper = new DBE2EHelper();

  // Setup real file-based database
  const dbManager = dbHelper.setup();
  const db = dbManager.getDb();

  // Initialize EventStore with real database
  const eventStore = new EventStore(db, true);

  // Create repositories
  const projectRepo = new ProjectRepository(dbManager, eventStore);
  const sprintRepo = new SprintRepository(dbManager, eventStore);
  const taskRepo = new TaskRepository(dbManager, eventStore);
  const analyticsRepo = new AnalyticsRepository(dbManager);

  return {
    github,
    dbHelper,
    eventStore,
    projectRepo,
    sprintRepo,
    taskRepo,
    analyticsRepo,
  };
}

/**
 * Create a lightweight E2E context without GitHub helper
 * Useful for database-only tests
 */
export function createDBOnlyContext(): Omit<E2ETestContext, "github"> {
  const dbHelper = new DBE2EHelper();
  const dbManager = dbHelper.setup();
  const db = dbManager.getDb();

  const eventStore = new EventStore(db, true);
  const projectRepo = new ProjectRepository(dbManager, eventStore);
  const sprintRepo = new SprintRepository(dbManager, eventStore);
  const taskRepo = new TaskRepository(dbManager, eventStore);
  const analyticsRepo = new AnalyticsRepository(dbManager);

  return {
    dbHelper,
    eventStore,
    projectRepo,
    sprintRepo,
    taskRepo,
    analyticsRepo,
  };
}

/**
 * Clean up E2E test context
 */
export function cleanupE2ETestContext(ctx: E2ETestContext): void {
  // Clean up GitHub resources
  ctx.github.cleanupTestIssues();
  ctx.github.cleanupTestBranches();

  // Clean up database
  ctx.dbHelper.cleanup();
}

/**
 * Clean up database-only context
 */
export function cleanupDBOnlyContext(
  ctx: Omit<E2ETestContext, "github">
): void {
  ctx.dbHelper.cleanup();
}

/**
 * Repositories interface for handler tests
 */
export interface Repositories {
  projectRepo: ProjectRepository;
  sprintRepo: SprintRepository;
  taskRepo: TaskRepository;
  analyticsRepo: AnalyticsRepository;
  eventStore: EventStore;
}

/**
 * Extract repositories from context for handler tests
 */
export function getRepositories(ctx: E2ETestContext | Omit<E2ETestContext, "github">): Repositories {
  return {
    projectRepo: ctx.projectRepo,
    sprintRepo: ctx.sprintRepo,
    taskRepo: ctx.taskRepo,
    analyticsRepo: ctx.analyticsRepo,
    eventStore: ctx.eventStore,
  };
}
