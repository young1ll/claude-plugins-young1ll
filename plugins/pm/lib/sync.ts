/**
 * PM Plugin Sync Engine
 *
 * LEVEL_1 Implementation - Git ↔ SQLite ↔ GitHub Synchronization
 * Section 8: 동기화 엔진
 *
 * Git은 이벤트 소스, GitHub는 상태의 SSOT, SQLite는 조회/요약 캐시
 */

import { execSync } from "child_process";
import { randomUUID } from "crypto";
import {
  getCurrentBranch,
  parseBranchName,
  parseCommitMessage,
  getMagicWordStatusChange,
  getRecentCommits,
  GitCommit,
} from "./git.js";
import {
  getRepoInfo,
  getIssue,
  updateIssueState,
  addIssueComment,
  GitHubConfig,
} from "./github.js";

// ============================================
// Types
// ============================================

export interface SyncConfig {
  githubEnabled: boolean;
  syncMode: "read_only" | "bidirectional";
  projectId: string;
}

export interface SyncResult {
  success: boolean;
  pulled: {
    issues: number;
    prs: number;
    projects: number;
  };
  pushed: {
    statusUpdates: number;
    comments: number;
  };
  errors: string[];
}

export interface GitEvent {
  id: string;
  eventType: "commit" | "branch" | "merge" | "tag" | "push" | "pr";
  ref?: string;
  sha?: string;
  message?: string;
  author?: string;
  authorEmail?: string;
  filesChanged?: number;
  linesAdded?: number;
  linesRemoved?: number;
  issueIds?: number[];
  prNumber?: number;
  repo?: string;
  createdAt: string;
}

export interface SyncQueueItem {
  id?: number;
  action: string;
  entityType: string;
  entityId: string;
  payload: string;
  status: "pending" | "processing" | "completed" | "failed";
  retryCount: number;
  errorMessage?: string;
  createdAt: string;
  processedAt?: string;
}

// ============================================
// Git Event Recording
// ============================================

/**
 * Record a git commit event
 */
export function recordCommitEvent(commit: GitCommit, repo?: string): GitEvent {
  const parsed = parseCommitMessage(commit.message);

  return {
    id: randomUUID(),
    eventType: "commit",
    sha: commit.sha,
    message: commit.message,
    author: commit.author,
    authorEmail: commit.email,
    filesChanged: commit.files.length,
    linesAdded: commit.linesAdded,
    linesRemoved: commit.linesDeleted,
    issueIds: parsed.issueRefs,
    repo,
    createdAt: commit.date || new Date().toISOString(),
  };
}

/**
 * Record a branch event
 */
