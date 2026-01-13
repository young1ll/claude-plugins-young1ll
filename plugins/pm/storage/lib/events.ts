/**
 * PM Plugin Event Sourcing Library
 *
 * Implements event sourcing pattern with:
 * - Append-only event store
 * - Event replay for projections
 * - Optimistic concurrency control
 */

import Database from "better-sqlite3";
import { randomUUID } from "crypto";

// ============================================
// Event Types
// ============================================

export type TaskEventType =
  | "TaskCreated"
  | "TaskUpdated"
  | "TaskStatusChanged"
  | "TaskEstimated"
  | "TaskAssigned"
  | "TaskAddedToSprint"
  | "TaskRemovedFromSprint"
  | "TaskLinkedToCommit"
  | "TaskLinkedToPR"
  | "TaskBlocked"
  | "TaskUnblocked"
  | "TaskCompleted"
  | "TaskDeleted";

export type SprintEventType =
  | "SprintCreated"
  | "SprintStarted"
  | "SprintCompleted"
  | "SprintCancelled"
  | "SprintGoalSet"
  | "SprintVelocityRecorded";

export type ProjectEventType =
  | "ProjectCreated"
  | "ProjectUpdated"
  | "ProjectArchived"
  | "ProjectSettingsChanged";

export type EventType = TaskEventType | SprintEventType | ProjectEventType;

export interface BaseEvent {
  eventId: string;
  eventType: EventType;
  aggregateType: "task" | "sprint" | "project";
  aggregateId: string;
  payload: Record<string, unknown>;
  metadata?: {
    userId?: string;
    source?: string;
    correlationId?: string;
    causationId?: string;
  };
  createdAt: string;
  version: number;
}

// ============================================
// Task Event Payloads
// ============================================

export interface TaskCreatedPayload {
  title: string;
  description?: string;
  projectId: string;
  type?: "epic" | "story" | "task" | "bug" | "subtask";
  priority?: "critical" | "high" | "medium" | "low";
  parentId?: string;
}

export interface TaskStatusChangedPayload {
  from: string;
  to: string;
  reason?: string;
}

export interface TaskEstimatedPayload {
  points?: number;
  hours?: number;
  confidence?: number; // 0-1
}

export interface TaskLinkedToCommitPayload {
  commitSha: string;
  repo?: string;
  branch?: string;
  message?: string;
}

// ============================================
// Event Store
// ============================================

export class EventStore {
  private db: Database.Database;

  /**
   * Create EventStore with a path or existing Database instance
   * @param dbPathOrInstance - Path to database file or existing Database instance
   * @param autoInit - Whether to initialize schema automatically
   */
  constructor(dbPathOrInstance: string | Database.Database, autoInit = false) {
    if (typeof dbPathOrInstance === "string") {
      this.db = new Database(dbPathOrInstance);
      this.db.pragma("journal_mode = WAL");
    } else {
      this.db = dbPathOrInstance;
    }
    if (autoInit) {
      this.initializeSchema();
    }
  }

  /**
   * Initialize the events table schema (for testing or first-time setup)
   */
  initializeSchema(): void {
    this.db.exec(`
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
      CREATE INDEX IF NOT EXISTS idx_events_aggregate ON events(aggregate_type, aggregate_id);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
      CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
    `);
  }

  /**
   * Append a new event to the store
   */
  append(
    eventType: EventType,
    aggregateType: BaseEvent["aggregateType"],
    aggregateId: string,
    payload: Record<string, unknown>,
    metadata?: BaseEvent["metadata"]
  ): BaseEvent {
    const event: BaseEvent = {
      eventId: randomUUID(),
      eventType,
      aggregateType,
      aggregateId,
      payload,
      metadata,
      createdAt: new Date().toISOString(),
      version: this.getNextVersion(aggregateType, aggregateId),
    };

    const stmt = this.db.prepare(`
      INSERT INTO events (event_id, event_type, aggregate_type, aggregate_id, payload, metadata, created_at, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      event.eventId,
      event.eventType,
      event.aggregateType,
      event.aggregateId,
      JSON.stringify(event.payload),
      event.metadata ? JSON.stringify(event.metadata) : null,
      event.createdAt,
      event.version
    );

    return event;
  }

  /**
   * Get all events for an aggregate
   */
  getEvents(
    aggregateType: string,
    aggregateId: string,
    fromVersion?: number
  ): BaseEvent[] {
    const stmt = this.db.prepare(`
      SELECT * FROM events
      WHERE aggregate_type = ? AND aggregate_id = ?
      ${fromVersion ? "AND version > ?" : ""}
      ORDER BY version ASC
    `);

    const rows = fromVersion
      ? stmt.all(aggregateType, aggregateId, fromVersion)
      : stmt.all(aggregateType, aggregateId);

    return (rows as any[]).map(this.rowToEvent);
  }

  /**
   * Get events by type
   */
  getEventsByType(eventType: EventType, limit = 100): BaseEvent[] {
    const stmt = this.db.prepare(`
      SELECT * FROM events
      WHERE event_type = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);

    return (stmt.all(eventType, limit) as any[]).map(this.rowToEvent);
  }

