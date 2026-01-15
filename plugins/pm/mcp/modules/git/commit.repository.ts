import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../core/database/database.service.js';
import { CreateCommitDto } from './dto/create-commit.dto.js';
import { ListCommitsDto } from './dto/list-commits.dto.js';

export interface Commit {
  sha: string;
  task_id: string | null;
  message: string;
  author: string | null;
  branch: string | null;
  repo: string | null;
  created_at: string;
}

@Injectable()
export class CommitRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  create(dto: CreateCommitDto): Commit {
    const db = this.databaseService.getManager();

    db.execute(
      `INSERT INTO commits (sha, task_id, message, author, branch, repo)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(sha) DO UPDATE SET
         task_id = excluded.task_id,
         message = excluded.message,
         author = excluded.author,
         branch = excluded.branch,
         repo = excluded.repo`,
      [
        dto.sha,
        dto.taskId || null,
        dto.message,
        dto.author || null,
        dto.branch || null,
        dto.repo || null,
      ]
    );

    return this.getBySha(dto.sha)!;
  }

  getBySha(sha: string): Commit | undefined {
    const db = this.databaseService.getManager();
    return db.queryOne<Commit>('SELECT * FROM commits WHERE sha = ?', [sha]);
  }

  getByTask(taskId: string): Commit[] {
    const db = this.databaseService.getManager();
    return db.query<Commit>(
      'SELECT * FROM commits WHERE task_id = ? ORDER BY created_at DESC',
      [taskId]
    );
  }

  getByBranch(branch: string): Commit[] {
    const db = this.databaseService.getManager();
    return db.query<Commit>(
      'SELECT * FROM commits WHERE branch = ? ORDER BY created_at DESC',
      [branch]
    );
  }

  list(dto: ListCommitsDto): Commit[] {
    const db = this.databaseService.getManager();

    if (dto.taskId) {
      return db.query<Commit>(
        'SELECT * FROM commits WHERE task_id = ? ORDER BY created_at DESC LIMIT ?',
        [dto.taskId, dto.limit || 50]
      );
    }

    if (dto.branch) {
      return db.query<Commit>(
        'SELECT * FROM commits WHERE branch = ? ORDER BY created_at DESC LIMIT ?',
        [dto.branch, dto.limit || 50]
      );
    }

    return db.query<Commit>(
      'SELECT * FROM commits ORDER BY created_at DESC LIMIT ?',
      [dto.limit || 50]
    );
  }

  search(query: string, limit: number = 50): Commit[] {
    const db = this.databaseService.getManager();
    const pattern = `%${query}%`;

    return db.query<Commit>(
      `SELECT * FROM commits
       WHERE message LIKE ? OR author LIKE ? OR sha LIKE ?
       ORDER BY created_at DESC LIMIT ?`,
      [pattern, pattern, pattern, limit]
    );
  }
}
