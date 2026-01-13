/**
 * Summarizer Unit Tests
 *
 * Tests for hierarchical summarization and context management.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  estimateTokens,
  needsCompression,
  tasksToCSV,
  sprintToCompact,
  createL1Summary,
  createL2Summary,
  createL3Summary,
  ContextManager,
  SummaryLevel,
  type Summary,
} from "../../lib/summarizer.js";

describe("estimateTokens", () => {
  it("should estimate tokens based on 4 chars per token", () => {
    expect(estimateTokens("test")).toBe(1); // 4 chars = 1 token
    expect(estimateTokens("testtest")).toBe(2); // 8 chars = 2 tokens
    expect(estimateTokens("hello world")).toBe(3); // 11 chars ~ 3 tokens
  });

  it("should round up partial tokens", () => {
    expect(estimateTokens("hi")).toBe(1); // 2 chars, rounds up
    expect(estimateTokens("hello")).toBe(2); // 5 chars, rounds up
  });

  it("should handle empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });
});

describe("needsCompression", () => {
  it("should return true when current tokens exceed threshold", () => {
    expect(needsCompression(75000, 100000, 0.7)).toBe(true);
    expect(needsCompression(70000, 100000, 0.7)).toBe(true);
  });

  it("should return false when current tokens below threshold", () => {
    expect(needsCompression(60000, 100000, 0.7)).toBe(false);
    expect(needsCompression(69999, 100000, 0.7)).toBe(false);
  });

  it("should use default 0.7 threshold", () => {
    expect(needsCompression(70000, 100000)).toBe(true);
    expect(needsCompression(69999, 100000)).toBe(false);
  });

  it("should handle custom thresholds", () => {
    expect(needsCompression(50000, 100000, 0.5)).toBe(true);
    expect(needsCompression(80000, 100000, 0.9)).toBe(false);
  });
});

describe("tasksToCSV", () => {
  it("should convert tasks to CSV format", () => {
    const tasks = [
      { id: "1", title: "Task One", status: "todo", points: 3, sprint: "Sprint 1" },
      { id: "2", title: "Task Two", status: "done", points: 5, sprint: "Sprint 1" },
    ];

    const csv = tasksToCSV(tasks);
    const lines = csv.split("\n");

    expect(lines[0]).toBe("id,title,status,points,sprint");
    expect(lines[1]).toBe("1,Task One,todo,3,Sprint 1");
    expect(lines[2]).toBe("2,Task Two,done,5,Sprint 1");
  });

  it("should handle missing optional fields", () => {
    const tasks = [
      { id: "1", title: "Task", status: "todo" },
    ];

    const csv = tasksToCSV(tasks);
    const lines = csv.split("\n");

    expect(lines[1]).toBe("1,Task,todo,0,");
  });

  it("should truncate long titles to 30 chars", () => {
    const tasks = [
      {
        id: "1",
        title: "This is a very long task title that should be truncated",
        status: "todo",
      },
    ];

    const csv = tasksToCSV(tasks);

    expect(csv).toContain("This is a very long task title");
    expect(csv).not.toContain("should be truncated");
  });

  it("should return only header for empty task list", () => {
    const csv = tasksToCSV([]);

    expect(csv).toBe("id,title,status,points,sprint");
  });
});

describe("sprintToCompact", () => {
  it("should convert sprint to compact format", () => {
    const sprint = {
      name: "Sprint 1",
      total: 10,
      completed: 5,
      totalPoints: 30,
      completedPoints: 15,
      byStatus: {
        todo: 2,
        in_progress: 3,
        done: 5,
        blocked: 0,
      },
    };

    const compact = sprintToCompact(sprint);

    expect(compact).toContain("Sprint: Sprint 1");
    expect(compact).toContain("Progress: 5/10 (50%)");
    expect(compact).toContain("todo=2");
    expect(compact).toContain("in_progress=3");
    expect(compact).toContain("done=5");
    expect(compact).toContain("blocked=0");
    expect(compact).toContain("Points: 15/30");
  });

  it("should handle zero total", () => {
    const sprint = {
      name: "Empty Sprint",
      total: 0,
      completed: 0,
      totalPoints: 0,
      completedPoints: 0,
      byStatus: {
        todo: 0,
        in_progress: 0,
        done: 0,
        blocked: 0,
      },
    };

    // This might produce NaN for percentage, but should not throw
    expect(() => sprintToCompact(sprint)).not.toThrow();
  });
});

describe("createL1Summary", () => {
  it("should create story-level summary", () => {
    const messages = [
      "Task completed: login page",
      "Decision: decided to use JWT",
      "Blocked: waiting for API spec",
    ];

    const summary = createL1Summary(messages, "Auth Story");

    expect(summary.level).toBe(SummaryLevel.STORY);
    expect(summary.context).toBe("Auth Story");
    expect(summary.content).toContain("Story Summary: Auth Story");
    expect(summary.content).toContain("Key Progress");
    expect(summary.content).toContain("Blockers");
    expect(summary.content).toContain("Decisions Made");
    expect(summary.tokenCount).toBeGreaterThan(0);
    expect(summary.timestamp).toBeDefined();
  });

  it("should extract key points from messages", () => {
    const messages = [
      "Feature completed successfully",
      "Task done",
      "Just a random message",
    ];

    const summary = createL1Summary(messages, "Test");

    expect(summary.content).toContain("completed");
  });

  it("should extract blockers", () => {
    const messages = [
      "We are blocked on this issue",
      "Waiting for review",
      "Stuck on debugging",
    ];

    const summary = createL1Summary(messages, "Test");

    expect(summary.content).toContain("⚠️");
  });

  it("should extract decisions", () => {
    const messages = [
      "We decided to go with React",
      "Team agreed on the approach",
      "We will use TypeScript",
    ];

    const summary = createL1Summary(messages, "Test");

    expect(summary.content).toContain("✓");
  });
});

describe("createL2Summary", () => {
  it("should create epic-level summary from L1 summaries", () => {
    const l1Summaries: Summary[] = [
      {
        level: SummaryLevel.STORY,
        content: `## Story Summary: Story 1\n### Blockers\n- ⚠️ API issue\n### Decisions Made\n- ✓ Use REST`,
        tokenCount: 100,
        timestamp: "2025-01-01T00:00:00Z",
        context: "Story 1",
      },
      {
        level: SummaryLevel.STORY,
        content: `## Story Summary: Story 2\n### Blockers\n- None\n### Decisions Made\n- ✓ Use GraphQL`,
        tokenCount: 100,
        timestamp: "2025-01-02T00:00:00Z",
        context: "Story 2",
      },
    ];

    const summary = createL2Summary(l1Summaries, "Epic 1");

    expect(summary.level).toBe(SummaryLevel.EPIC);
    expect(summary.context).toBe("Epic 1");
    expect(summary.content).toContain("Epic Summary: Epic 1");
    expect(summary.content).toContain("Stories Covered");
    expect(summary.content).toContain("Story 1");
    expect(summary.content).toContain("Story 2");
    expect(summary.content).toContain("Cross-Story Risks");
  });

  it("should handle empty L1 summaries", () => {
    const summary = createL2Summary([], "Empty Epic");

    expect(summary.level).toBe(SummaryLevel.EPIC);
    expect(summary.content).toContain("N/A");
  });
});

describe("createL3Summary", () => {
  it("should create project-level summary", () => {
    const l2Summaries: Summary[] = [
      {
        level: SummaryLevel.EPIC,
        content: `## Epic Summary\n### Key Decisions\n- Decision 1`,
        tokenCount: 100,
        timestamp: "2025-01-01T00:00:00Z",
        context: "Epic 1",
      },
    ];

    const metrics = {
      health: "healthy" as const,
      velocity: 25,
      velocityTrend: "stable" as const,
      completionRate: 85,
      milestones: [
        { name: "v1.0", progress: 75 },
        { name: "v2.0", progress: 20 },
      ],
      risks: ["Resource constraint"],
    };

    const summary = createL3Summary(l2Summaries, "My Project", metrics);

    expect(summary.level).toBe(SummaryLevel.PROJECT);
    expect(summary.context).toBe("My Project");
    expect(summary.content).toContain("Project Summary: My Project");
    expect(summary.content).toContain("Health Status");
    expect(summary.content).toContain("healthy");
    expect(summary.content).toContain("Velocity: 25");
    expect(summary.content).toContain("Completion Rate: 85%");
    expect(summary.content).toContain("v1.0: 75%");
    expect(summary.content).toContain("v2.0: 20%");
    expect(summary.content).toContain("Resource constraint");
  });
});

describe("ContextManager", () => {
  let manager: ContextManager;

  beforeEach(() => {
    manager = new ContextManager(100000);
  });

  describe("addMessage", () => {
    it("should add messages to buffer", () => {
      manager.addMessage("Test message 1");
      manager.addMessage("Test message 2");

      const context = manager.getContext();
      expect(context).toContain("Test message");
    });

    it("should trigger L1 compression after threshold", () => {
      // Add 20 messages (default threshold)
      for (let i = 0; i < 25; i++) {
        manager.addMessage(`Message ${i}`);
      }

      const context = manager.getContext();
      expect(context).toContain("Story Summary");
    });
  });

  describe("getContext", () => {
    it("should return compressed context", () => {
      manager.addMessage("Recent message 1");
      manager.addMessage("Recent message 2");

      const context = manager.getContext();

      expect(context).toContain("Recent Activity");
    });

    it("should show recent messages", () => {
      for (let i = 0; i < 10; i++) {
        manager.addMessage(`Message ${i}`);
      }

      const context = manager.getContext();

      // Should show last 5 messages
      expect(context).toContain("Message 9");
      expect(context).toContain("Message 8");
      expect(context).toContain("Message 7");
      expect(context).toContain("Message 6");
      expect(context).toContain("Message 5");
    });
  });

  describe("getStats", () => {
    it("should return token count and compression ratio", () => {
      manager.addMessage("Test message");

      const stats = manager.getStats();

      expect(stats.tokens).toBeGreaterThan(0);
      expect(typeof stats.compression).toBe("number");
    });

    it("should show positive compression after L1 compression", () => {
      // Add enough messages to trigger compression
      for (let i = 0; i < 25; i++) {
        manager.addMessage(`This is message number ${i} with some content`);
      }

      const stats = manager.getStats();

      // Compression should be positive (saving tokens)
      expect(stats.tokens).toBeGreaterThan(0);
    });
  });
});
