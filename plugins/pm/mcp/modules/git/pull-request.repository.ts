import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../core/database/database.service.js';
import { CreatePullRequestDto } from './dto/create-pull-request.dto.js';
import { UpdatePRStatusDto } from './dto/update-pr-status.dto.js';

export interface PullRequest {
  id: number;
  task_id: string;
  number: number;
  title: string;
  status: 'open' | 'merged' | 'closed';
  repo: string | null;
  url: string | null;
  merged_at: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class PullRequestRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  create(dto: CreatePullRequestDto): PullRequest {
    const db = this.databaseService.getManager();

    db.execute(
      `INSERT INTO pull_requests (task_id, number, title, repo, url)
       VALUES (?, ?, ?, ?, ?)`,
      [dto.taskId, dto.number, dto.title, dto.repo || null, dto.url || null]
    );

    // Get the last inserted row
    const result = db.queryOne<{ id: number }>(
      'SELECT last_insert_rowid() as id'
    );

    return this.getById(result!.id)!;
  }

  getById(id: number): PullRequest | undefined {
    const db = this.databaseService.getManager();
    return db.queryOne<PullRequest>(
      'SELECT * FROM pull_requests WHERE id = ?',
      [id]
    );
  }

  getByTask(taskId: string): PullRequest[] {
    const db = this.databaseService.getManager();
    return db.query<PullRequest>(
      'SELECT * FROM pull_requests WHERE task_id = ? ORDER BY created_at DESC',
      [taskId]
    );
  }

  getByNumber(number: number, repo?: string): PullRequest | undefined {
    const db = this.databaseService.getManager();

    if (repo) {
      return db.queryOne<PullRequest>(
        'SELECT * FROM pull_requests WHERE number = ? AND repo = ?',
        [number, repo]
      );
    }

    return db.queryOne<PullRequest>(
      'SELECT * FROM pull_requests WHERE number = ?',
      [number]
    );
  }

  list(taskId?: string, status?: string): PullRequest[] {
    const db = this.databaseService.getManager();

    if (taskId && status) {
      return db.query<PullRequest>(
        'SELECT * FROM pull_requests WHERE task_id = ? AND status = ? ORDER BY created_at DESC',
        [taskId, status]
      );
    }

    if (taskId) {
      return db.query<PullRequest>(
        'SELECT * FROM pull_requests WHERE task_id = ? ORDER BY created_at DESC',
        [taskId]
      );
    }

    if (status) {
      return db.query<PullRequest>(
        'SELECT * FROM pull_requests WHERE status = ? ORDER BY created_at DESC',
        [status]
      );
    }

    return db.query<PullRequest>(
      'SELECT * FROM pull_requests ORDER BY created_at DESC'
    );
  }

  updateStatus(dto: UpdatePRStatusDto): PullRequest | undefined {
    const db = this.databaseService.getManager();

    db.execute(
      `UPDATE pull_requests
       SET status = ?, merged_at = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [dto.status, dto.mergedAt || null, dto.id]
    );

    return this.getById(dto.id);
  }
}
