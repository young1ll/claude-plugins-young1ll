/**
 * Status Mapper Unit Tests
 *
 * Tests for bidirectional status mapping between PM and GitHub.
 */

import { describe, it, expect } from "vitest";
import {
  pmToIssueState,
  pmToProjectStatus,
  pmToLabels,
  issueToPMStatus,
  projectStatusToPM,
  magicWordToStatus,
  parseStatusChangesFromMessage,
  branchTypeToTaskType,
  branchTypeToCommitType,
  type PMStatus,
} from "../../lib/status-mapper.js";

describe("pmToIssueState", () => {
  it("should map todo to open", () => {
    expect(pmToIssueState("todo")).toBe("open");
  });

  it("should map in_progress to open", () => {
    expect(pmToIssueState("in_progress")).toBe("open");
  });

  it("should map in_review to open", () => {
    expect(pmToIssueState("in_review")).toBe("open");
  });

  it("should map done to closed", () => {
    expect(pmToIssueState("done")).toBe("closed");
  });

  it("should map blocked to open", () => {
    expect(pmToIssueState("blocked")).toBe("open");
  });

  it("should map cancelled to closed", () => {
    expect(pmToIssueState("cancelled")).toBe("closed");
  });
});

describe("pmToProjectStatus", () => {
  it("should map todo to Todo", () => {
    expect(pmToProjectStatus("todo")).toBe("Todo");
  });

  it("should map in_progress to In Progress", () => {
    expect(pmToProjectStatus("in_progress")).toBe("In Progress");
  });

  it("should map in_review to In Review", () => {
    expect(pmToProjectStatus("in_review")).toBe("In Review");
  });

  it("should map done to Done", () => {
    expect(pmToProjectStatus("done")).toBe("Done");
  });

  it("should map blocked to Blocked", () => {
    expect(pmToProjectStatus("blocked")).toBe("Blocked");
  });
});

describe("pmToLabels", () => {
  it("should return in-progress label for in_progress status", () => {
    const result = pmToLabels("in_progress");

    expect(result.add).toContain("in-progress");
    expect(result.remove).toContain("in-review");
    expect(result.remove).toContain("blocked");
  });

  it("should return in-review label for in_review status", () => {
    const result = pmToLabels("in_review");

    expect(result.add).toContain("in-review");
    expect(result.remove).toContain("in-progress");
  });

  it("should return blocked label for blocked status", () => {
    const result = pmToLabels("blocked");

    expect(result.add).toContain("blocked");
    expect(result.remove).toContain("in-progress");
    expect(result.remove).toContain("in-review");
  });

  it("should return wontfix label for cancelled status", () => {
    const result = pmToLabels("cancelled");

    expect(result.add).toContain("wontfix");
  });

  it("should return empty add labels for todo status", () => {
    const result = pmToLabels("todo");

    expect(result.add).toHaveLength(0);
    expect(result.remove.length).toBeGreaterThan(0);
  });

  it("should not include add labels in remove list", () => {
    const result = pmToLabels("in_progress");

    expect(result.remove).not.toContain("in-progress");
  });
});

describe("issueToPMStatus", () => {
  it("should return blocked if blocked label present", () => {
    expect(issueToPMStatus("open", ["blocked"])).toBe("blocked");
  });

  it("should return in_review if in-review label present", () => {
    expect(issueToPMStatus("open", ["in-review"])).toBe("in_review");
  });

  it("should return in_progress if in-progress label present", () => {
    expect(issueToPMStatus("open", ["in-progress"])).toBe("in_progress");
  });

  it("should return cancelled if wontfix label present", () => {
    expect(issueToPMStatus("closed", ["wontfix"])).toBe("cancelled");
  });

  it("should return done for closed issue without labels", () => {
    expect(issueToPMStatus("closed", [])).toBe("done");
  });

  it("should return todo for open issue without labels", () => {
    expect(issueToPMStatus("open", [])).toBe("todo");
  });

  it("should prioritize blocked over other labels", () => {
    expect(issueToPMStatus("open", ["in-progress", "blocked"])).toBe("blocked");
  });
});

describe("projectStatusToPM", () => {
  it("should map Done to done", () => {
    expect(projectStatusToPM("Done")).toBe("done");
  });

  it("should map Complete to done", () => {
    expect(projectStatusToPM("Complete")).toBe("done");
  });

  it("should map In Review to in_review", () => {
    expect(projectStatusToPM("In Review")).toBe("in_review");
  });

  it("should map In Progress to in_progress", () => {
    expect(projectStatusToPM("In Progress")).toBe("in_progress");
  });

  it("should map Doing to in_progress", () => {
    expect(projectStatusToPM("Doing")).toBe("in_progress");
  });

  it("should map Blocked to blocked", () => {
    expect(projectStatusToPM("Blocked")).toBe("blocked");
  });

  it("should map Cancelled to cancelled", () => {
    expect(projectStatusToPM("Cancelled")).toBe("cancelled");
  });

  it("should map Wont Do to cancelled", () => {
    expect(projectStatusToPM("Won't Do")).toBe("cancelled");
  });

  it("should map unknown status to todo", () => {
    expect(projectStatusToPM("Backlog")).toBe("todo");
    expect(projectStatusToPM("Unknown")).toBe("todo");
  });

  it("should be case-insensitive", () => {
    expect(projectStatusToPM("DONE")).toBe("done");
    expect(projectStatusToPM("in progress")).toBe("in_progress");
  });
});

