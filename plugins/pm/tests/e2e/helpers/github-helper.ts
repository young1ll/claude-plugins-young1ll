/**
 * GitHub E2E Test Helper
 *
 * Manages GitHub resources (issues, branches) for E2E tests.
 */

import { execSync } from "child_process";
import { getE2EConfig } from "../config/env.js";

export interface E2EIssue {
  number: number;
  title: string;
  url: string;
  state: string;
}

export interface E2EBranch {
  name: string;
  sha: string;
}

export class GitHubE2EHelper {
  private readonly prefix: string;
  private readonly repo: string;
  private readonly branchPrefix: string;
  private readonly baseBranch: string;
  private createdIssues: number[] = [];
  private createdBranches: string[] = [];

  constructor() {
    const config = getE2EConfig();
    this.prefix = config.github.testPrefix;
    this.repo = config.github.repo;
    this.branchPrefix = config.git.testBranchPrefix;
    this.baseBranch = config.git.baseBranch;
  }

  /**
   * Create a test issue with the E2E prefix
   */
  createTestIssue(title: string, body?: string): E2EIssue {
    const testTitle = `${this.prefix}${title}`;
    const result = execSync(
      `gh issue create --title "${testTitle}" --body "${body || "E2E Test Issue"}"`,
      { encoding: "utf-8" }
    );

    const match = result.match(/\/issues\/(\d+)/);
    const number = match ? parseInt(match[1], 10) : 0;
    this.createdIssues.push(number);

    return {
      number,
      title: testTitle,
      url: result.trim(),
      state: "open",
    };
  }

  /**
   * Get an existing issue by number
   */
  getIssue(number: number): E2EIssue | null {
    try {
      const result = execSync(
        `gh issue view ${number} --json number,title,url,state`,
        { encoding: "utf-8" }
      );
      const issue = JSON.parse(result);
      // Normalize state to lowercase
      issue.state = issue.state?.toLowerCase();
      return issue;
    } catch {
      return null;
    }
  }

  /**
   * Close an issue
   */
  closeIssue(number: number, comment?: string): boolean {
    try {
      const commentArg = comment ? ` --comment "${comment}"` : "";
      execSync(`gh issue close ${number}${commentArg}`, { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Reopen an issue
   */
  reopenIssue(number: number): boolean {
    try {
      execSync(`gh issue reopen ${number}`, { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Add a comment to an issue
   */
  addComment(number: number, body: string): boolean {
    try {
      execSync(`gh issue comment ${number} --body "${body}"`, { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List issues with the test prefix
   */
  listTestIssues(state: "open" | "closed" | "all" = "open"): E2EIssue[] {
    try {
      const result = execSync(
        `gh issue list --state ${state} --search "${this.prefix}" --json number,title,url,state --limit 100`,
        { encoding: "utf-8" }
      );
      const issues = JSON.parse(result);
      // Normalize state to lowercase
      return issues.map((issue: E2EIssue) => ({
        ...issue,
        state: issue.state?.toLowerCase(),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Clean up all issues created by this helper instance
   */
  cleanupTestIssues(): void {
    for (const number of this.createdIssues) {
      this.closeIssue(number, "E2E test cleanup");
    }
    this.createdIssues = [];
  }

  /**
   * Clean up stale test issues (older than specified hours)
   */
  cleanupStaleTestIssues(olderThanHours = 24): number {
    let closedCount = 0;
    try {
      const issues = JSON.parse(
        execSync(
          `gh issue list --state open --search "${this.prefix}" --json number,createdAt --limit 100`,
          { encoding: "utf-8" }
        )
      );

      const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000;
      for (const issue of issues) {
        if (new Date(issue.createdAt).getTime() < cutoff) {
          if (this.closeIssue(issue.number, "Stale E2E test cleanup")) {
            closedCount++;
          }
        }
      }
    } catch {
      // Ignore errors
    }
    return closedCount;
  }

  /**
   * Create a test branch
   */
  createTestBranch(name: string): E2EBranch {
    const branchName = `${this.branchPrefix}${name}`;

    // Create branch from current HEAD
    execSync(`git checkout -b ${branchName}`, { stdio: "pipe" });

    // Get SHA
    const sha = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
    this.createdBranches.push(branchName);

    // Return to base branch
    execSync(`git checkout ${this.baseBranch}`, { stdio: "pipe" });

    return { name: branchName, sha };
  }

  /**
   * Delete a local branch
   */
  deleteLocalBranch(name: string): boolean {
    try {
      execSync(`git branch -D ${name}`, { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clean up all branches created by this helper instance
   */
  cleanupTestBranches(): void {
    // Return to base branch first
    try {
      execSync(`git checkout ${this.baseBranch}`, { stdio: "pipe" });
    } catch {
      // Ignore
    }

    for (const branch of this.createdBranches) {
      this.deleteLocalBranch(branch);
    }
    this.createdBranches = [];
  }

  /**
   * List local test branches
   */
  listTestBranches(): string[] {
    try {
      const result = execSync(
        `git branch --list "${this.branchPrefix}*"`,
        { encoding: "utf-8" }
      );
      return result
        .split("\n")
        .map((b) => b.trim().replace(/^\*?\s*/, ""))
        .filter((b) => b);
    } catch {
      return [];
    }
  }

  /**
   * Get list of created issue numbers (for verification)
   */
  getCreatedIssues(): number[] {
    return [...this.createdIssues];
  }

  /**
   * Get list of created branch names (for verification)
   */
  getCreatedBranches(): string[] {
    return [...this.createdBranches];
  }
}
