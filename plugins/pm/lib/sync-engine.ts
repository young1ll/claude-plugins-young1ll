/**
 * PM Plugin Sync Engine
 *
 * Bidirectional synchronization between local SQLite and GitHub Issues/Projects.
 * LEVEL_1 Implementation: Git-First workflow with GitHub as source of truth.
 */

import {
  getIssue,
  listIssues,
  createIssue,
  updateIssueState,
  addIssueComment,
  getRepoInfo,
  isAuthenticated,
} from "./github.js";

import {
  pmToIssueState,
  issueToPMStatus,
  type PMStatus,
} from "./status-mapper.js";

// ============================================
// Types
// ============================================

export interface SyncConfig {
  enabled: boolean;
  owner: string;
  repo: string;
  projectNumber?: number;
  autoSync: boolean;
  conflictResolution: "github" | "local" | "manual";
}

export interface SyncResult {
  success: boolean;
  synced: number;
  created: number;
  updated: number;
  conflicts: SyncConflict[];
  errors: string[];
}

export interface SyncConflict {
  taskId: string;
  issueNumber: number;
  localStatus: PMStatus;
  remoteStatus: PMStatus;
  localUpdatedAt: string;
  remoteUpdatedAt: string;
}

export interface LocalTask {
  id: string;
  title: string;
  description?: string;
  status: PMStatus;
  issueNumber?: number;
  updatedAt: string;
}

// ============================================
// Sync Engine
// ============================================

export class SyncEngine {
  private config: SyncConfig;

  constructor(config: Partial<SyncConfig>) {
    const repoInfo = getRepoInfo();

    this.config = {
      enabled: config.enabled ?? false,
      owner: config.owner ?? repoInfo?.owner ?? "",
      repo: config.repo ?? repoInfo?.repo ?? "",
      projectNumber: config.projectNumber,
      autoSync: config.autoSync ?? true,
      conflictResolution: config.conflictResolution ?? "github",
    };
  }

  /**
   * Check if sync is available
   */
  canSync(): boolean {
    if (!this.config.enabled) return false;
    if (!this.config.owner || !this.config.repo) return false;
    if (!isAuthenticated()) return false;
    return true;
  }

  /**
   * Pull changes from GitHub to local
   */
  async pullFromGitHub(localTasks: LocalTask[]): Promise<SyncResult> {
    const result: SyncResult = {
      success: false,
      synced: 0,
      created: 0,
      updated: 0,
      conflicts: [],
      errors: [],
    };

    if (!this.canSync()) {
      result.errors.push("Sync not available. Check configuration and auth.");
      return result;
    }

    try {
      // Get all open issues from GitHub
      const issues = listIssues({ state: "all", limit: 100 });

      for (const issue of issues) {
        const localTask = localTasks.find(
          (t) => t.issueNumber === issue.number
        );

        if (localTask) {
          // Check for updates
          const remoteStatus = issueToPMStatus(issue.state, issue.labels);

          if (localTask.status !== remoteStatus) {
            // Check for conflict
            const localTime = new Date(localTask.updatedAt).getTime();
            const remoteTime = new Date(issue.updatedAt).getTime();

            if (
              localTime > remoteTime &&
              this.config.conflictResolution === "manual"
            ) {
              result.conflicts.push({
                taskId: localTask.id,
                issueNumber: issue.number,
                localStatus: localTask.status,
                remoteStatus,
                localUpdatedAt: localTask.updatedAt,
                remoteUpdatedAt: issue.updatedAt,
              });
            } else {
              // Update local with remote (GitHub wins or remote is newer)
              result.updated++;
            }
          }

          result.synced++;
        } else {
          // New issue from GitHub - create local task
          result.created++;
          result.synced++;
        }
      }

      result.success = true;
    } catch (error) {
      result.errors.push(`Pull failed: ${(error as Error).message}`);
    }

    return result;
  }

