import { Injectable } from '@nestjs/common';
import * as github from '../../../lib/github.js';

@Injectable()
export class GitHubService {
  // Authentication
  isAuthenticated(): boolean {
    return github.isAuthenticated();
  }

  getRepoInfo() {
    return github.getRepoInfo();
  }

  // Issues
  createIssue(params: { title: string; body?: string; labels?: string[] }) {
    return github.createIssue(params);
  }

  getIssue(issueNumber: number) {
    return github.getIssue(issueNumber);
  }

  listIssues(filters?: { state?: 'open' | 'closed' | 'all'; labels?: string[] }) {
    return github.listIssues(filters);
  }

  updateIssueState(issueNumber: number, state: 'open' | 'closed') {
    return github.updateIssueState(issueNumber, state);
  }

  addIssueComment(issueNumber: number, body: string) {
    return github.addIssueComment(issueNumber, body);
  }

  // Pull Requests
  createPR(params: {
    title: string;
    body?: string;
    head: string;
    base?: string;
    draft?: boolean;
  }) {
    return github.createPR(params);
  }

  getPR(prNumber: number) {
    return github.getPR(prNumber);
  }

  listPRs(filters?: { state?: 'open' | 'closed' | 'all' }) {
    return github.listPRs(filters);
  }

  // Projects
  getProjectItems(projectNumber: number) {
    return github.getProjectItems(projectNumber);
  }

  // Releases
  createRelease(params: { tag: string; title: string; notes?: string }) {
    return github.createRelease(params);
  }

  generateReleaseNotes(params: { tag: string; previousTag?: string }) {
    return github.generateReleaseNotes(params);
  }
}
