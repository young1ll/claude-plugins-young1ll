/**
 * PM Plugin Projection Repositories
 *
 * CQRS Read Models for tasks, sprints, and projects.
 * Provides optimized queries for MCP tools.
 */

import { DatabaseManager } from "./db.js";
import { EventStore, taskReducer, createSprintEvent, createProjectEvent } from "../../storage/lib/events.js";
import { randomUUID } from "crypto";

// ============================================
// Interfaces
// ============================================

export interface Project {
  id: string;
  name: string;
  description?: string;
  status: string;
  settings?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Sprint {
  id: string;
  project_id: string;
  name: string;
  goal?: string;
  start_date: string;
  end_date: string;
  status: string;
  velocity_committed: number;
  velocity_completed: number;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  sprint_id?: string;
  parent_id?: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  type: string;
  estimate_points?: number;
  estimate_hours?: number;
  actual_hours?: number;
  assignee?: string;
  labels?: string;
  due_date?: string;
  blocked_by?: string;
  branch_name?: string;
  linked_commits?: string;
  linked_prs?: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface TaskFilter {
  projectId?: string;
  sprintId?: string;
  status?: string;
  assignee?: string;
  type?: string;
  priority?: string;
  limit?: number;
  offset?: number;
}

export interface VelocityData {
  sprint_id: string;
  sprint_name: string;
  committed_points: number;
  completed_points: number;
  completion_rate: number;
}

export interface BurndownPoint {
  date: string;
  remaining_points: number;
  ideal_points: number;
}

// ============================================
// Project Repository
// ============================================

export class ProjectRepository {
  constructor(private db: DatabaseManager, private eventStore: EventStore) {}

  create(name: string, description?: string, settings?: Record<string, unknown>): Project {
    const id = randomUUID();

    // Create event
    createProjectEvent(this.eventStore, "ProjectCreated", id, {
      name,
      description,
      settings,
    });

    // Update projection
    this.db.execute(
      `INSERT INTO projects (id, name, description, settings, status)
       VALUES (?, ?, ?, ?, 'active')`,
      [id, name, description || null, settings ? JSON.stringify(settings) : null]
    );

    return this.getById(id)!;
  }

  getById(id: string): Project | undefined {
    return this.db.queryOne<Project>(
      `SELECT * FROM projects WHERE id = ?`,
      [id]
    );
  }

  list(): Project[] {
    return this.db.query<Project>(
      `SELECT * FROM projects WHERE status = 'active' ORDER BY created_at DESC`
    );
  }

  update(id: string, updates: Partial<Project>): Project | undefined {
    const sets: string[] = [];
    const values: unknown[] = [];

    if (updates.name !== undefined) {
      sets.push("name = ?");
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      sets.push("description = ?");
      values.push(updates.description);
    }
    if (updates.settings !== undefined) {
      sets.push("settings = ?");
      values.push(JSON.stringify(updates.settings));
    }
    if (updates.status !== undefined) {
      sets.push("status = ?");
      values.push(updates.status);
    }

    if (sets.length === 0) return this.getById(id);

    values.push(id);
    this.db.execute(
      `UPDATE projects SET ${sets.join(", ")} WHERE id = ?`,
      values
    );

    return this.getById(id);
  }
}

// ============================================
// Sprint Repository
// ============================================

export class SprintRepository {
  constructor(private db: DatabaseManager, private eventStore: EventStore) {}

  create(
    projectId: string,
    name: string,
    startDate: string,
    endDate: string,
    goal?: string
  ): Sprint {
    const id = randomUUID();

    // Create event
    createSprintEvent(this.eventStore, "SprintCreated", id, {
      projectId,
      name,
      startDate,
      endDate,
      goal,
    });

    // Update projection
    this.db.execute(
      `INSERT INTO sprints (id, project_id, name, goal, start_date, end_date, status)
       VALUES (?, ?, ?, ?, ?, ?, 'planning')`,
      [id, projectId, name, goal || null, startDate, endDate]
    );

    return this.getById(id)!;
  }

  getById(id: string): Sprint | undefined {
    return this.db.queryOne<Sprint>(
      `SELECT * FROM sprints WHERE id = ?`,
      [id]
    );
  }

  getActive(projectId: string): Sprint | undefined {
    return this.db.queryOne<Sprint>(
      `SELECT * FROM sprints WHERE project_id = ? AND status = 'active'`,
      [projectId]
    );
  }

  list(projectId: string): Sprint[] {
    return this.db.query<Sprint>(
      `SELECT * FROM sprints WHERE project_id = ? ORDER BY start_date DESC`,
      [projectId]
    );
  }

  getStatus(sprintId: string): {
    sprint: Sprint;
    tasks: Task[];
    totalPoints: number;
    completedPoints: number;
    progressPct: number;
  } | undefined {
    const sprint = this.getById(sprintId);
    if (!sprint) return undefined;

    const tasks = this.db.query<Task>(
      `SELECT * FROM tasks WHERE sprint_id = ?`,
      [sprintId]
    );

    const totalPoints = tasks.reduce((sum, t) => sum + (t.estimate_points || 0), 0);
    const completedPoints = tasks
      .filter(t => t.status === "done")
      .reduce((sum, t) => sum + (t.estimate_points || 0), 0);
    const progressPct = totalPoints > 0 ? Math.round((completedPoints / totalPoints) * 100) : 0;

    return {
      sprint,
      tasks,
      totalPoints,
      completedPoints,
      progressPct,
    };
  }

  start(sprintId: string): Sprint | undefined {
    createSprintEvent(this.eventStore, "SprintStarted", sprintId, {
      startedAt: new Date().toISOString(),
    });

    this.db.execute(
      `UPDATE sprints SET status = 'active' WHERE id = ?`,
      [sprintId]
    );

    return this.getById(sprintId);
  }

  complete(sprintId: string): Sprint | undefined {
    const status = this.getStatus(sprintId);
    if (!status) return undefined;

    createSprintEvent(this.eventStore, "SprintCompleted", sprintId, {
      completedAt: new Date().toISOString(),
      totalPoints: status.totalPoints,
      completedPoints: status.completedPoints,
    });

    // Update sprint
    this.db.execute(
      `UPDATE sprints SET status = 'completed',
       velocity_committed = ?, velocity_completed = ?
       WHERE id = ?`,
      [status.totalPoints, status.completedPoints, sprintId]
    );

    // Record velocity history
    const sprint = this.getById(sprintId)!;
    this.db.execute(
      `INSERT INTO velocity_history
       (project_id, sprint_id, committed_points, completed_points, completion_rate)
       VALUES (?, ?, ?, ?, ?)`,
      [
        sprint.project_id,
        sprintId,
        status.totalPoints,
        status.completedPoints,
        status.totalPoints > 0 ? status.completedPoints / status.totalPoints : 0,
      ]
    );

    return this.getById(sprintId);
  }

  addTasks(sprintId: string, taskIds: string[]): void {
    const stmt = this.db.getDb().prepare(
      `UPDATE tasks SET sprint_id = ? WHERE id = ?`
    );

    this.db.transaction(() => {
      for (const taskId of taskIds) {
        stmt.run(sprintId, taskId);
      }
    });
  }
}

// ============================================
// Task Repository
// ============================================

export class TaskRepository {
  constructor(private db: DatabaseManager, private eventStore: EventStore) {}

  /**
   * Sync task projection from event store
   */
  syncFromEvents(taskId: string): Task | undefined {
    const projection = this.eventStore.replay("task", taskId, taskReducer);
    if (!projection) return undefined;

    // Upsert projection
    this.db.execute(
      `INSERT OR REPLACE INTO tasks
       (id, project_id, sprint_id, parent_id, title, description, status, priority, type,
        estimate_points, estimate_hours, actual_hours, assignee, labels, due_date,
        blocked_by, branch_name, linked_commits, linked_prs, created_at, updated_at,
        started_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        projection.id,
        projection.projectId,
        projection.sprintId || null,
        projection.parentId || null,
        projection.title,
        projection.description || null,
        projection.status,
        projection.priority,
        projection.type,
        projection.estimatePoints || null,
        projection.estimateHours || null,
        projection.actualHours || null,
        projection.assignee || null,
        projection.labels ? JSON.stringify(projection.labels) : null,
        projection.dueDate || null,
        projection.blockedBy || null,
        projection.branchName || null,
        projection.linkedCommits ? JSON.stringify(projection.linkedCommits) : null,
        projection.linkedPRs ? JSON.stringify(projection.linkedPRs) : null,
        projection.createdAt,
        projection.updatedAt,
        projection.startedAt || null,
        projection.completedAt || null,
      ]
    );

    return this.getById(taskId);
  }

  getById(id: string): Task | undefined {
    return this.db.queryOne<Task>(
      `SELECT * FROM tasks WHERE id = ?`,
      [id]
    );
  }

  list(filter: TaskFilter = {}): Task[] {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filter.projectId) {
      conditions.push("project_id = ?");
      values.push(filter.projectId);
    }
    if (filter.sprintId) {
      conditions.push("sprint_id = ?");
      values.push(filter.sprintId);
    }
    if (filter.status) {
      conditions.push("status = ?");
      values.push(filter.status);
    }
    if (filter.assignee) {
      conditions.push("assignee = ?");
      values.push(filter.assignee);
    }
    if (filter.type) {
      conditions.push("type = ?");
      values.push(filter.type);
    }
    if (filter.priority) {
      conditions.push("priority = ?");
      values.push(filter.priority);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filter.limit || 50;
    const offset = filter.offset || 0;

    return this.db.query<Task>(
      `SELECT * FROM tasks ${whereClause}
       ORDER BY
         CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 END,
         created_at DESC
       LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );
  }

  update(taskId: string, updates: Partial<Task>): Task | undefined {
    const sets: string[] = [];
    const values: unknown[] = [];

    const fieldMap: Record<string, string> = {
      title: "title",
      description: "description",
      status: "status",
      priority: "priority",
      type: "type",
      estimate_points: "estimate_points",
      estimate_hours: "estimate_hours",
      actual_hours: "actual_hours",
      assignee: "assignee",
      due_date: "due_date",
      sprint_id: "sprint_id",
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if ((updates as any)[key] !== undefined) {
        sets.push(`${column} = ?`);
        values.push((updates as any)[key]);
      }
    }

    if (sets.length === 0) return this.getById(taskId);

    values.push(taskId);
    this.db.execute(
      `UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`,
      values
    );

    return this.getById(taskId);
  }

  /**
   * Get tasks by status for board view
   */
  getByStatus(projectId: string, sprintId?: string): Record<string, Task[]> {
    const filter: TaskFilter = { projectId };
    if (sprintId) filter.sprintId = sprintId;

    const tasks = this.list(filter);
    const grouped: Record<string, Task[]> = {
      todo: [],
      in_progress: [],
      in_review: [],
      done: [],
      blocked: [],
    };

    for (const task of tasks) {
      if (grouped[task.status]) {
        grouped[task.status].push(task);
      }
    }

    return grouped;
  }
}

// ============================================
// Analytics Repository
// ============================================

export class AnalyticsRepository {
  constructor(private db: DatabaseManager) {}

  /**
   * Calculate velocity for a project
   */
  calculateVelocity(projectId: string, sprintCount = 3): {
    average: number;
    trend: VelocityData[];
    stdDev: number;
  } {
    const history = this.db.query<VelocityData>(
      `SELECT vh.sprint_id, s.name as sprint_name,
              vh.committed_points, vh.completed_points, vh.completion_rate
       FROM velocity_history vh
       JOIN sprints s ON vh.sprint_id = s.id
       WHERE vh.project_id = ?
       ORDER BY vh.recorded_at DESC
       LIMIT ?`,
      [projectId, sprintCount]
    );

    if (history.length === 0) {
      return { average: 0, trend: [], stdDev: 0 };
    }

    const completedPoints = history.map(h => h.completed_points);
    const average = completedPoints.reduce((a, b) => a + b, 0) / completedPoints.length;

    const variance = completedPoints.reduce((sum, val) => {
      return sum + Math.pow(val - average, 2);
    }, 0) / completedPoints.length;
    const stdDev = Math.sqrt(variance);

    return {
      average: Math.round(average * 10) / 10,
      trend: history,
      stdDev: Math.round(stdDev * 10) / 10,
    };
  }

  /**
   * Get burndown data for a sprint
   */
  getBurndownData(sprintId: string): BurndownPoint[] {
    const sprint = this.db.queryOne<Sprint>(
      `SELECT * FROM sprints WHERE id = ?`,
      [sprintId]
    );
    if (!sprint) return [];

    const tasks = this.db.query<Task>(
      `SELECT * FROM tasks WHERE sprint_id = ?`,
      [sprintId]
    );

    const totalPoints = tasks.reduce((sum, t) => sum + (t.estimate_points || 0), 0);

    // Get completion events
    const completionEvents = this.db.query<{ completed_at: string; estimate_points: number }>(
      `SELECT completed_at, estimate_points FROM tasks
       WHERE sprint_id = ? AND status = 'done' AND completed_at IS NOT NULL
       ORDER BY completed_at`,
      [sprintId]
    );

    // Build burndown
    const startDate = new Date(sprint.start_date);
    const endDate = new Date(sprint.end_date);
    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    const burndown: BurndownPoint[] = [];
    let remaining = totalPoints;
    let eventIndex = 0;

    for (let day = 0; day <= totalDays; day++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + day);
      const dateStr = currentDate.toISOString().split("T")[0];

      // Process completions for this day
      while (
        eventIndex < completionEvents.length &&
        completionEvents[eventIndex].completed_at.startsWith(dateStr)
      ) {
        remaining -= completionEvents[eventIndex].estimate_points || 0;
        eventIndex++;
      }

      burndown.push({
        date: dateStr,
        remaining_points: Math.max(0, remaining),
        ideal_points: Math.round(totalPoints * (1 - day / totalDays)),
      });
    }

    return burndown;
  }
}
