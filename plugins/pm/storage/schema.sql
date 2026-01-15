-- PM Plugin SQLite Schema (Simplified)
-- Event Sourcing + CQRS Pattern
--
-- Focus: Local Task → GitHub Issue → GitHub Project workflow

-- ============================================
-- Core Tables (Event Store)
-- ============================================

-- Events table (append-only, immutable)
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id TEXT UNIQUE NOT NULL,           -- UUID
    event_type TEXT NOT NULL,                -- TaskCreated, TaskStatusChanged, etc.
    aggregate_type TEXT NOT NULL,            -- task, project
    aggregate_id TEXT NOT NULL,              -- Entity ID
    payload TEXT NOT NULL,                   -- JSON payload
    metadata TEXT,                           -- JSON metadata (user, source, etc.)
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    version INTEGER NOT NULL DEFAULT 1       -- Optimistic concurrency
);

CREATE INDEX IF NOT EXISTS idx_events_aggregate ON events(aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);

-- ============================================
-- Read Models (Projections)
-- ============================================

-- Projects
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'active',            -- active, archived, completed
    settings TEXT,                           -- JSON: GitHub config, etc.
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    seq INTEGER,                             -- Project-scoped numeric ID (e.g., #42)
    project_id TEXT NOT NULL REFERENCES projects(id),
    parent_id TEXT REFERENCES tasks(id),     -- Subtask support
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'todo',              -- todo, in_progress, in_review, done, blocked
    priority TEXT DEFAULT 'medium',          -- critical, high, medium, low
    type TEXT DEFAULT 'task',                -- epic, story, task, bug, subtask

    -- Estimation
    estimate_points INTEGER,                 -- Story points
    estimate_hours REAL,                     -- Time estimate
    actual_hours REAL,                       -- Time spent

    -- Metadata
    assignee TEXT,
    labels TEXT,                             -- JSON array
    due_date TEXT,
    blocked_by TEXT,                         -- Blocker description

    -- Git Integration
    branch_name TEXT,
    linked_commits TEXT,                     -- JSON array of commit SHAs
    linked_prs TEXT,                         -- JSON array of PR numbers

    -- GitHub Integration
    github_issue_number INTEGER,             -- GitHub issue #
    github_issue_url TEXT,
    github_project_item_id TEXT,             -- GitHub Projects V2 item ID

    -- Timestamps
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    started_at TEXT,
    completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_project_seq ON tasks(project_id, seq);
CREATE INDEX IF NOT EXISTS idx_tasks_github_issue ON tasks(github_issue_number);

-- ============================================
-- GitHub Integration
-- ============================================

-- Project Config (GitHub integration settings)
CREATE TABLE IF NOT EXISTS project_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL REFERENCES projects(id),
    github_enabled BOOLEAN DEFAULT 0,            -- GitHub sync ON/OFF
    github_repo TEXT,                            -- owner/repo
    github_project_id TEXT,                      -- GitHub Projects V2 ID
    github_project_number INTEGER,               -- GitHub Projects V2 number
    field_mappings TEXT,                         -- JSON: status field mappings
    status_options TEXT,                         -- JSON: allowed statuses
    sync_mode TEXT DEFAULT 'manual',             -- manual, auto
    last_sync_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(project_id)
);

-- ============================================
-- Views for Common Queries
-- ============================================

-- Task Board View
CREATE VIEW IF NOT EXISTS v_task_board AS
SELECT
    t.id,
    t.seq,
    t.title,
    t.status,
    t.priority,
    t.type,
    t.estimate_points,
    t.assignee,
    t.due_date,
    t.blocked_by,
    t.github_issue_number,
    p.name AS project_name
FROM tasks t
LEFT JOIN projects p ON t.project_id = p.id
ORDER BY
    CASE t.priority
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
    END,
    t.created_at DESC;

-- ============================================
-- Triggers for Auto-Update
-- ============================================

-- Update task updated_at on change
CREATE TRIGGER IF NOT EXISTS tr_tasks_updated
AFTER UPDATE ON tasks
BEGIN
    UPDATE tasks SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- Update project updated_at on change
CREATE TRIGGER IF NOT EXISTS tr_projects_updated
AFTER UPDATE ON projects
BEGIN
    UPDATE projects SET updated_at = datetime('now') WHERE id = NEW.id;
END;