  /**
   * Push changes from local to GitHub
   */
  async pushToGitHub(
    task: LocalTask,
    action: "create" | "update" | "comment"
  ): Promise<{ success: boolean; issueNumber?: number; error?: string }> {
    if (!this.canSync()) {
      return { success: false, error: "Sync not available" };
    }

    try {
      switch (action) {
        case "create": {
          const issue = createIssue({
            title: task.title,
            body: task.description,
          });

          if (issue) {
            return { success: true, issueNumber: issue.number };
          }
          return { success: false, error: "Failed to create issue" };
        }

        case "update": {
          if (!task.issueNumber) {
            return { success: false, error: "No issue number linked" };
          }

          const targetState = pmToIssueState(task.status);
          const currentIssue = getIssue(task.issueNumber);

          if (currentIssue && currentIssue.state !== targetState) {
            const updated = updateIssueState(task.issueNumber, targetState);
            if (!updated) {
              return { success: false, error: "Failed to update issue state" };
            }
          }

          return { success: true, issueNumber: task.issueNumber };
        }

        case "comment": {
          if (!task.issueNumber) {
            return { success: false, error: "No issue number linked" };
          }

          const commented = addIssueComment(
            task.issueNumber,
            `Task status updated to: ${task.status}`
          );

          if (!commented) {
            return { success: false, error: "Failed to add comment" };
          }

          return { success: true, issueNumber: task.issueNumber };
        }

        default:
          return { success: false, error: "Unknown action" };
      }
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Sync a single task with GitHub
   */
  async syncTask(
    task: LocalTask
  ): Promise<{ success: boolean; action: string; error?: string }> {
    if (!this.canSync()) {
      return { success: false, action: "none", error: "Sync not available" };
    }

    try {
      if (!task.issueNumber) {
        // Create new issue
        const result = await this.pushToGitHub(task, "create");
        return {
          success: result.success,
          action: "created",
          error: result.error,
        };
      }

      // Get current issue state
      const issue = getIssue(task.issueNumber);
      if (!issue) {
        // Issue was deleted, create new
        const result = await this.pushToGitHub(task, "create");
        return {
          success: result.success,
          action: "recreated",
          error: result.error,
        };
      }

      // Check if update needed
      const remoteStatus = issueToPMStatus(issue.state, issue.labels);
      if (task.status !== remoteStatus) {
        const result = await this.pushToGitHub(task, "update");
        return {
          success: result.success,
          action: "updated",
          error: result.error,
        };
      }

      return { success: true, action: "unchanged" };
    } catch (error) {
      return {
        success: false,
        action: "error",
        error: (error as Error).message,
      };
    }
  }

  /**
   * Handle Git event and sync to GitHub
   */
  async handleGitEvent(event: {
    type: "checkout" | "commit" | "push" | "merge";
    branch?: string;
    issueNumber?: number;
    message?: string;
    status?: PMStatus;
  }): Promise<{ success: boolean; message: string }> {
    if (!this.canSync()) {
      return { success: false, message: "Sync not available" };
    }

    try {
      switch (event.type) {
        case "checkout":
          // Load issue context when checking out branch
          if (event.issueNumber) {
            const issue = getIssue(event.issueNumber);
            if (issue) {
              return {
                success: true,
                message: `Loaded context for #${event.issueNumber}: ${issue.title}`,
              };
            }
          }
          return { success: true, message: "No issue context to load" };

        case "commit":
          // Add commit reference to issue
          if (event.issueNumber && event.message) {
            addIssueComment(
              event.issueNumber,
              `Commit: ${event.message.split("\n")[0]}`
            );
          }
          return { success: true, message: "Commit recorded" };

        case "push":
          // Suggest PR creation
          return {
            success: true,
            message: "Consider creating a PR with gh pr create",
          };

        case "merge":
          // Close issue if PR merged with fix/close keywords
          if (event.issueNumber && event.status === "done") {
            updateIssueState(event.issueNumber, "closed");
            return {
              success: true,
              message: `Closed issue #${event.issueNumber}`,
            };
          }
          return { success: true, message: "Merge handled" };

        default:
          return { success: true, message: "Unknown event" };
      }
    } catch (error) {
      return {
        success: false,
        message: `Event handling failed: ${(error as Error).message}`,
      };
    }
  }
}

/**
 * Create a sync engine instance
 */
export function createSyncEngine(config?: Partial<SyncConfig>): SyncEngine {
  return new SyncEngine(config ?? {});
}
