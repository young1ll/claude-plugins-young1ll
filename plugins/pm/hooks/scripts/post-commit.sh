#!/bin/bash
# Post-commit hook: Link commit to task and process magic words
# LEVEL_1 Implementation - Git-First, Conventional Commits + Magic Words

set -e

# Get the last commit info
COMMIT_SHA=$(git rev-parse HEAD 2>/dev/null || echo "")
COMMIT_MSG=$(git log -1 --pretty=%B 2>/dev/null || echo "")
COMMIT_SUBJECT=$(git log -1 --pretty=%s 2>/dev/null || echo "")
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

if [ -z "$COMMIT_SHA" ]; then
    exit 0
fi

# Extract task ID from branch name
# LEVEL_1 format: {issue_number}-{type}-{description}
# Legacy format: PM-123-description
TASK_ID=""
BRANCH_TYPE=""
if [[ "$BRANCH" =~ ^([0-9]+)-([a-z]+)-(.+)$ ]]; then
    TASK_ID="${BASH_REMATCH[1]}"
    BRANCH_TYPE="${BASH_REMATCH[2]}"
elif [[ "$BRANCH" =~ ^([a-f0-9]{8})-([a-z]+)-(.+)$ ]]; then
    TASK_ID="${BASH_REMATCH[1]}"
    BRANCH_TYPE="${BASH_REMATCH[2]}"
elif [[ "$BRANCH" =~ ^([A-Z]+-[0-9]+) ]]; then
    TASK_ID="${BASH_REMATCH[1]}"
fi

# Parse Conventional Commit type
COMMIT_TYPE=""
if [[ "$COMMIT_SUBJECT" =~ ^([a-z]+)(\([^)]+\))?!?:\ (.+)$ ]]; then
    COMMIT_TYPE="${BASH_REMATCH[1]}"
fi

# Extract magic words from commit message
FIXES=$(echo "$COMMIT_MSG" | grep -oiE '(fixes?|closes?|resolves?)\s+#[0-9]+' | grep -oE '#[0-9]+' | tr -d '#' || echo "")
REFS=$(echo "$COMMIT_MSG" | grep -oiE '(refs?|relates?)\s+#[0-9]+' | grep -oE '#[0-9]+' | tr -d '#' || echo "")
WIP=$(echo "$COMMIT_MSG" | grep -oiE 'wip\s+#[0-9]+' | grep -oE '#[0-9]+' | tr -d '#' || echo "")
REVIEW=$(echo "$COMMIT_MSG" | grep -oiE 'review\s+#[0-9]+' | grep -oE '#[0-9]+' | tr -d '#' || echo "")

# Output for Claude to process
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PM Git Integration (LEVEL_1)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Commit: ${COMMIT_SHA:0:7}"
echo "Branch: $BRANCH"

if [ -n "$COMMIT_TYPE" ]; then
    echo "Type: $COMMIT_TYPE (Conventional Commits)"
fi

if [ -n "$TASK_ID" ]; then
    echo "Task ID (from branch): $TASK_ID"
fi

if [ -n "$FIXES" ]; then
    echo ""
    echo "Tasks to complete (fixes/closes):"
    for task in $FIXES; do
        echo "   -> #$task"
    done
fi

if [ -n "$REFS" ]; then
    echo ""
    echo "Tasks to link (refs):"
    for task in $REFS; do
        echo "   -> #$task"
    done
fi

if [ -n "$WIP" ]; then
    echo ""
    echo "Tasks marked WIP:"
    for task in $WIP; do
        echo "   -> #$task"
    done
fi

if [ -n "$REVIEW" ]; then
    echo ""
    echo "Tasks in review:"
    for task in $REVIEW; do
        echo "   -> #$task"
    done
fi

if [ -z "$TASK_ID" ] && [ -z "$FIXES" ] && [ -z "$REFS" ]; then
    echo ""
    echo "No task linking detected."
    echo "Tip: Use branch naming like '42-feat-feature-name'"
    echo "Or add 'refs #42' to commit message"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Note: Actual task status updates are done via MCP tools
# This script outputs information for Claude to process