  /**
   * Get events in time range
   */
  getEventsInRange(startDate: string, endDate: string): BaseEvent[] {
    const stmt = this.db.prepare(`
      SELECT * FROM events
      WHERE created_at BETWEEN ? AND ?
      ORDER BY created_at ASC
    `);

    return (stmt.all(startDate, endDate) as any[]).map(this.rowToEvent);
  }

  /**
   * Replay events to rebuild projection
   */
  replay<T>(
    aggregateType: string,
    aggregateId: string,
    reducer: (state: T | null, event: BaseEvent) => T,
    initialState: T | null = null
  ): T | null {
    const events = this.getEvents(aggregateType, aggregateId);
    return events.reduce(reducer, initialState);
  }

  /**
   * Get next version for optimistic concurrency
   */
  private getNextVersion(aggregateType: string, aggregateId: string): number {
    const stmt = this.db.prepare(`
      SELECT MAX(version) as maxVersion FROM events
      WHERE aggregate_type = ? AND aggregate_id = ?
    `);

    const result = stmt.get(aggregateType, aggregateId) as {
      maxVersion: number | null;
    };
    return (result.maxVersion || 0) + 1;
  }

  private rowToEvent(row: any): BaseEvent {
    return {
      eventId: row.event_id,
      eventType: row.event_type as EventType,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      payload: JSON.parse(row.payload),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.created_at,
      version: row.version,
    };
  }

  close(): void {
    this.db.close();
  }
}

// ============================================
// Projection Builders
// ============================================

export interface TaskProjection {
  id: string;
  projectId: string;
  sprintId?: string;
  parentId?: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  type: string;
  estimatePoints?: number;
  estimateHours?: number;
  actualHours?: number;
  assignee?: string;
  labels?: string[];
  dueDate?: string;
  blockedBy?: string;
  branchName?: string;
  linkedCommits?: string[];
  linkedPRs?: number[];
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export function taskReducer(
  state: TaskProjection | null,
  event: BaseEvent
): TaskProjection {
  const payload = event.payload;

  switch (event.eventType) {
    case "TaskCreated":
      return {
        id: event.aggregateId,
        projectId: payload.projectId as string,
        title: payload.title as string,
        description: payload.description as string | undefined,
        status: "todo",
        priority: (payload.priority as string) || "medium",
        type: (payload.type as string) || "task",
        parentId: payload.parentId as string | undefined,
        linkedCommits: [],
        linkedPRs: [],
        createdAt: event.createdAt,
        updatedAt: event.createdAt,
      };

    case "TaskUpdated":
      return {
        ...state!,
        ...payload,
        updatedAt: event.createdAt,
      };

    case "TaskStatusChanged":
      const newState = {
        ...state!,
        status: payload.to as string,
        updatedAt: event.createdAt,
      };
      if (payload.to === "in_progress" && !state!.startedAt) {
        newState.startedAt = event.createdAt;
      }
      if (payload.to === "done") {
        newState.completedAt = event.createdAt;
      }
      return newState;

    case "TaskEstimated":
      return {
        ...state!,
        estimatePoints: payload.points as number | undefined,
        estimateHours: payload.hours as number | undefined,
        updatedAt: event.createdAt,
      };

    case "TaskAssigned":
      return {
        ...state!,
        assignee: payload.assignee as string,
        updatedAt: event.createdAt,
      };

    case "TaskAddedToSprint":
      return {
        ...state!,
        sprintId: payload.sprintId as string,
        updatedAt: event.createdAt,
      };

    case "TaskRemovedFromSprint":
      return {
        ...state!,
        sprintId: undefined,
        updatedAt: event.createdAt,
      };

    case "TaskLinkedToCommit":
      return {
        ...state!,
        linkedCommits: [
          ...(state!.linkedCommits || []),
          payload.commitSha as string,
        ],
        branchName: (payload.branch as string) || state!.branchName,
        updatedAt: event.createdAt,
      };

    case "TaskBlocked":
      return {
        ...state!,
        status: "blocked",
        blockedBy: payload.reason as string,
        updatedAt: event.createdAt,
      };

    case "TaskUnblocked":
      return {
        ...state!,
        status: payload.previousStatus as string || "todo",
        blockedBy: undefined,
        updatedAt: event.createdAt,
      };

    case "TaskCompleted":
      return {
        ...state!,
        status: "done",
        actualHours: payload.actualHours as number | undefined,
        completedAt: event.createdAt,
        updatedAt: event.createdAt,
      };

    default:
      return state!;
  }
}

// ============================================
// Event Helpers
// ============================================

export function createTaskEvent(
  eventStore: EventStore,
  eventType: TaskEventType,
  taskId: string,
  payload: Record<string, unknown>,
  metadata?: BaseEvent["metadata"]
): BaseEvent {
  return eventStore.append(eventType, "task", taskId, payload, metadata);
}

export function createSprintEvent(
  eventStore: EventStore,
  eventType: SprintEventType,
  sprintId: string,
  payload: Record<string, unknown>,
  metadata?: BaseEvent["metadata"]
): BaseEvent {
  return eventStore.append(eventType, "sprint", sprintId, payload, metadata);
}

export function createProjectEvent(
  eventStore: EventStore,
  eventType: ProjectEventType,
  projectId: string,
  payload: Record<string, unknown>,
  metadata?: BaseEvent["metadata"]
): BaseEvent {
  return eventStore.append(eventType, "project", projectId, payload, metadata);
}