describe("magicWordToStatus", () => {
  it("should map fixes to done", () => {
    expect(magicWordToStatus("fixes")).toBe("done");
    expect(magicWordToStatus("fix")).toBe("done");
  });

  it("should map closes to done", () => {
    expect(magicWordToStatus("closes")).toBe("done");
    expect(magicWordToStatus("close")).toBe("done");
  });

  it("should map resolves to done", () => {
    expect(magicWordToStatus("resolves")).toBe("done");
    expect(magicWordToStatus("resolve")).toBe("done");
  });

  it("should map refs to null (no status change)", () => {
    expect(magicWordToStatus("refs")).toBeNull();
    expect(magicWordToStatus("ref")).toBeNull();
    expect(magicWordToStatus("relates")).toBeNull();
  });

  it("should map wip to in_progress", () => {
    expect(magicWordToStatus("wip")).toBe("in_progress");
  });

  it("should map review to in_review", () => {
    expect(magicWordToStatus("review")).toBe("in_review");
  });

  it("should map done/complete to done", () => {
    expect(magicWordToStatus("done")).toBe("done");
    expect(magicWordToStatus("complete")).toBe("done");
    expect(magicWordToStatus("completed")).toBe("done");
  });

  it("should map blocks to blocked", () => {
    expect(magicWordToStatus("blocks")).toBe("blocked");
    expect(magicWordToStatus("block")).toBe("blocked");
  });

  it("should return null for unknown words", () => {
    expect(magicWordToStatus("unknown")).toBeNull();
    expect(magicWordToStatus("random")).toBeNull();
  });

  it("should be case-insensitive", () => {
    expect(magicWordToStatus("FIXES")).toBe("done");
    expect(magicWordToStatus("Closes")).toBe("done");
    expect(magicWordToStatus("WIP")).toBe("in_progress");
  });
});

describe("parseStatusChangesFromMessage", () => {
  it("should parse fixes #123", () => {
    const changes = parseStatusChangesFromMessage("feat: complete auth fixes #123");

    expect(changes.get(123)).toBe("done");
  });

  it("should parse closes #456", () => {
    const changes = parseStatusChangesFromMessage("fix: bug closes #456");

    expect(changes.get(456)).toBe("done");
  });

  it("should parse wip #789", () => {
    const changes = parseStatusChangesFromMessage("feat: partial impl wip #789");

    expect(changes.get(789)).toBe("in_progress");
  });

  it("should parse review #42", () => {
    const changes = parseStatusChangesFromMessage("feat: ready for review #42");

    expect(changes.get(42)).toBe("in_review");
  });

  it("should parse multiple magic words", () => {
    const changes = parseStatusChangesFromMessage(
      "feat: update fixes #42 wip #43 review #44"
    );

    expect(changes.get(42)).toBe("done");
    expect(changes.get(43)).toBe("in_progress");
    expect(changes.get(44)).toBe("in_review");
  });

  it("should ignore refs (no status change)", () => {
    const changes = parseStatusChangesFromMessage("feat: related refs #42");

    expect(changes.has(42)).toBe(false);
  });

  it("should return empty map for no magic words", () => {
    const changes = parseStatusChangesFromMessage("feat: add new feature");

    expect(changes.size).toBe(0);
  });

  it("should handle multiline messages", () => {
    const changes = parseStatusChangesFromMessage(
      "feat: complete feature\n\nfixes #42\ncloses #43"
    );

    expect(changes.get(42)).toBe("done");
    expect(changes.get(43)).toBe("done");
  });
});

describe("branchTypeToTaskType", () => {
  it("should map feat to task", () => {
    expect(branchTypeToTaskType("feat")).toBe("task");
  });

  it("should map fix to bug", () => {
    expect(branchTypeToTaskType("fix")).toBe("bug");
  });

  it("should map refactor to task", () => {
    expect(branchTypeToTaskType("refactor")).toBe("task");
  });

  it("should map docs to task", () => {
    expect(branchTypeToTaskType("docs")).toBe("task");
  });

  it("should map test to task", () => {
    expect(branchTypeToTaskType("test")).toBe("task");
  });

  it("should map chore to task", () => {
    expect(branchTypeToTaskType("chore")).toBe("task");
  });

  it("should return task for unknown types", () => {
    expect(branchTypeToTaskType("unknown")).toBe("task");
  });
});

describe("branchTypeToCommitType", () => {
  it("should map feat to feat", () => {
    expect(branchTypeToCommitType("feat")).toBe("feat");
  });

  it("should map fix to fix", () => {
    expect(branchTypeToCommitType("fix")).toBe("fix");
  });

  it("should map refactor to refactor", () => {
    expect(branchTypeToCommitType("refactor")).toBe("refactor");
  });

  it("should map docs to docs", () => {
    expect(branchTypeToCommitType("docs")).toBe("docs");
  });

  it("should map test to test", () => {
    expect(branchTypeToCommitType("test")).toBe("test");
  });

  it("should map chore to chore", () => {
    expect(branchTypeToCommitType("chore")).toBe("chore");
  });

  it("should map perf to perf", () => {
    expect(branchTypeToCommitType("perf")).toBe("perf");
  });

  it("should map ci to ci", () => {
    expect(branchTypeToCommitType("ci")).toBe("ci");
  });

  it("should return original type for unknown types", () => {
    expect(branchTypeToCommitType("custom")).toBe("custom");
  });
});
