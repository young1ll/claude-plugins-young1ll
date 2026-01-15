import { Injectable } from '@nestjs/common';
import { CommitRepository } from './commit.repository.js';
import { PullRequestRepository } from './pull-request.repository.js';
import { CreateCommitDto } from './dto/create-commit.dto.js';
import { ListCommitsDto } from './dto/list-commits.dto.js';
import { CreatePullRequestDto } from './dto/create-pull-request.dto.js';
import { LinkPullRequestDto } from './dto/link-pull-request.dto.js';
import { UpdatePRStatusDto } from './dto/update-pr-status.dto.js';
import * as git from '../../../lib/git.js';

@Injectable()
export class GitService {
  constructor(
    private readonly commitRepository: CommitRepository,
    private readonly prRepository: PullRequestRepository
  ) {}

  // Git utility methods (wrapping lib/git.ts)
  getStatus() {
    return git.getGitStatus();
  }

  getCurrentBranch() {
    return git.getCurrentBranch();
  }

  getRecentCommits(limit: number = 10) {
    return git.getRecentCommits(limit);
  }

  getUnpushedCommits() {
    return git.getUnpushedCommits();
  }

  getCommitStats(from?: string, to?: string) {
    return git.getCommitStats(from, to);
  }

  getHotspots(limit: number = 10) {
    return git.getHotspots(limit);
  }

  parseCommitMessage(message: string) {
    return git.parseCommitMessage(message);
  }

  parseBranchName(branchName: string) {
    return git.parseBranchName(branchName);
  }

  // Commit tracking methods
  async trackCommit(dto: CreateCommitDto) {
    return this.commitRepository.create(dto);
  }

  async getCommit(sha: string) {
    const commit = this.commitRepository.getBySha(sha);
    if (!commit) {
      throw new Error(`Commit not found: ${sha}`);
    }
    return commit;
  }

  async listCommits(dto: ListCommitsDto) {
    return this.commitRepository.list(dto);
  }

  async searchCommits(query: string, limit?: number) {
    return this.commitRepository.search(query, limit);
  }

  // Pull Request tracking methods
  async createPullRequest(dto: CreatePullRequestDto) {
    return this.prRepository.create(dto);
  }

  async linkPullRequest(dto: LinkPullRequestDto) {
    // This would typically fetch PR info from GitHub API
    // For now, we just create a basic entry
    const pr = this.prRepository.getByNumber(dto.prNumber);
    if (pr) {
      throw new Error(`Pull request #${dto.prNumber} already linked`);
    }

    return this.prRepository.create({
      taskId: dto.taskId,
      number: dto.prNumber,
      title: `PR #${dto.prNumber}`, // Default title
    });
  }

  async listPullRequests(taskId?: string, status?: string) {
    return this.prRepository.list(taskId, status);
  }

  async getPullRequestStatus(prNumber: number, repo?: string) {
    const pr = this.prRepository.getByNumber(prNumber, repo);
    if (!pr) {
      throw new Error(`Pull request #${prNumber} not found`);
    }
    return pr;
  }

  async updatePullRequestStatus(dto: UpdatePRStatusDto) {
    return this.prRepository.updateStatus(dto);
  }
}
