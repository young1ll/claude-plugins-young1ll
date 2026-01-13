/**
 * Event Sourcing Unit Tests
 *
 * Tests for EventStore and event reducers.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  EventStore,
  taskReducer,
  createTaskEvent,
  createSprintEvent,
  createProjectEvent,
  type BaseEvent,
  type TaskProjection,
} from "../../storage/lib/events.js";

describe("EventStore", () => {
  let eventStore: EventStore;

  beforeEach(() => {
    // Create EventStore with in-memory DB and auto-initialize schema
    eventStore = new EventStore(":memory:", true);
  });

  afterEach(() => {
    eventStore.close();
  });

  describe("append", () => {
    it("should append a new event", () => {
      const event = eventStore.append(
        "TaskCreated",
        "task",
        "task-1",
        { title: "Test Task", projectId: "proj-1" }
      );

      expect(event.eventId).toBeDefined();
      expect(event.eventType).toBe("TaskCreated");
      expect(event.aggregateType).toBe("task");
      expect(event.aggregateId).toBe("task-1");
      expect(event.payload).toEqual({ title: "Test Task", projectId: "proj-1" });
      expect(event.version).toBe(1);
    });

    it("should increment version for same aggregate", () => {
      const event1 = eventStore.append(
        "TaskCreated",
        "task",
        "task-1",
        { title: "Test Task", projectId: "proj-1" }
      );
      const event2 = eventStore.append(
        "TaskUpdated",
        "task",
        "task-1",
        { title: "Updated Task" }
      );

      expect(event1.version).toBe(1);
      expect(event2.version).toBe(2);
    });

    it("should store metadata", () => {
      const event = eventStore.append(
        "TaskCreated",
        "task",
        "task-1",
        { title: "Test Task", projectId: "proj-1" },
        { userId: "user-1", source: "cli" }
      );

      expect(event.metadata).toEqual({ userId: "user-1", source: "cli" });
    });
  });

  describe("getEvents", () => {
    beforeEach(() => {
      eventStore.append("TaskCreated", "task", "task-1", {
        title: "Task 1",
        projectId: "proj-1",
      });
      eventStore.append("TaskStatusChanged", "task", "task-1", {
        from: "todo",
        to: "in_progress",
      });
      eventStore.append("TaskCreated", "task", "task-2", {
        title: "Task 2",
        projectId: "proj-1",
      });
    });

    it("should get all events for an aggregate", () => {
      const events = eventStore.getEvents("task", "task-1");

      expect(events).toHaveLength(2);
      expect(events[0].eventType).toBe("TaskCreated");
      expect(events[1].eventType).toBe("TaskStatusChanged");
    });

    it("should get events from specific version", () => {
      const events = eventStore.getEvents("task", "task-1", 1);

      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe("TaskStatusChanged");
    });

    it("should return empty array for non-existent aggregate", () => {
      const events = eventStore.getEvents("task", "non-existent");

      expect(events).toHaveLength(0);
    });
  });

  describe("getEventsByType", () => {
    beforeEach(() => {
      eventStore.append("TaskCreated", "task", "task-1", {
        title: "Task 1",
        projectId: "proj-1",
      });
      eventStore.append("TaskCreated", "task", "task-2", {
        title: "Task 2",
        projectId: "proj-1",
      });
      eventStore.append("TaskStatusChanged", "task", "task-1", {
        from: "todo",
        to: "in_progress",
      });
    });

    it("should get all events of a specific type", () => {
      const events = eventStore.getEventsByType("TaskCreated");

      expect(events).toHaveLength(2);
      expect(events.every((e) => e.eventType === "TaskCreated")).toBe(true);
    });

    it("should respect limit parameter", () => {
      const events = eventStore.getEventsByType("TaskCreated", 1);

      expect(events).toHaveLength(1);
    });
  });

  describe("getEventsInRange", () => {
    it("should get events in time range", () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      eventStore.append("TaskCreated", "task", "task-1", {
        title: "Task 1",
        projectId: "proj-1",
      });

      const events = eventStore.getEventsInRange(
        yesterday.toISOString(),
        tomorrow.toISOString()
      );

      expect(events.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("replay", () => {
    it("should replay events to rebuild projection", () => {
      eventStore.append("TaskCreated", "task", "task-1", {
        title: "Test Task",
        projectId: "proj-1",
      });
      eventStore.append("TaskStatusChanged", "task", "task-1", {
        from: "todo",
        to: "in_progress",
      });
      eventStore.append("TaskEstimated", "task", "task-1", {
        points: 5,
      });

      const projection = eventStore.replay<TaskProjection>(
        "task",
        "task-1",
        taskReducer
      );

      expect(projection).not.toBeNull();
      expect(projection!.title).toBe("Test Task");
      expect(projection!.status).toBe("in_progress");
      expect(projection!.estimatePoints).toBe(5);
    });
  });
});

describe("taskReducer", () => {
  describe("TaskCreated", () => {
    it("should create initial task projection", () => {
      const event: BaseEvent = {
        eventId: "evt-1",
        eventType: "TaskCreated",
        aggregateType: "task",
        aggregateId: "task-1",
        payload: {
          title: "Test Task",
          description: "A test task",
          projectId: "proj-1",
          type: "story",
          priority: "high",
        },
        createdAt: "2025-01-01T00:00:00Z",
        version: 1,
      };

      const result = taskReducer(null, event);

      expect(result.id).toBe("task-1");
      expect(result.title).toBe("Test Task");
      expect(result.description).toBe("A test task");
      expect(result.projectId).toBe("proj-1");
      expect(result.type).toBe("story");
      expect(result.priority).toBe("high");
      expect(result.status).toBe("todo");
      expect(result.linkedCommits).toEqual([]);
      expect(result.linkedPRs).toEqual([]);
    });

    it("should use default values for optional fields", () => {
      const event: BaseEvent = {
        eventId: "evt-1",
        eventType: "TaskCreated",
        aggregateType: "task",
        aggregateId: "task-1",
        payload: {
          title: "Simple Task",
          projectId: "proj-1",
        },
        createdAt: "2025-01-01T00:00:00Z",
        version: 1,
      };

      const result = taskReducer(null, event);

      expect(result.priority).toBe("medium");
      expect(result.type).toBe("task");
    });
  });

  describe("TaskStatusChanged", () => {
    it("should update status", () => {
      const initialState: TaskProjection = {
        id: "task-1",
        projectId: "proj-1",
        title: "Test Task",
        status: "todo",
        priority: "medium",
        type: "task",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      };

      const event: BaseEvent = {
        eventId: "evt-2",
        eventType: "TaskStatusChanged",
        aggregateType: "task",
        aggregateId: "task-1",
        payload: { from: "todo", to: "in_progress" },
        createdAt: "2025-01-02T00:00:00Z",
        version: 2,
      };

      const result = taskReducer(initialState, event);

      expect(result.status).toBe("in_progress");
      expect(result.startedAt).toBe("2025-01-02T00:00:00Z");
    });

    it("should set completedAt when done", () => {
      const initialState: TaskProjection = {
        id: "task-1",
        projectId: "proj-1",
        title: "Test Task",
        status: "in_progress",
        priority: "medium",
        type: "task",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
        startedAt: "2025-01-02T00:00:00Z",
      };

      const event: BaseEvent = {
        eventId: "evt-3",
        eventType: "TaskStatusChanged",
        aggregateType: "task",
        aggregateId: "task-1",
        payload: { from: "in_progress", to: "done" },
        createdAt: "2025-01-03T00:00:00Z",
        version: 3,
      };

      const result = taskReducer(initialState, event);

      expect(result.status).toBe("done");
      expect(result.completedAt).toBe("2025-01-03T00:00:00Z");
    });
  });

  describe("TaskEstimated", () => {
    it("should update estimates", () => {
      const initialState: TaskProjection = {
        id: "task-1",
        projectId: "proj-1",
        title: "Test Task",
        status: "todo",
        priority: "medium",
        type: "task",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      };

      const event: BaseEvent = {
        eventId: "evt-2",
        eventType: "TaskEstimated",
        aggregateType: "task",
        aggregateId: "task-1",
        payload: { points: 5, hours: 8 },
        createdAt: "2025-01-02T00:00:00Z",
        version: 2,
      };

      const result = taskReducer(initialState, event);

      expect(result.estimatePoints).toBe(5);
      expect(result.estimateHours).toBe(8);
    });
  });

  describe("TaskAssigned", () => {
    it("should update assignee", () => {
      const initialState: TaskProjection = {
        id: "task-1",
        projectId: "proj-1",
        title: "Test Task",
        status: "todo",
        priority: "medium",
        type: "task",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      };

      const event: BaseEvent = {
        eventId: "evt-2",
        eventType: "TaskAssigned",
        aggregateType: "task",
        aggregateId: "task-1",
        payload: { assignee: "john@example.com" },
        createdAt: "2025-01-02T00:00:00Z",
        version: 2,
      };

      const result = taskReducer(initialState, event);

      expect(result.assignee).toBe("john@example.com");
    });
  });

  describe("TaskAddedToSprint", () => {
    it("should set sprint ID", () => {
      const initialState: TaskProjection = {
        id: "task-1",
        projectId: "proj-1",
        title: "Test Task",
        status: "todo",
        priority: "medium",
        type: "task",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      };

      const event: BaseEvent = {
        eventId: "evt-2",
        eventType: "TaskAddedToSprint",
        aggregateType: "task",
        aggregateId: "task-1",
        payload: { sprintId: "sprint-1" },
        createdAt: "2025-01-02T00:00:00Z",
        version: 2,
      };

      const result = taskReducer(initialState, event);

      expect(result.sprintId).toBe("sprint-1");
    });
  });

  describe("TaskRemovedFromSprint", () => {
    it("should clear sprint ID", () => {
      const initialState: TaskProjection = {
        id: "task-1",
        projectId: "proj-1",
        sprintId: "sprint-1",
        title: "Test Task",
        status: "todo",
        priority: "medium",
        type: "task",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      };

      const event: BaseEvent = {
        eventId: "evt-2",
        eventType: "TaskRemovedFromSprint",
        aggregateType: "task",
        aggregateId: "task-1",
        payload: {},
        createdAt: "2025-01-02T00:00:00Z",
        version: 2,
      };

      const result = taskReducer(initialState, event);

      expect(result.sprintId).toBeUndefined();
    });
  });

  describe("TaskLinkedToCommit", () => {
    it("should add commit SHA to linked commits", () => {
      const initialState: TaskProjection = {
        id: "task-1",
        projectId: "proj-1",
        title: "Test Task",
        status: "in_progress",
        priority: "medium",
        type: "task",
        linkedCommits: [],
        linkedPRs: [],
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      };

      const event: BaseEvent = {
        eventId: "evt-2",
        eventType: "TaskLinkedToCommit",
        aggregateType: "task",
        aggregateId: "task-1",
        payload: {
          commitSha: "abc123",
          branch: "42-feat-new-feature",
          message: "feat: add new feature fixes #42",
        },
        createdAt: "2025-01-02T00:00:00Z",
        version: 2,
      };

      const result = taskReducer(initialState, event);

      expect(result.linkedCommits).toContain("abc123");
      expect(result.branchName).toBe("42-feat-new-feature");
    });
  });

  describe("TaskBlocked", () => {
    it("should set blocked status and reason", () => {
      const initialState: TaskProjection = {
        id: "task-1",
        projectId: "proj-1",
        title: "Test Task",
        status: "in_progress",
        priority: "medium",
        type: "task",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      };

      const event: BaseEvent = {
        eventId: "evt-2",
        eventType: "TaskBlocked",
        aggregateType: "task",
        aggregateId: "task-1",
        payload: { reason: "Waiting for API spec" },
        createdAt: "2025-01-02T00:00:00Z",
        version: 2,
      };

      const result = taskReducer(initialState, event);

      expect(result.status).toBe("blocked");
      expect(result.blockedBy).toBe("Waiting for API spec");
    });
  });

  describe("TaskUnblocked", () => {
    it("should restore previous status", () => {
      const initialState: TaskProjection = {
        id: "task-1",
        projectId: "proj-1",
        title: "Test Task",
        status: "blocked",
        blockedBy: "Waiting for API spec",
        priority: "medium",
        type: "task",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      };

      const event: BaseEvent = {
        eventId: "evt-2",
        eventType: "TaskUnblocked",
        aggregateType: "task",
        aggregateId: "task-1",
        payload: { previousStatus: "in_progress" },
        createdAt: "2025-01-02T00:00:00Z",
        version: 2,
      };

      const result = taskReducer(initialState, event);

      expect(result.status).toBe("in_progress");
      expect(result.blockedBy).toBeUndefined();
    });
  });

  describe("TaskCompleted", () => {
    it("should set done status and actual hours", () => {
      const initialState: TaskProjection = {
        id: "task-1",
        projectId: "proj-1",
        title: "Test Task",
        status: "in_progress",
        priority: "medium",
        type: "task",
        estimateHours: 8,
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
        startedAt: "2025-01-02T00:00:00Z",
      };

      const event: BaseEvent = {
        eventId: "evt-2",
        eventType: "TaskCompleted",
        aggregateType: "task",
        aggregateId: "task-1",
        payload: { actualHours: 6 },
        createdAt: "2025-01-03T00:00:00Z",
        version: 2,
      };

      const result = taskReducer(initialState, event);

      expect(result.status).toBe("done");
      expect(result.actualHours).toBe(6);
      expect(result.completedAt).toBe("2025-01-03T00:00:00Z");
    });
  });
});

describe("Event Helper Functions", () => {
  let eventStore: EventStore;

  beforeEach(() => {
    eventStore = new EventStore(":memory:", true);
  });

  afterEach(() => {
    eventStore.close();
  });

  describe("createTaskEvent", () => {
    it("should create task event with correct aggregate type", () => {
      const event = createTaskEvent(
        eventStore,
        "TaskCreated",
        "task-1",
        { title: "Test", projectId: "proj-1" }
      );

      expect(event.aggregateType).toBe("task");
      expect(event.eventType).toBe("TaskCreated");
    });
  });

  describe("createSprintEvent", () => {
    it("should create sprint event with correct aggregate type", () => {
      const event = createSprintEvent(
        eventStore,
        "SprintCreated",
        "sprint-1",
        { name: "Sprint 1", projectId: "proj-1" }
      );

      expect(event.aggregateType).toBe("sprint");
      expect(event.eventType).toBe("SprintCreated");
    });
  });

  describe("createProjectEvent", () => {
    it("should create project event with correct aggregate type", () => {
      const event = createProjectEvent(
        eventStore,
        "ProjectCreated",
        "proj-1",
        { name: "My Project" }
      );

      expect(event.aggregateType).toBe("project");
      expect(event.eventType).toBe("ProjectCreated");
    });
  });
});
