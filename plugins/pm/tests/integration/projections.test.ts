/**
 * Projections Integration Tests
 *
 * Tests for CQRS repositories with actual database.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DatabaseManager } from "../../mcp/lib/db.js";
import { EventStore } from "../../storage/lib/events.js";
import {
  ProjectRepository,
  SprintRepository,
  TaskRepository,
  AnalyticsRepository,
} from "../../mcp/lib/projections.js";

// Test schema (simplified version)
const TEST_SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active',
  settings TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sprints (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  goal TEXT,
  start_date TEXT,
  end_date TEXT,
  status TEXT DEFAULT 'planning',
  velocity_committed INTEGER DEFAULT 0,
  velocity_completed INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  sprint_id TEXT REFERENCES sprints(id),
  parent_id TEXT REFERENCES tasks(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'todo',
  priority TEXT DEFAULT 'medium',
  type TEXT DEFAULT 'task',
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS velocity_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(id),
  sprint_id TEXT NOT NULL REFERENCES sprints(id),
  committed_points INTEGER NOT NULL,
  completed_points INTEGER NOT NULL,
  completion_rate REAL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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
`;

describe("ProjectRepository", () => {
  let db: DatabaseManager;
  let eventStore: EventStore;
  let projectRepo: ProjectRepository;

  beforeEach(() => {
    db = new DatabaseManager(":memory:");
    db.getDb().exec(TEST_SCHEMA);
    eventStore = new EventStore(":memory:", true);
    projectRepo = new ProjectRepository(db, eventStore);
  });

  afterEach(() => {
    db.close();
    eventStore.close();
  });

  describe("create", () => {
    it("should create a new project", () => {
      const project = projectRepo.create("Test Project", "A test project");

      expect(project.id).toBeDefined();
      expect(project.name).toBe("Test Project");
      expect(project.description).toBe("A test project");
      expect(project.status).toBe("active");
    });

    it("should create project with settings", () => {
      const project = projectRepo.create(
        "Project",
        "Description",
        { velocity_method: "average", estimation_unit: "points" }
      );

      expect(project.settings).toBeDefined();
    });
  });

  describe("getById", () => {
    it("should return project by id", () => {
      const created = projectRepo.create("Test Project");

      const found = projectRepo.getById(created.id);

      expect(found).toBeDefined();
      expect(found?.name).toBe("Test Project");
    });

    it("should return undefined for non-existent id", () => {
      const found = projectRepo.getById("non-existent");

      expect(found).toBeUndefined();
    });
  });

  describe("list", () => {
    it("should list all active projects", () => {
      projectRepo.create("Project 1");
      projectRepo.create("Project 2");
      projectRepo.create("Project 3");

      const projects = projectRepo.list();

      expect(projects).toHaveLength(3);
    });

    it("should return empty array when no projects", () => {
      const projects = projectRepo.list();

      expect(projects).toHaveLength(0);
    });
  });

  describe("update", () => {
    it("should update project name", () => {
      const project = projectRepo.create("Original Name");

      const updated = projectRepo.update(project.id, { name: "Updated Name" });

      expect(updated?.name).toBe("Updated Name");
    });

    it("should update project description", () => {
      const project = projectRepo.create("Project", "Original");

      const updated = projectRepo.update(project.id, { description: "Updated" });

      expect(updated?.description).toBe("Updated");
    });

    it("should update project status", () => {
      const project = projectRepo.create("Project");

      const updated = projectRepo.update(project.id, { status: "archived" });

      expect(updated?.status).toBe("archived");
    });
  });
});

describe("SprintRepository", () => {
  let db: DatabaseManager;
  let eventStore: EventStore;
  let projectRepo: ProjectRepository;
  let sprintRepo: SprintRepository;
  let projectId: string;

  beforeEach(() => {
    db = new DatabaseManager(":memory:");
    db.getDb().exec(TEST_SCHEMA);
    eventStore = new EventStore(":memory:", true);
    projectRepo = new ProjectRepository(db, eventStore);
    sprintRepo = new SprintRepository(db, eventStore);

    // Create a project for sprints
    const project = projectRepo.create("Test Project");
    projectId = project.id;
  });

  afterEach(() => {
    db.close();
    eventStore.close();
  });

  describe("create", () => {
    it("should create a new sprint", () => {
      const sprint = sprintRepo.create(
        projectId,
        "Sprint 1",
        "2025-01-01",
        "2025-01-14",
        "Complete auth feature"
      );

      expect(sprint.id).toBeDefined();
      expect(sprint.name).toBe("Sprint 1");
      expect(sprint.project_id).toBe(projectId);
      expect(sprint.goal).toBe("Complete auth feature");
      expect(sprint.status).toBe("planning");
    });
  });

  describe("getById", () => {
    it("should return sprint by id", () => {
      const created = sprintRepo.create(projectId, "Sprint 1", "2025-01-01", "2025-01-14");

      const found = sprintRepo.getById(created.id);

      expect(found).toBeDefined();
      expect(found?.name).toBe("Sprint 1");
    });
  });

  describe("list", () => {
    it("should list sprints for a project", () => {
      sprintRepo.create(projectId, "Sprint 1", "2025-01-01", "2025-01-14");
      sprintRepo.create(projectId, "Sprint 2", "2025-01-15", "2025-01-28");

      const sprints = sprintRepo.list(projectId);

      expect(sprints).toHaveLength(2);
    });
  });

  describe("start", () => {
    it("should start a sprint", () => {
      const sprint = sprintRepo.create(projectId, "Sprint 1", "2025-01-01", "2025-01-14");

      const started = sprintRepo.start(sprint.id);

      expect(started?.status).toBe("active");
    });
  });

  describe("getActive", () => {
    it("should return active sprint", () => {
      const sprint = sprintRepo.create(projectId, "Sprint 1", "2025-01-01", "2025-01-14");
      sprintRepo.start(sprint.id);

      const active = sprintRepo.getActive(projectId);

      expect(active).toBeDefined();
      expect(active?.id).toBe(sprint.id);
    });

    it("should return undefined when no active sprint", () => {
      sprintRepo.create(projectId, "Sprint 1", "2025-01-01", "2025-01-14");

      const active = sprintRepo.getActive(projectId);

      expect(active).toBeUndefined();
    });
  });

  describe("getStatus", () => {
    it("should return sprint status with metrics", () => {
      const sprint = sprintRepo.create(projectId, "Sprint 1", "2025-01-01", "2025-01-14");

      // Add some tasks
      db.execute(
        `INSERT INTO tasks (id, project_id, sprint_id, title, status, estimate_points)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ["t1", projectId, sprint.id, "Task 1", "done", 3]
      );
      db.execute(
        `INSERT INTO tasks (id, project_id, sprint_id, title, status, estimate_points)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ["t2", projectId, sprint.id, "Task 2", "in_progress", 5]
      );

      const status = sprintRepo.getStatus(sprint.id);

      expect(status).toBeDefined();
      expect(status?.totalPoints).toBe(8);
      expect(status?.completedPoints).toBe(3);
      expect(status?.progressPct).toBe(38); // 3/8 * 100 = 37.5, rounded to 38
      expect(status?.tasks).toHaveLength(2);
    });
  });

  describe("complete", () => {
    it("should complete a sprint and record velocity", () => {
      const sprint = sprintRepo.create(projectId, "Sprint 1", "2025-01-01", "2025-01-14");
      sprintRepo.start(sprint.id);

      // Add tasks
      db.execute(
        `INSERT INTO tasks (id, project_id, sprint_id, title, status, estimate_points)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ["t1", projectId, sprint.id, "Task 1", "done", 5]
      );

      const completed = sprintRepo.complete(sprint.id);

      expect(completed?.status).toBe("completed");
      expect(completed?.velocity_completed).toBe(5);

      // Check velocity history
      const history = db.query("SELECT * FROM velocity_history WHERE sprint_id = ?", [sprint.id]);
      expect(history).toHaveLength(1);
    });
  });
});

describe("TaskRepository", () => {
  let db: DatabaseManager;
  let eventStore: EventStore;
  let projectRepo: ProjectRepository;
  let taskRepo: TaskRepository;
  let projectId: string;

  beforeEach(() => {
    db = new DatabaseManager(":memory:");
    db.getDb().exec(TEST_SCHEMA);
    eventStore = new EventStore(":memory:", true);
    projectRepo = new ProjectRepository(db, eventStore);
    taskRepo = new TaskRepository(db, eventStore);

    const project = projectRepo.create("Test Project");
    projectId = project.id;
  });

  afterEach(() => {
    db.close();
    eventStore.close();
  });

  describe("getById", () => {
    it("should return task by id", () => {
      db.execute(
        `INSERT INTO tasks (id, project_id, title, status, priority, type)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ["t1", projectId, "Task 1", "todo", "medium", "task"]
      );

      const task = taskRepo.getById("t1");

      expect(task).toBeDefined();
      expect(task?.title).toBe("Task 1");
    });

    it("should return undefined for non-existent task", () => {
      const task = taskRepo.getById("non-existent");

      expect(task).toBeUndefined();
    });
  });

  describe("list", () => {
    beforeEach(() => {
      db.execute(
        `INSERT INTO tasks (id, project_id, title, status, priority, type, assignee)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ["t1", projectId, "Task 1", "todo", "high", "task", "john"]
      );
      db.execute(
        `INSERT INTO tasks (id, project_id, title, status, priority, type, assignee)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ["t2", projectId, "Task 2", "in_progress", "medium", "bug", "jane"]
      );
      db.execute(
        `INSERT INTO tasks (id, project_id, title, status, priority, type, assignee)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ["t3", projectId, "Task 3", "done", "low", "task", "john"]
      );
    });

    it("should list all tasks", () => {
      const tasks = taskRepo.list({ projectId });

      expect(tasks).toHaveLength(3);
    });

    it("should filter by status", () => {
      const tasks = taskRepo.list({ projectId, status: "todo" });

      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe("Task 1");
    });

    it("should filter by assignee", () => {
      const tasks = taskRepo.list({ projectId, assignee: "john" });

      expect(tasks).toHaveLength(2);
    });

    it("should filter by type", () => {
      const tasks = taskRepo.list({ projectId, type: "bug" });

      expect(tasks).toHaveLength(1);
      expect(tasks[0].title).toBe("Task 2");
    });

    it("should filter by priority", () => {
      const tasks = taskRepo.list({ projectId, priority: "high" });

      expect(tasks).toHaveLength(1);
    });

    it("should order by priority then created_at", () => {
      const tasks = taskRepo.list({ projectId });

      expect(tasks[0].priority).toBe("high");
    });

    it("should support limit and offset", () => {
      const tasks = taskRepo.list({ projectId, limit: 2, offset: 1 });

      expect(tasks).toHaveLength(2);
    });
  });

  describe("update", () => {
    beforeEach(() => {
      db.execute(
        `INSERT INTO tasks (id, project_id, title, status, priority, type)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ["t1", projectId, "Original", "todo", "medium", "task"]
      );
    });

    it("should update task title", () => {
      const updated = taskRepo.update("t1", { title: "Updated" });

      expect(updated?.title).toBe("Updated");
    });

    it("should update task status", () => {
      const updated = taskRepo.update("t1", { status: "in_progress" });

      expect(updated?.status).toBe("in_progress");
    });

    it("should update task priority", () => {
      const updated = taskRepo.update("t1", { priority: "high" });

      expect(updated?.priority).toBe("high");
    });

    it("should update task estimate", () => {
      const updated = taskRepo.update("t1", { estimate_points: 5 });

      expect(updated?.estimate_points).toBe(5);
    });

    it("should update task assignee", () => {
      const updated = taskRepo.update("t1", { assignee: "john" });

      expect(updated?.assignee).toBe("john");
    });
  });

  describe("getByStatus", () => {
    beforeEach(() => {
      db.execute(
        `INSERT INTO tasks (id, project_id, title, status, priority, type)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ["t1", projectId, "Todo Task", "todo", "medium", "task"]
      );
      db.execute(
        `INSERT INTO tasks (id, project_id, title, status, priority, type)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ["t2", projectId, "In Progress Task", "in_progress", "medium", "task"]
      );
      db.execute(
        `INSERT INTO tasks (id, project_id, title, status, priority, type)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ["t3", projectId, "Done Task", "done", "medium", "task"]
      );
    });

    it("should group tasks by status", () => {
      const grouped = taskRepo.getByStatus(projectId);

      expect(grouped.todo).toHaveLength(1);
      expect(grouped.in_progress).toHaveLength(1);
      expect(grouped.done).toHaveLength(1);
      expect(grouped.blocked).toHaveLength(0);
    });
  });
});

describe("AnalyticsRepository", () => {
  let db: DatabaseManager;
  let eventStore: EventStore;
  let projectRepo: ProjectRepository;
  let sprintRepo: SprintRepository;
  let analyticsRepo: AnalyticsRepository;
  let projectId: string;

  beforeEach(() => {
    db = new DatabaseManager(":memory:");
    db.getDb().exec(TEST_SCHEMA);
    eventStore = new EventStore(":memory:", true);
    projectRepo = new ProjectRepository(db, eventStore);
    sprintRepo = new SprintRepository(db, eventStore);
    analyticsRepo = new AnalyticsRepository(db);

    const project = projectRepo.create("Test Project");
    projectId = project.id;
  });

  afterEach(() => {
    db.close();
    eventStore.close();
  });

  describe("calculateVelocity", () => {
    it("should return zero for no history", () => {
      const velocity = analyticsRepo.calculateVelocity(projectId);

      expect(velocity.average).toBe(0);
      expect(velocity.trend).toHaveLength(0);
      expect(velocity.stdDev).toBe(0);
    });

    it("should calculate average velocity", () => {
      // Create sprints with velocity history
      const sprint1 = sprintRepo.create(projectId, "Sprint 1", "2025-01-01", "2025-01-14");
      const sprint2 = sprintRepo.create(projectId, "Sprint 2", "2025-01-15", "2025-01-28");

      db.execute(
        `INSERT INTO velocity_history (project_id, sprint_id, committed_points, completed_points, completion_rate)
         VALUES (?, ?, ?, ?, ?)`,
        [projectId, sprint1.id, 20, 15, 0.75]
      );
      db.execute(
        `INSERT INTO velocity_history (project_id, sprint_id, committed_points, completed_points, completion_rate)
         VALUES (?, ?, ?, ?, ?)`,
        [projectId, sprint2.id, 20, 20, 1.0]
      );

      const velocity = analyticsRepo.calculateVelocity(projectId, 2);

      expect(velocity.average).toBe(17.5);
      expect(velocity.trend).toHaveLength(2);
    });

    it("should calculate standard deviation", () => {
      const sprint1 = sprintRepo.create(projectId, "Sprint 1", "2025-01-01", "2025-01-14");
      const sprint2 = sprintRepo.create(projectId, "Sprint 2", "2025-01-15", "2025-01-28");
      const sprint3 = sprintRepo.create(projectId, "Sprint 3", "2025-01-29", "2025-02-11");

      // Consistent velocity
      db.execute(
        `INSERT INTO velocity_history (project_id, sprint_id, committed_points, completed_points, completion_rate)
         VALUES (?, ?, ?, ?, ?)`,
        [projectId, sprint1.id, 20, 20, 1.0]
      );
      db.execute(
        `INSERT INTO velocity_history (project_id, sprint_id, committed_points, completed_points, completion_rate)
         VALUES (?, ?, ?, ?, ?)`,
        [projectId, sprint2.id, 20, 20, 1.0]
      );
      db.execute(
        `INSERT INTO velocity_history (project_id, sprint_id, committed_points, completed_points, completion_rate)
         VALUES (?, ?, ?, ?, ?)`,
        [projectId, sprint3.id, 20, 20, 1.0]
      );

      const velocity = analyticsRepo.calculateVelocity(projectId, 3);

      expect(velocity.stdDev).toBe(0);
    });
  });

  describe("getBurndownData", () => {
    it("should return empty for non-existent sprint", () => {
      const burndown = analyticsRepo.getBurndownData("non-existent");

      expect(burndown).toHaveLength(0);
    });

    it("should generate burndown points for sprint", () => {
      const sprint = sprintRepo.create(projectId, "Sprint 1", "2025-01-01", "2025-01-07");

      // Add tasks
      db.execute(
        `INSERT INTO tasks (id, project_id, sprint_id, title, status, estimate_points)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ["t1", projectId, sprint.id, "Task 1", "todo", 5]
      );
      db.execute(
        `INSERT INTO tasks (id, project_id, sprint_id, title, status, estimate_points)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ["t2", projectId, sprint.id, "Task 2", "todo", 3]
      );

      const burndown = analyticsRepo.getBurndownData(sprint.id);

      expect(burndown.length).toBeGreaterThan(0);
      expect(burndown[0].remaining_points).toBe(8);
      expect(burndown[0].ideal_points).toBe(8);
    });

    it("should track completion progress", () => {
      const sprint = sprintRepo.create(projectId, "Sprint 1", "2025-01-01", "2025-01-07");

      db.execute(
        `INSERT INTO tasks (id, project_id, sprint_id, title, status, estimate_points, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ["t1", projectId, sprint.id, "Task 1", "done", 5, "2025-01-02T10:00:00Z"]
      );
      db.execute(
        `INSERT INTO tasks (id, project_id, sprint_id, title, status, estimate_points)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ["t2", projectId, sprint.id, "Task 2", "todo", 3]
      );

      const burndown = analyticsRepo.getBurndownData(sprint.id);

      // Day 0: 8 points remaining
      expect(burndown[0].remaining_points).toBe(8);
      // Day 1 (after completion): 3 points remaining
      expect(burndown[1].remaining_points).toBe(3);
    });
  });
});
