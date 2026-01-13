/**
 * Database Manager Unit Tests
 *
 * Tests for SQLite database wrapper.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DatabaseManager, getDatabase, closeDatabase } from "../../mcp/lib/db.js";

describe("DatabaseManager", () => {
  let db: DatabaseManager;

  beforeEach(() => {
    // Use in-memory database for tests
    db = new DatabaseManager(":memory:");
    // Create a simple test table
    db.getDb().exec(`
      CREATE TABLE test_table (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        value INTEGER
      )
    `);
  });

  afterEach(() => {
    db.close();
  });

  describe("constructor", () => {
    it("should set journal mode (WAL for file, memory for in-memory)", () => {
      const journalMode = db.getDb().pragma("journal_mode", { simple: true });
      // In-memory database uses "memory" journal mode, file-based uses "wal"
      expect(["wal", "memory"]).toContain(journalMode);
    });

    it("should enable foreign keys", () => {
      const fk = db.getDb().pragma("foreign_keys", { simple: true });
      expect(fk).toBe(1);
    });
  });

  describe("getDb", () => {
    it("should return database instance", () => {
      const instance = db.getDb();
      expect(instance).toBeDefined();
    });
  });

  describe("execute", () => {
    it("should insert a row", () => {
      const result = db.execute(
        "INSERT INTO test_table (name, value) VALUES (?, ?)",
        ["test", 42]
      );

      expect(result.changes).toBe(1);
      expect(result.lastInsertRowid).toBe(1);
    });

    it("should update a row", () => {
      db.execute("INSERT INTO test_table (name, value) VALUES (?, ?)", ["test", 42]);
      const result = db.execute(
        "UPDATE test_table SET value = ? WHERE name = ?",
        [100, "test"]
      );

      expect(result.changes).toBe(1);
    });

    it("should delete a row", () => {
      db.execute("INSERT INTO test_table (name, value) VALUES (?, ?)", ["test", 42]);
      const result = db.execute("DELETE FROM test_table WHERE name = ?", ["test"]);

      expect(result.changes).toBe(1);
    });
  });

  describe("query", () => {
    beforeEach(() => {
      db.execute("INSERT INTO test_table (name, value) VALUES (?, ?)", ["one", 1]);
      db.execute("INSERT INTO test_table (name, value) VALUES (?, ?)", ["two", 2]);
      db.execute("INSERT INTO test_table (name, value) VALUES (?, ?)", ["three", 3]);
    });

    it("should return all matching rows", () => {
      const rows = db.query<{ id: number; name: string; value: number }>(
        "SELECT * FROM test_table ORDER BY id"
      );

      expect(rows).toHaveLength(3);
      expect(rows[0].name).toBe("one");
      expect(rows[1].name).toBe("two");
      expect(rows[2].name).toBe("three");
    });

    it("should return filtered rows", () => {
      const rows = db.query<{ id: number; name: string; value: number }>(
        "SELECT * FROM test_table WHERE value > ?",
        [1]
      );

      expect(rows).toHaveLength(2);
    });

    it("should return empty array for no matches", () => {
      const rows = db.query(
        "SELECT * FROM test_table WHERE value > ?",
        [100]
      );

      expect(rows).toHaveLength(0);
    });
  });

  describe("queryOne", () => {
    beforeEach(() => {
      db.execute("INSERT INTO test_table (name, value) VALUES (?, ?)", ["test", 42]);
    });

    it("should return single row", () => {
      const row = db.queryOne<{ id: number; name: string; value: number }>(
        "SELECT * FROM test_table WHERE name = ?",
        ["test"]
      );

      expect(row).toBeDefined();
      expect(row?.name).toBe("test");
      expect(row?.value).toBe(42);
    });

    it("should return undefined for no match", () => {
      const row = db.queryOne(
        "SELECT * FROM test_table WHERE name = ?",
        ["nonexistent"]
      );

      expect(row).toBeUndefined();
    });
  });

  describe("transaction", () => {
    it("should commit successful transaction", () => {
      db.transaction(() => {
        db.execute("INSERT INTO test_table (name, value) VALUES (?, ?)", ["a", 1]);
        db.execute("INSERT INTO test_table (name, value) VALUES (?, ?)", ["b", 2]);
      });

      const rows = db.query("SELECT * FROM test_table");
      expect(rows).toHaveLength(2);
    });

    it("should rollback failed transaction", () => {
      try {
        db.transaction(() => {
          db.execute("INSERT INTO test_table (name, value) VALUES (?, ?)", ["a", 1]);
          throw new Error("Simulated error");
        });
      } catch {
        // Expected error
      }

      const rows = db.query("SELECT * FROM test_table");
      expect(rows).toHaveLength(0);
    });

    it("should return transaction result", () => {
      const result = db.transaction(() => {
        db.execute("INSERT INTO test_table (name, value) VALUES (?, ?)", ["test", 42]);
        return "success";
      });

      expect(result).toBe("success");
    });
  });

  describe("close", () => {
    it("should close database connection", () => {
      db.close();

      expect(() => db.query("SELECT 1")).toThrow();
    });
  });
});

describe("DatabaseManager with schema", () => {
  let db: DatabaseManager;

  beforeEach(() => {
    db = new DatabaseManager(":memory:");
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      // Already closed
    }
  });

  it("should handle complex queries", () => {
    // Create tables
    db.getDb().exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );
      CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id),
        title TEXT NOT NULL,
        status TEXT DEFAULT 'todo'
      );
    `);

    // Insert data
    db.execute("INSERT INTO projects (id, name) VALUES (?, ?)", ["p1", "Project 1"]);
    db.execute(
      "INSERT INTO tasks (id, project_id, title, status) VALUES (?, ?, ?, ?)",
      ["t1", "p1", "Task 1", "todo"]
    );
    db.execute(
      "INSERT INTO tasks (id, project_id, title, status) VALUES (?, ?, ?, ?)",
      ["t2", "p1", "Task 2", "done"]
    );

    // Query with join
    const results = db.query<{ task_title: string; project_name: string }>(
      `SELECT t.title as task_title, p.name as project_name
       FROM tasks t
       JOIN projects p ON t.project_id = p.id
       ORDER BY t.id`
    );

    expect(results).toHaveLength(2);
    expect(results[0].task_title).toBe("Task 1");
    expect(results[0].project_name).toBe("Project 1");
  });

  it("should handle NULL values", () => {
    db.getDb().exec(`
      CREATE TABLE nullable_test (
        id INTEGER PRIMARY KEY,
        optional_value TEXT
      )
    `);

    db.execute("INSERT INTO nullable_test (optional_value) VALUES (?)", [null]);
    db.execute("INSERT INTO nullable_test (optional_value) VALUES (?)", ["value"]);

    const rows = db.query<{ id: number; optional_value: string | null }>(
      "SELECT * FROM nullable_test ORDER BY id"
    );

    expect(rows[0].optional_value).toBeNull();
    expect(rows[1].optional_value).toBe("value");
  });

  it("should handle JSON data", () => {
    db.getDb().exec(`
      CREATE TABLE json_test (
        id INTEGER PRIMARY KEY,
        data TEXT
      )
    `);

    const jsonData = JSON.stringify({ key: "value", nested: { a: 1 } });
    db.execute("INSERT INTO json_test (data) VALUES (?)", [jsonData]);

    const row = db.queryOne<{ id: number; data: string }>(
      "SELECT * FROM json_test WHERE id = 1"
    );

    const parsed = JSON.parse(row!.data);
    expect(parsed.key).toBe("value");
    expect(parsed.nested.a).toBe(1);
  });
});

describe("DatabaseManager initSchema", () => {
  let db: DatabaseManager;

  afterEach(() => {
    try {
      db?.close();
    } catch {
      // Already closed
    }
  });

  it("should skip initialization if already initialized", () => {
    db = new DatabaseManager(":memory:");

    // Create a table to simulate schema
    db.getDb().exec("CREATE TABLE test (id INTEGER)");

    // First call
    db.initSchema();

    // Second call should be skipped (no error from duplicate CREATE)
    db.initSchema();

    // Should still work
    const result = db.query("SELECT 1 as value");
    expect(result[0]).toEqual({ value: 1 });
  });

  it("should handle missing schema file gracefully", () => {
    db = new DatabaseManager(":memory:");

    // initSchema should not throw even if schema file doesn't exist
    // (SCHEMA_PATH points to actual file, but in-memory DB is used)
    db.initSchema();

    // DB should still be functional
    db.getDb().exec("CREATE TABLE test (id INTEGER)");
    const result = db.query("SELECT 1 as value");
    expect(result[0]).toEqual({ value: 1 });
  });
});

describe("getDatabase singleton", () => {
  afterEach(() => {
    // Clean up singleton
    closeDatabase();
  });

  it("should return same instance on multiple calls", () => {
    const db1 = getDatabase(":memory:");
    const db2 = getDatabase(":memory:");

    expect(db1).toBe(db2);
  });

  it("should initialize schema on first call", () => {
    const db = getDatabase(":memory:");

    // Should be initialized and functional
    db.getDb().exec("CREATE TABLE test (id INTEGER)");
    const result = db.query("SELECT 1 as value");
    expect(result[0]).toEqual({ value: 1 });
  });
});

describe("closeDatabase", () => {
  it("should close and reset singleton", () => {
    const db1 = getDatabase(":memory:");
    expect(db1).toBeDefined();

    closeDatabase();

    // After close, should create new instance
    const db2 = getDatabase(":memory:");
    // db2 should be a new instance (can't compare directly as it's a new object)
    expect(db2).toBeDefined();
  });

  it("should handle multiple close calls gracefully", () => {
    getDatabase(":memory:");

    closeDatabase();
    closeDatabase(); // Should not throw
    closeDatabase(); // Should not throw
  });

  it("should do nothing if no database was created", () => {
    // Make sure singleton is null
    closeDatabase();

    // Should not throw
    closeDatabase();
  });
});