export function recordBranchEvent(
  branchName: string,
  eventType: "branch" | "merge" = "branch",
  repo?: string
): GitEvent {
  const parsed = parseBranchName(branchName);

  return {
    id: randomUUID(),
    eventType,
    ref: branchName,
    issueIds: parsed.issueNumber ? [parsed.issueNumber] : undefined,
    repo,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Record a tag/release event
 */
export function recordTagEvent(
  tagName: string,
  message?: string,
  repo?: string
): GitEvent {
  return {
    id: randomUUID(),
    eventType: "tag",
    ref: tagName,
    message,
    repo,
    createdAt: new Date().toISOString(),
  };
}

// ============================================
// Git Log Replay
// ============================================

/**
 * Replay git log to recover events
 * LEVEL_1: Git 로그 기반 이력 복원
 */
export function replayGitLog(
  since?: string,
  lastProcessedSha?: string
): GitEvent[] {
  const events: GitEvent[] = [];
  const commits = getRecentCommits(100);
  const repo = getRepoInfo();
  const repoName = repo ? `${repo.owner}/${repo.repo}` : undefined;

  let foundLastProcessed = !lastProcessedSha;

  for (const commit of commits) {
    // Skip already processed commits
    if (lastProcessedSha && commit.sha === lastProcessedSha) {
      foundLastProcessed = true;
      continue;
    }

    if (!foundLastProcessed) {
      continue;
    }

    // Skip if before since date
    if (since && commit.date < since) {
      break;
    }

    events.push(recordCommitEvent(commit, repoName));
  }

  return events.reverse(); // Chronological order
}

// ============================================
// Status Synchronization
// ============================================

/**
 * Process magic words and update task statuses
 */
export function processMagicWords(commit: GitCommit): Map<number, string> {
  const parsed = parseCommitMessage(commit.message);
  return getMagicWordStatusChange(parsed.magicWords);
}

/**
 * Sync task status to GitHub issue
 * Only when github_enabled and bidirectional mode
 */
export function syncTaskToGitHub(
  taskId: number,
  status: string,
  config: SyncConfig
): boolean {
  if (!config.githubEnabled || config.syncMode !== "bidirectional") {
    return false;
  }

  try {
    // Map task status to GitHub issue state
    const shouldClose = status === "done";
    const currentIssue = getIssue(taskId);

    if (!currentIssue) {
      return false;
    }

    // Only update if state differs
    const currentState = currentIssue.state;
    if (shouldClose && currentState === "open") {
      return updateIssueState(taskId, "closed");
    } else if (!shouldClose && currentState === "closed") {
      return updateIssueState(taskId, "open");
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Add status change comment to GitHub issue
 */
export function addStatusComment(
  issueNumber: number,
  status: string,
  commitSha?: string
): boolean {
  const shortSha = commitSha?.slice(0, 7);
  const message = commitSha
    ? `📋 Task status changed to **${status}** (commit: ${shortSha})`
    : `📋 Task status changed to **${status}**`;

  return addIssueComment(issueNumber, message);
}

// ============================================
// Sync Queue Management
// ============================================

/**
 * Create a sync queue item
 */
export function createSyncQueueItem(
  action: string,
  entityType: string,
  entityId: string,
  payload: unknown
): SyncQueueItem {
  return {
    action,
    entityType,
    entityId,
    payload: JSON.stringify(payload),
    status: "pending",
    retryCount: 0,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Process sync queue items
 * Returns processed count
 */
export function processSyncQueue(
  items: SyncQueueItem[],
  config: SyncConfig
): { processed: number; failed: number } {
  let processed = 0;
  let failed = 0;

  for (const item of items) {
    if (item.status !== "pending") continue;

    try {
      item.status = "processing";

      // Process based on action type
      switch (item.action) {
        case "update_status": {
          const payload = JSON.parse(item.payload);
          const success = syncTaskToGitHub(
            parseInt(item.entityId, 10),
            payload.status,
            config
          );
          if (success) {
            item.status = "completed";
            item.processedAt = new Date().toISOString();
            processed++;
          } else {
            throw new Error("Failed to sync status");
          }
          break;
        }

        case "add_comment": {
          const payload = JSON.parse(item.payload);
          const success = addStatusComment(
            parseInt(item.entityId, 10),
            payload.status,
            payload.commitSha
          );
          if (success) {
            item.status = "completed";
            item.processedAt = new Date().toISOString();
            processed++;
          } else {
            throw new Error("Failed to add comment");
          }
          break;
        }

        default:
          item.status = "failed";
          item.errorMessage = `Unknown action: ${item.action}`;
          failed++;
      }
    } catch (error) {
      item.status = "failed";
      item.retryCount++;
      item.errorMessage = error instanceof Error ? error.message : String(error);
      failed++;
    }
  }

  return { processed, failed };
}

// ============================================
// Full Sync Operations
// ============================================

/**
 * Pull changes from GitHub
 * Updates local SQLite cache
 */
export function syncPull(config: SyncConfig): SyncResult {
  const result: SyncResult = {
    success: true,
    pulled: { issues: 0, prs: 0, projects: 0 },
    pushed: { statusUpdates: 0, comments: 0 },
    errors: [],
  };

  if (!config.githubEnabled) {
    return result;
  }

  // Pull operations would query GitHub API
  // and update local SQLite tables
  // This is a placeholder for the actual implementation

  return result;
}

/**
 * Push changes to GitHub
 * Processes sync queue
 */
export function syncPush(
  config: SyncConfig,
  queue: SyncQueueItem[]
): SyncResult {
  const result: SyncResult = {
    success: true,
    pulled: { issues: 0, prs: 0, projects: 0 },
    pushed: { statusUpdates: 0, comments: 0 },
    errors: [],
  };

  if (!config.githubEnabled || config.syncMode !== "bidirectional") {
    return result;
  }

  const { processed, failed } = processSyncQueue(queue, config);
  result.pushed.statusUpdates = processed;

  if (failed > 0) {
    result.errors.push(`${failed} sync operations failed`);
  }

  result.success = failed === 0;
  return result;
}

// ============================================
// Context Detection
// ============================================

/**
 * Get current work context from Git state
 * LEVEL_1: 자동 컨텍스트 감지
 */
export function getWorkContext(): {
  branch: string | null;
  taskId: number | null;
  taskType: string | null;
  repo: GitHubConfig | null;
  isClean: boolean;
} {
  const branch = getCurrentBranch();
  const repo = getRepoInfo();

  let taskId: number | null = null;
  let taskType: string | null = null;

  if (branch) {
    const parsed = parseBranchName(branch);
    if (parsed.issueNumber) {
      taskId = parsed.issueNumber;
    }
    if (parsed.type) {
      taskType = parsed.type;
    }
  }

  // Check if working tree is clean
  let isClean = false;
  try {
    const status = execSync("git status --porcelain", { encoding: "utf-8" });
    isClean = status.trim() === "";
  } catch {
    // Ignore
  }

  return {
    branch,
    taskId,
    taskType,
    repo,
    isClean,
  };
}
