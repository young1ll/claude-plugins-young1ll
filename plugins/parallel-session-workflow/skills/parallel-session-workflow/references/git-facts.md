# Git facts under parallel sessions

Properties of git itself, not of any agent or harness. They hold whichever tool you drive them with,
and they outlive tool names — when the surrounding procedures rot, this file should not.

Scope split with the sibling references:

- **this file** — what is shared no matter which mode you are in, and how to recover
- `shared-checkout.md` — mode B mechanics (index sweep, lock collision, branch switching)
- the **session-landing** skill's `remote-conflicts.md` — anything involving the remote

## What a worktree does not isolate

A worktree isolates the working tree, the index and HEAD. Everything else in `.git` is one shared
store:

| Shared | Consequence |
| --- | --- |
| object store | a sibling's commits are readable from your worktree immediately, no network |
| all branch refs | `git log <sibling-branch>` works; so does accidentally moving it |
| remote-tracking refs | a sibling's `git fetch` moves *your* `origin/<branch>` under you |
| `refs/stash` | one stack for the whole repository (below) |
| reflog | your rescue path, and theirs |
| config | `git config` writes are repo-wide |

Two practical consequences:

- You can inspect what a sibling's branch touches with no network and no messaging:
  `git diff --name-only <base>...<sibling-branch>`
- `git fetch` is not a read. It mutates refs every session shares, and it advances the baseline that
  a sibling's `--force-with-lease` compares against. See `remote-conflicts.md`.

## One branch, one checkout

Git refuses to check the same branch out twice:

```
$ git worktree add ../wt develop
fatal: 'develop' is already used by worktree at '/…/console'
```

So mode B (N sessions on one branch) cannot be faked with worktrees, and mode A guarantees one owner
per branch for free. Use `--detach` only if you know why you want a detached HEAD.

## The stash stack is shared

`refs/stash` is a single ref for the whole repository. Observed: an entry stashed in one worktree
appears in a sibling's `git stash list`, and the sibling's `git stash pop` applies it onto *its*
branch and empties the stack for the original owner.

Prefer a temporary WIP commit — it is per-branch, and it is what a `FROZEN` reply should point at.
If you must stash:

```bash
git stash push -u -m "<unique-tag>"
git stash list --format='%H %gs'   # capture your entry's SHA immediately
git stash apply <sha>              # apply, never pop
```

Then drop the entry by re-finding its current `stash@{n}` by tag.

## Did HEAD advance, or was it rewound?

The single test that separates a sibling's normal progress from an incident. It needs a SHA you
recorded earlier, so record one after every commit you make:

```bash
git rev-parse HEAD                                 # record this
git merge-base --is-ancestor <recorded-sha> HEAD
#   exit 0  → still reachable from HEAD. Either unchanged, or a sibling built on top. Normal.
#   exit 1  → no longer an ancestor. Someone rewound over it. Incident.
```

A commit is an ancestor of itself, so exit 0 alone does not mean anything moved — verified on git
2.50.1: `git merge-base --is-ancestor $H $H` exits 0. Compare the SHAs to see *whether* HEAD moved;
use the ancestor check to see whether the move was safe.

Before you rewind anything yourself (`reset`, `rebase -i`, `commit --amend`), prove the range is
yours:

```bash
git log --oneline -5     # compare against the SHAs you recorded this session
```

If any commit in range is not one you created in this session, stop and ask. If it may already be
pushed, do not rewind at all — a message typo is not worth the risk.

## Recovery

### A commit disappeared

Someone rewound over it. It survives in the reflog until gc:

```bash
git reflog --date=iso | head -30
git branch rescue/<name> <sha>     # park it before doing anything else
```

Park first, diagnose second. The reflog is shared, so a sibling's later operations can bury it
further.

### `index.lock` exists

Another session is mid-write. Wait and retry — this is normal contention, not corruption.

Delete the lock only after confirming no sibling is running, and then check what the failed command
left behind: a losing `git add` stages nothing, so its files are still unstaged and a later
`git commit -m …` will silently omit them.

### Rebase conflict

```bash
git status
git diff --name-only --diff-filter=U
git rebase --continue
git rebase --abort   # returns to the pre-rebase state; then ask the user
```

`--abort` is always safe; guessing at someone else's conflict resolution is not.

### Worktree records out of sync

```bash
git worktree list
git worktree prune                # drop records for directories that are gone
git worktree remove <path>        # --force only with user approval
```

`prune` only removes records for directories that no longer exist; it never deletes work.
