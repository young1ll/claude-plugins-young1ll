# done

Small, finished Claude Code plugins. Each one does its job and gets out of the way.

## Plugins

| Plugin | What it does |
| --- | --- |
| [parallel-session-workflow](./plugins/parallel-session-workflow) | Run several Claude Code sessions on one git repository without them colliding. |

## Install

```
/plugin marketplace add young1ll/done
/plugin install parallel-session-workflow@done
```

## parallel-session-workflow

Two agent sessions editing one checkout is a quiet failure mode: one session's `git reset` rewinds
another's commit, a shared staging area swallows files, `git stash pop` restores someone else's work.
This skill gives a session the procedure to avoid that.

It covers:

- **Detecting parallel mode** — when to treat the environment as shared.
- **Worktree isolation** — entering one, picking the right base branch, and what a fresh worktree is
  missing (dependencies, untracked env files).
- **Cross-session messaging** — what to send, and why a sibling's message is never permission to
  bypass a check.
- **Shared-file rules** — lockfiles, CI config, and migrations need an owner, not a conversation.
- **Finish sequence** — rebase onto the integration branch, hand off, clean up.
- **Recovery** — worktree removal, rebase conflicts, and the shared stash stack.

The skill activates on its own when a session detects sibling sessions, or you can invoke it by name.
It assumes Claude Code tools (`ListAgents`, `SendMessage`, `EnterWorktree`). Without them the content
still reads as a checklist.

## License

MIT
