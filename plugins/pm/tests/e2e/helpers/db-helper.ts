/**
 * Database E2E Test Helper
 *
 * Manages real file-based SQLite database for E2E tests.
 */

import { existsSync, unlinkSync, mkdirSync, readFileSync } from "fs";
import { dirname, resolve } from "path";
import { DatabaseManager } from "../../../mcp/lib/db.js";
import { getE2EConfig } from "../config/env.js";

export class DBE2EHelper {
  private readonly dbPath: string;
  private db: DatabaseManager | null = null;

  constructor(uniqueSuffix?: string) {
    const config = getE2EConfig();
    // Use unique suffix to avoid DB lock conflicts between test files
    const suffix = uniqueSuffix || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.dbPath = config.db.path.replace(".db", `-${suffix}.db`);
  }

  /**
   * Set up a file-based test database
   */
  setup(): DatabaseManager {
    const config = getE2EConfig();

    // Remove existing test DB if cleanup is enabled
    if (config.db.cleanupBefore) {
      this.removeDbFiles();
    }

    // Ensure directory exists
    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Create database with full schema
    this.db = new DatabaseManager(this.dbPath);
    this.initializeSchema();

    return this.db;
  }

  /**
   * Initialize the full schema for E2E tests
   */
  private initializeSchema(): void {
    if (!this.db) throw new Error("DB not initialized");

    this.db.getDb().exec(`
      -- Projects table
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'active',
        settings TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      -- Sprints table
      CREATE TABLE IF NOT EXISTS sprints (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        name TEXT NOT NULL,
        goal TEXT,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        status TEXT DEFAULT 'planning',
        velocity_committed INTEGER DEFAULT 0,
        velocity_completed INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT
      );

      -- Tasks table
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id),
        sprint_id TEXT REFERENCES sprints(id),
        parent_id TEXT REFERENCES tasks(id),
        title TEXT NOT NULL,
        description TEXT,
        type TEXT DEFAULT 'task',
        status TEXT DEFAULT 'todo',
        priority TEXT DEFAULT 'medium',
        estimate_points INTEGER,
        estimate_hours REAL,
        actual_hours REAL,
        assignee TEXT,
        labels TEXT,
        due_date TEXT,
        blocked_by TEXT,
        branch_name TEXT,
        linked_commits TEXT,
        linked_prs TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        started_at TEXT,
        completed_at TEXT
      );

      -- Sprint tasks junction
      CREATE TABLE IF NOT EXISTS sprint_tasks (
        sprint_id TEXT NOT NULL REFERENCES sprints(id),
        task_id TEXT NOT NULL REFERENCES tasks(id),
        added_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (sprint_id, task_id)
      );

      -- Velocity history
      CREATE TABLE IF NOT EXISTS velocity_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL REFERENCES projects(id),
        sprint_id TEXT NOT NULL REFERENCES sprints(id),
        committed_points INTEGER DEFAULT 0,
        completed_points INTEGER DEFAULT 0,
        completion_rate REAL DEFAULT 0,
        recorded_at TEXT DEFAULT (datetime('now'))
      );

      -- Events table (for EventStore - must match storage/lib/events.ts schema)
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT UNIQUE NOT NULL,
        event_type TEXT NOT NULL,
        aggregate_type TEXT NOT NULL,
        aggregate_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        version INTEGER NOT NULL DEFAULT 1
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_sprint ON tasks(sprint_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_sprints_project ON sprints(project_id);
      CREATE INDEX IF NOT EXISTS idx_events_aggregate ON events(aggregate_type, aggregate_id);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
      CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
    `);
  }

  /**
   * Seed test data
   */
  seed(): void {
    if (!this.db) throw new Error("DB not initialized");

    this.db.transaction(() => {
      // Create test project
      this.db!.execute(
        `INSERT INTO projects (id, name, description, status) VALUES (?, ?, ?, ?)`,
        ["e2e-project-1", "E2E Test Project", "Project for E2E testing", "active"]
      );

      // Create another project for multi-project tests
      this.db!.execute(
        `INSERT INTO projects (id, name, description, status) VALUES (?, ?, ?, ?)`,
        ["e2e-project-2", "E2E Project Two", "Second test project", "active"]
      );
    });
  }

  /**
   * Remove database files (including WAL and SHM)
   */
  private removeDbFiles(): void {
    const files = [this.dbPath, `${this.dbPath}-wal`, `${this.dbPath}-shm`];
    for (const file of files) {
      if (existsSync(file)) {
        try {
          unlinkSync(file);
        } catch {
          // Ignore errors
        }
      }
    }
  }

  /**
   * Clean up and close database
   */
  cleanup(): void {
    if (this.db) {
      try {
        this.db.close();
      } catch {
        // Already closed
      }
      this.db = null;
    }

    const config = getE2EConfig();
    if (!config.skipCleanup) {
      this.removeDbFiles();
    }
  }

  /**
   * Get the database manager instance
   */
  getDb(): DatabaseManager {
    if (!this.db) throw new Error("DB not initialized. Call setup() first.");
    return this.db;
  }

  /**
   * Get the database file path
   */
  getDbPath(): string {
    return this.dbPath;
  }

  /**
   * Check if database file exists
   */
  exists(): boolean {
    return existsSync(this.dbPath);
  }

  /**
   * Execute raw SQL (for testing purposes)
   */
  execRaw(sql: string): void {
    if (!this.db) throw new Error("DB not initialized");
    this.db.getDb().exec(sql);
  }

  /**
   * Query data (for verification)
   */
  query<T>(sql: string, params?: unknown[]): T[] {
    if (!this.db) throw new Error("DB not initialized");
    return this.db.query<T>(sql, params);
  }
}
