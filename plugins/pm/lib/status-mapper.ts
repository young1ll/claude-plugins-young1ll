/**
 * PM Plugin Status Mapper
 *
 * Bidirectional mapping between PM task status and GitHub issue/project status.
 * LEVEL_1 Implementation: Git-First workflow status synchronization.
 */

// ============================================
// Types
// ============================================

export type PMStatus =
  | "todo"
  | "in_progress"
  | "in_review"
  | "done"
  | "blocked"
  | "cancelled";

export type GitHubIssueState = "open" | "closed";

export type GitHubProjectStatus =
  | "Todo"
  | "In Progress"
  | "In Review"
  | "Done"
  | "Blocked";

export interface StatusMapping {
  pm: PMStatus;
  issueState: GitHubIssueState;
  projectStatus: GitHubProjectStatus;
  labels: string[];
}

// ============================================
// Status Mappings
// ============================================

/**
 * Default status mappings
 */
export const DEFAULT_MAPPINGS: StatusMapping[] = [
  {
    pm: "todo",
    issueState: "open",
    projectStatus: "Todo",
    labels: [],
  },
  {
    pm: "in_progress",
    issueState: "open",
    projectStatus: "In Progress",
    labels: ["in-progress"],
  },
  {
    pm: "in_review",
    issueState: "open",
    projectStatus: "In Review",
    labels: ["in-review"],
  },
  {
    pm: "done",
    issueState: "closed",
    projectStatus: "Done",
    labels: [],
  },
  {
    pm: "blocked",
    issueState: "open",
    projectStatus: "Blocked",
    labels: ["blocked"],
  },
  {
    pm: "cancelled",
    issueState: "closed",
    projectStatus: "Done",
    labels: ["wontfix"],
  },
];

// ============================================
// PM → GitHub Mapping
// ============================================

/**
 * Get GitHub issue state from PM status
 */
export function pmToIssueState(status: PMStatus): GitHubIssueState {
  const mapping = DEFAULT_MAPPINGS.find((m) => m.pm === status);
  return mapping?.issueState ?? "open";
}

/**
 * Get GitHub project status from PM status
 */
export function pmToProjectStatus(status: PMStatus): GitHubProjectStatus {
  const mapping = DEFAULT_MAPPINGS.find((m) => m.pm === status);
  return mapping?.projectStatus ?? "Todo";
}

/**
 * Get labels to add/remove for PM status
 */
export function pmToLabels(status: PMStatus): {
  add: string[];
  remove: string[];
} {
  const currentMapping = DEFAULT_MAPPINGS.find((m) => m.pm === status);
  const addLabels = currentMapping?.labels ?? [];

  // Remove labels from other statuses
  const removeLabels = DEFAULT_MAPPINGS.filter((m) => m.pm !== status)
    .flatMap((m) => m.labels)
    .filter((label, index, arr) => arr.indexOf(label) === index);

  return {
    add: addLabels,
    remove: removeLabels.filter((l) => !addLabels.includes(l)),
  };
}

// ============================================
// GitHub → PM Mapping
// ============================================

/**
 * Infer PM status from GitHub issue state and labels
 */
export function issueToPMStatus(
  state: GitHubIssueState,
  labels: string[]
): PMStatus {
  // Check for specific labels first
  if (labels.includes("blocked")) return "blocked";
  if (labels.includes("in-review")) return "in_review";
  if (labels.includes("in-progress")) return "in_progress";
  if (labels.includes("wontfix")) return "cancelled";

  // Fall back to issue state
  return state === "closed" ? "done" : "todo";
}

/**
 * Infer PM status from GitHub project status
 */
export function projectStatusToPM(status: string): PMStatus {
  const normalized = status.toLowerCase();

  if (normalized.includes("done") || normalized.includes("complete")) {
    return "done";
  }
  if (normalized.includes("review")) {
    return "in_review";
  }
  if (normalized.includes("progress") || normalized.includes("doing")) {
    return "in_progress";
  }
  if (normalized.includes("block")) {
    return "blocked";
  }
  if (normalized.includes("cancel") || normalized.includes("wont") || normalized.includes("won't")) {
    return "cancelled";
  }

  return "todo";
}

// ============================================
// Magic Words → Status Mapping
// ============================================

export interface MagicWordMapping {
  patterns: string[];
  status: PMStatus | null; // null means no status change
}

/**
 * Magic word mappings from LEVEL_1 spec
 */
export const MAGIC_WORD_MAPPINGS: MagicWordMapping[] = [
  {
    patterns: ["fixes", "fix", "closes", "close", "resolves", "resolve"],
    status: "done",
  },
  {
    patterns: ["refs", "ref", "relates", "relate"],
    status: null, // Link only, no status change
  },
  {
    patterns: ["wip"],
    status: "in_progress",
  },
  {
    patterns: ["review"],
    status: "in_review",
  },
  {
    patterns: ["done", "complete", "completed"],
    status: "done",
  },
  {
    patterns: ["blocks", "block"],
    status: "blocked",
  },
];

/**
 * Get status change for a magic word
 */
export function magicWordToStatus(word: string): PMStatus | null {
  const normalized = word.toLowerCase();

  for (const mapping of MAGIC_WORD_MAPPINGS) {
    if (mapping.patterns.includes(normalized)) {
      return mapping.status;
    }
  }

  return null;
}

/**
 * Parse magic words from commit message and get status changes
 */
export function parseStatusChangesFromMessage(
  message: string
): Map<number, PMStatus> {
  const changes = new Map<number, PMStatus>();

  // Pattern: magic_word #issue_number
  const pattern = /\b(\w+)\s+#(\d+)/gi;
  let match;

  while ((match = pattern.exec(message)) !== null) {
    const word = match[1];
    const issueNumber = parseInt(match[2], 10);
    const status = magicWordToStatus(word);

    if (status !== null) {
      changes.set(issueNumber, status);
    }
  }

  return changes;
}

// ============================================
// Branch Type → Task Type Mapping
// ============================================

export interface TypeMapping {
  branchType: string;
  taskType: string;
  conventionalCommit: string;
}

/**
 * Type mappings between branch, task, and commit conventions
 */
export const TYPE_MAPPINGS: TypeMapping[] = [
  { branchType: "feat", taskType: "task", conventionalCommit: "feat" },
  { branchType: "fix", taskType: "bug", conventionalCommit: "fix" },
  { branchType: "refactor", taskType: "task", conventionalCommit: "refactor" },
  { branchType: "docs", taskType: "task", conventionalCommit: "docs" },
  { branchType: "test", taskType: "task", conventionalCommit: "test" },
  { branchType: "chore", taskType: "task", conventionalCommit: "chore" },
  { branchType: "perf", taskType: "task", conventionalCommit: "perf" },
  { branchType: "ci", taskType: "task", conventionalCommit: "ci" },
];

/**
 * Get task type from branch type
 */
export function branchTypeToTaskType(branchType: string): string {
  const mapping = TYPE_MAPPINGS.find((m) => m.branchType === branchType);
  return mapping?.taskType ?? "task";
}

/**
 * Get conventional commit type from branch type
 */
export function branchTypeToCommitType(branchType: string): string {
  const mapping = TYPE_MAPPINGS.find((m) => m.branchType === branchType);
  return mapping?.conventionalCommit ?? branchType;
}
