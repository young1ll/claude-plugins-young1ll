/**
 * PM Plugin GitHub Integration
 *
 * GitHub API client for LEVEL_1 implementation:
 * - Issue management
 * - Project integration
 * - PR workflow
 */

import { execSync } from "child_process";

// ============================================
// Types
// ============================================

export interface GitHubConfig {
  owner: string;
  repo: string;
  projectNumber?: number;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  labels: string[];
  assignees: string[];
  milestone?: {
    number: number;
    title: string;
  };
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
}

export interface GitHubPR {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed" | "merged";
  head: string;
  base: string;
  draft: boolean;
  labels: string[];
  assignees: string[];
  reviewers: string[];
  createdAt: string;
  updatedAt: string;
  mergedAt?: string;
}

export interface GitHubProjectItem {
  id: string;
  contentId: number;
  contentType: "Issue" | "PullRequest";
  status?: string;
  fields: Record<string, unknown>;
}

// ============================================
// GitHub CLI Wrapper
// ============================================

/**
 * Execute gh CLI command
 */
function gh(args: string): string {
  try {
    return execSync(`gh ${args}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const err = error as Error & { stderr?: string };
    throw new Error(`GitHub CLI error: ${err.stderr || err.message}`);
  }
}

/**
 * Execute gh CLI command and parse JSON
 */
function ghJson<T>(args: string): T {
  const result = gh(args);
  return JSON.parse(result) as T;
}

// ============================================
// Repository Info
// ============================================

/**
 * Get current repository info
 */
export function getRepoInfo(): GitHubConfig | null {
  try {
    const info = ghJson<{ owner: { login: string }; name: string }>(
      "repo view --json owner,name"
    );
    return {
      owner: info.owner.login,
      repo: info.name,
    };
  } catch {
    return null;
  }
}

/**
 * Check if gh CLI is authenticated
 */
export function isAuthenticated(): boolean {
  try {
    gh("auth status");
    return true;
  } catch {
    return false;
  }
}

// ============================================
// Issues
// ============================================

/**
 * Get issue by number
 */
export function getIssue(number: number): GitHubIssue | null {
  try {
    const issue = ghJson<{
      number: number;
      title: string;
      body: string;
      state: string;
      labels: { name: string }[];
      assignees: { login: string }[];
      milestone?: { number: number; title: string };
      createdAt: string;
      updatedAt: string;
      closedAt?: string;
    }>(
      `issue view ${number} --json number,title,body,state,labels,assignees,milestone,createdAt,updatedAt,closedAt`
    );

    return {
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state as "open" | "closed",
      labels: issue.labels.map((l) => l.name),
      assignees: issue.assignees.map((a) => a.login),
      milestone: issue.milestone,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      closedAt: issue.closedAt,
    };
  } catch {
    return null;
  }
}

/**
 * List issues
 */
export function listIssues(options?: {
  state?: "open" | "closed" | "all";
  labels?: string[];
  assignee?: string;
  limit?: number;
}): GitHubIssue[] {
  try {
    const args = ["issue list"];

    if (options?.state) args.push(`--state ${options.state}`);
    if (options?.labels) args.push(`--label "${options.labels.join(",")}"`);
    if (options?.assignee) args.push(`--assignee ${options.assignee}`);
    args.push(`--limit ${options?.limit || 50}`);
    args.push(
      "--json number,title,body,state,labels,assignees,milestone,createdAt,updatedAt,closedAt"
    );

    const issues = ghJson<
      {
        number: number;
        title: string;
        body: string;
        state: string;
        labels: { name: string }[];
        assignees: { login: string }[];
        milestone?: { number: number; title: string };
        createdAt: string;
        updatedAt: string;
        closedAt?: string;
      }[]
    >(args.join(" "));

    return issues.map((issue) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state as "open" | "closed",
      labels: issue.labels.map((l) => l.name),
      assignees: issue.assignees.map((a) => a.login),
      milestone: issue.milestone,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      closedAt: issue.closedAt,
    }));
  } catch {
    return [];
  }
}

/**
 * Create a new issue
 */
export function createIssue(params: {
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
  milestone?: number;
}): GitHubIssue | null {
  try {
    const args = [`issue create --title "${params.title}"`];

    if (params.body) args.push(`--body "${params.body}"`);
    if (params.labels) args.push(`--label "${params.labels.join(",")}"`);
    if (params.assignees) args.push(`--assignee "${params.assignees.join(",")}"`);
    if (params.milestone) args.push(`--milestone ${params.milestone}`);

    const result = gh(args.join(" "));
    const match = result.match(/\/issues\/(\d+)/);
    if (match) {
      return getIssue(parseInt(match[1], 10));
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Update issue state
 */
export function updateIssueState(
  number: number,
  state: "open" | "closed"
): boolean {
  try {
    if (state === "closed") {
      gh(`issue close ${number}`);
    } else {
      gh(`issue reopen ${number}`);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Add comment to issue
 */
export function addIssueComment(number: number, body: string): boolean {
  try {
    gh(`issue comment ${number} --body "${body}"`);
    return true;
  } catch {
    return false;
  }
}

// ============================================
// Pull Requests
// ============================================

/**
 * Get PR by number
 */
export function getPR(number: number): GitHubPR | null {
  try {
    const pr = ghJson<{
      number: number;
      title: string;
      body: string;
      state: string;
      headRefName: string;
      baseRefName: string;
      isDraft: boolean;
      labels: { name: string }[];
      assignees: { login: string }[];
      reviewRequests: { login: string }[];
      createdAt: string;
      updatedAt: string;
      mergedAt?: string;
    }>(
      `pr view ${number} --json number,title,body,state,headRefName,baseRefName,isDraft,labels,assignees,reviewRequests,createdAt,updatedAt,mergedAt`
    );

    return {
      number: pr.number,
      title: pr.title,
      body: pr.body,
      state: pr.mergedAt ? "merged" : (pr.state.toLowerCase() as "open" | "closed"),
      head: pr.headRefName,
      base: pr.baseRefName,
      draft: pr.isDraft,
      labels: pr.labels.map((l) => l.name),
      assignees: pr.assignees.map((a) => a.login),
      reviewers: pr.reviewRequests.map((r) => r.login),
      createdAt: pr.createdAt,
      updatedAt: pr.updatedAt,
      mergedAt: pr.mergedAt,
    };
  } catch {
    return null;
  }
}

/**
 * Create a new PR
 */
export function createPR(params: {
  title: string;
  body?: string;
  base?: string;
  head?: string;
  draft?: boolean;
  labels?: string[];
  assignees?: string[];
  reviewers?: string[];
}): GitHubPR | null {
  try {
    const args = [`pr create --title "${params.title}"`];

    if (params.body) args.push(`--body "${params.body}"`);
    if (params.base) args.push(`--base ${params.base}`);
    if (params.head) args.push(`--head ${params.head}`);
    if (params.draft) args.push("--draft");
    if (params.labels) args.push(`--label "${params.labels.join(",")}"`);
    if (params.assignees) args.push(`--assignee "${params.assignees.join(",")}"`);
    if (params.reviewers) args.push(`--reviewer "${params.reviewers.join(",")}"`);

    const result = gh(args.join(" "));
    const match = result.match(/\/pull\/(\d+)/);
    if (match) {
      return getPR(parseInt(match[1], 10));
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * List PRs
 */
export function listPRs(options?: {
  state?: "open" | "closed" | "merged" | "all";
  base?: string;
  head?: string;
  limit?: number;
}): GitHubPR[] {
  try {
    const args = ["pr list"];

    if (options?.state) args.push(`--state ${options.state}`);
    if (options?.base) args.push(`--base ${options.base}`);
    if (options?.head) args.push(`--head ${options.head}`);
    args.push(`--limit ${options?.limit || 50}`);
    args.push(
      "--json number,title,body,state,headRefName,baseRefName,isDraft,labels,assignees,reviewRequests,createdAt,updatedAt,mergedAt"
    );

    const prs = ghJson<
      {
        number: number;
        title: string;
        body: string;
        state: string;
        headRefName: string;
        baseRefName: string;
        isDraft: boolean;
        labels: { name: string }[];
        assignees: { login: string }[];
        reviewRequests: { login: string }[];
        createdAt: string;
        updatedAt: string;
        mergedAt?: string;
      }[]
    >(args.join(" "));

    return prs.map((pr) => ({
      number: pr.number,
      title: pr.title,
      body: pr.body,
      state: pr.mergedAt ? "merged" : (pr.state.toLowerCase() as "open" | "closed"),
      head: pr.headRefName,
      base: pr.baseRefName,
      draft: pr.isDraft,
      labels: pr.labels.map((l) => l.name),
      assignees: pr.assignees.map((a) => a.login),
      reviewers: pr.reviewRequests.map((r) => r.login),
      createdAt: pr.createdAt,
      updatedAt: pr.updatedAt,
      mergedAt: pr.mergedAt,
    }));
  } catch {
    return [];
  }
}

// ============================================
// Projects (v2)
// ============================================

/**
 * Get project items for an issue
 */
export function getProjectItems(
  issueNumber: number
): GitHubProjectItem[] {
  try {
    // This requires GraphQL, simplified version using gh CLI
    const result = ghJson<{
      projectItems: {
        nodes: {
          id: string;
          project: { number: number };
          content: { number: number; type: string };
          fieldValues: { nodes: { field: { name: string }; text?: string }[] };
        }[];
      };
    }>(`issue view ${issueNumber} --json projectItems`);

    return result.projectItems.nodes.map((item) => ({
      id: item.id,
      contentId: item.content.number,
      contentType: item.content.type as "Issue" | "PullRequest",
      fields: Object.fromEntries(
        item.fieldValues.nodes
          .filter((f) => f.text)
          .map((f) => [f.field.name, f.text])
      ),
    }));
  } catch {
    return [];
  }
}

// ============================================
// Releases
// ============================================

/**
 * Create a new release
 */
export function createRelease(params: {
  tag: string;
  title: string;
  notes?: string;
  draft?: boolean;
  prerelease?: boolean;
  target?: string;
}): boolean {
  try {
    const args = [`release create ${params.tag} --title "${params.title}"`];

    if (params.notes) args.push(`--notes "${params.notes}"`);
    if (params.draft) args.push("--draft");
    if (params.prerelease) args.push("--prerelease");
    if (params.target) args.push(`--target ${params.target}`);

    gh(args.join(" "));
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate release notes
 */
export function generateReleaseNotes(params: {
  tag: string;
  previousTag?: string;
}): string {
  try {
    const args = [`release create ${params.tag} --generate-notes --dry-run`];
    if (params.previousTag) {
      args.push(`--notes-start-tag ${params.previousTag}`);
    }

    return gh(args.join(" "));
  } catch {
    return "";
  }
}
