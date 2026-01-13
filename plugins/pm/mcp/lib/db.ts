/**
 * PM Plugin Database Layer
 *
 * SQLite database wrapper with:
 * - Schema initialization
 * - WAL mode for concurrent access
 * - Connection management
 */

import Database from "better-sqlite3";
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, "../../storage/schema.sql");

export class DatabaseManager {
  private db: Database.Database;
  private initialized = false;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
  }

  /**
   * Initialize database schema
   */
  initSchema(): void {
    if (this.initialized) return;

    if (existsSync(SCHEMA_PATH)) {
      const schema = readFileSync(SCHEMA_PATH, "utf-8");
      this.db.exec(schema);
    }

    this.initialized = true;
  }

  /**
   * Get the underlying database instance
   */
  getDb(): Database.Database {
    return this.db;
  }

  /**
   * Execute a query and return all rows
   */
  query<T = unknown>(sql: string, params: unknown[] = []): T[] {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as T[];
  }

  /**
   * Execute a query and return first row
   */
  queryOne<T = unknown>(sql: string, params: unknown[] = []): T | undefined {
    const stmt = this.db.prepare(sql);
    return stmt.get(...params) as T | undefined;
  }

  /**
   * Execute an insert/update/delete
   */
  execute(sql: string, params: unknown[] = []): Database.RunResult {
    const stmt = this.db.prepare(sql);
    return stmt.run(...params);
  }

  /**
   * Run multiple statements in a transaction
   */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  close(): void {
    this.db.close();
  }
}

// Singleton instance
let dbManager: DatabaseManager | null = null;

export function getDatabase(dbPath: string): DatabaseManager {
  if (!dbManager) {
    dbManager = new DatabaseManager(dbPath);
    dbManager.initSchema();
  }
  return dbManager;
}

export function closeDatabase(): void {
  if (dbManager) {
    dbManager.close();
    dbManager = null;
  }
}
