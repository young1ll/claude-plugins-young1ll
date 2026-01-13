#!/bin/bash
# Session end hook: Save session summary to SQLite and activity log
# LEVEL_1 Implementation - Hierarchical Summarization (L0-L3)

set -e

# Configuration
PM_DIR="${PROJECT_ROOT:-.}/.claude"
ACTIVITY_LOG="$PM_DIR/pm-activity.log"
PM_DB="$PM_DIR/pm.db"
SESSION_ID="${CLAUDE_SESSION_ID:-$(date +%Y%m%d_%H%M%S)}"

# Ensure directory exists
mkdir -p "$PM_DIR"

# Get current timestamp
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
ISO_TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

# Get git status summary
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "N/A")
GIT_COMMITS_TODAY=$(git log --oneline --since="today" 2>/dev/null | wc -l | tr -d ' ')
GIT_LAST_COMMIT=$(git log -1 --pretty=format:'%h %s' 2>/dev/null || echo "N/A")

# Get commits in this session (last 2 hours)
RECENT_COMMITS=$(git log --since="2 hours ago" --format="%h|%s" 2>/dev/null | head -10 || echo "")

# Parse branch for task context
TASK_ID=""
if [[ "$GIT_BRANCH" =~ ^([0-9]+)-([a-z]+)-(.+)$ ]]; then
    TASK_ID="${BASH_REMATCH[1]}"
elif [[ "$GIT_BRANCH" =~ ^([a-f0-9]{8})-([a-z]+)-(.+)$ ]]; then
    TASK_ID="${BASH_REMATCH[1]}"
fi

# Create session summary entry in activity log
cat >> "$ACTIVITY_LOG" << EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PM Session Summary (L3)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Session ID: $SESSION_ID
Timestamp: $TIMESTAMP

Git Status:
   Branch: $GIT_BRANCH
   Task: ${TASK_ID:-N/A}
   Commits today: $GIT_COMMITS_TODAY
   Last commit: $GIT_LAST_COMMIT

Recent Activity:
$(echo "$RECENT_COMMITS" | while IFS='|' read -r sha msg; do
    [ -n "$sha" ] && echo "   - $sha: $msg"
done)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF

# Save to SQLite if database exists
if [ -f "$PM_DB" ]; then
    SUMMARY_CONTENT=$(cat << EOFCONTENT
Branch: $GIT_BRANCH
Task: ${TASK_ID:-N/A}
Commits: $GIT_COMMITS_TODAY
Last: $GIT_LAST_COMMIT
EOFCONTENT
)

    sqlite3 "$PM_DB" << EOFSQL
INSERT INTO session_summaries (session_id, summary_level, content, created_at)
VALUES ('$SESSION_ID', 3, '$SUMMARY_CONTENT', '$ISO_TIMESTAMP');
EOFSQL
fi

echo "Session summary saved"
echo "  Log: $ACTIVITY_LOG"
[ -f "$PM_DB" ] && echo "  DB: $PM_DB"
