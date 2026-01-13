#!/bin/bash
# PM Plugin - Session Start Hook
# Loads context from previous session

set -e

# Get current git info
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "")

# Check for PM database
PM_DB="${REPO_ROOT}/.claude/pm.db"
HAS_DB="false"
if [ -f "$PM_DB" ]; then
  HAS_DB="true"
fi

# Output context info for Claude
cat << EOF
{
  "event": "session-start",
  "git": {
    "branch": "${BRANCH}",
    "root": "${REPO_ROOT}"
  },
  "pm": {
    "hasDb": ${HAS_DB},
    "dbPath": "${PM_DB}"
  },
  "actions": [
    "Load previous session summary if available",
    "Parse branch for task context",
    "Update active task status if needed"
  ]
}
EOF
