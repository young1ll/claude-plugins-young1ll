# Remote conflicts between sessions

Everything here was reproduced against git 2.50.1 with a bare remote, one clone, and a sibling
worktree sharing the same `.git`.

## Why `--force-with-lease` is not a safeguard here

`--force-with-lease` compares the remote's current tip against **your local
`refs/remotes/origin/<branch>`**. It assumes that ref reflects what *you* last saw. In a
multi-session repository that assumption is false: worktrees share one `.git`, so any sibling's
`git fetch` updates that ref for every session at once.

Reproduced — session A never ran a git command between the two probes:

```
A's view of origin/develop BEFORE sibling fetch: f3cde6e
>> sibling worktree runs: git fetch origin
A's view of origin/develop AFTER  sibling fetch: 743acef   (A did nothing)

$ git push --force-with-lease origin develop
 + 743acef...ac92a12 develop -> develop (forced update)
```

`743acef` was another clone's commit `C1`, already pushed. The lease "passed" — it compared 743acef
to 743acef — and the force deleted C1 from the remote.

Same starting state, with `--force-if-includes` added:

```
$ git push --force-with-lease --force-if-includes origin develop
 ! [rejected]        develop -> develop (remote ref updated since checkout)
hint: Updates were rejected because the tip of the remote-tracking branch has
hint: been updated since the last checkout.
```

`--force-if-includes` additionally requires that your local commits were built on top of the
remote-tracking tip you actually observed. `git push --help` describes it in exactly these terms — it
verifies "if updates from the remote-tracking refs that may have been **implicitly updated in the
background** are integrated locally before allowing a forced update". A sibling's `git fetch` is that
background update, and it cannot manufacture the integration the flag checks for.

If your git does not list `--force-if-includes` in `git push --help`, it is too old for this
protection: do not force at all in a multi-session repository.

**Rule:** if the user approved a force on your own unshared branch, always
`--force-with-lease --force-if-includes`. On a branch anyone else uses, no force at all.

## Decoding rejections

Plain non-fast-forward push, remote ahead:

```
 ! [rejected]        develop -> develop (fetch first)
hint: Updates were rejected because the remote contains work that you do not
hint: have locally. This is usually caused by another repository pushing to
hint: the same ref.
```

- `(fetch first)` — you never fetched the remote's newer commits.
- `(non-fast-forward)` — you have fetched; your branch genuinely diverged. Rebase.
- `(stale info)` — your remote-tracking ref lags the real remote. Fetch and retry.
- `(remote ref updated since checkout)` — `--force-if-includes` blocked a destructive force. Never
  retry this by dropping the flag.
- `(atomic push failed)` — another ref in the same push was rejected; nothing was applied.

## Rebase-and-retry

```bash
git push origin <branch> || (git pull --rebase --autostash && git push origin <branch>)
```

- `--rebase` keeps history linear and avoids merge commits nobody asked for.
- `--autostash` handles the uncommitted change you forgot; it stashes and restores around the rebase.
  In a **shared checkout** that stash briefly holds the whole tree, including siblings' edits — commit
  first and skip `--autostash` there if you can.
- Retry once. A second rejection means a sibling is actively pushing: message them, do not loop.

## Two sessions pushing the same branch

The remote serialises, so nothing is corrupted — but the loser's push is rejected, and if it then
rebases and pushes, CI runs twice and the two sessions' commits interleave in an order neither
intended. Prevention is a claim, not a retry:

```
PUSHING <session>  → origin/develop : 3 commits (32f00cc24..HEAD)
PUSHED  <session>  → origin/develop @ 9feba0b99
```

Between those two messages, no other session pushes that branch.

## Staleness probes

```bash
git fetch origin
git status -sb | head -1                        # "## develop...origin/develop [ahead 3]"
git rev-list --left-right --count @{u}...HEAD   # "<behind>  <ahead>"
git log --oneline HEAD..@{u}                    # commits on the remote you don't have
git log --oneline @{u}..HEAD                    # commits you'd publish
```

`git fetch` is safe to run at any time and mutates nothing but remote-tracking refs — except that in
a shared `.git` it also moves every sibling's view. Harmless on its own; it is what defeats the lease
above.

## Pull styles

| Command | Result | Use |
| --- | --- | --- |
| `git fetch` + inspect + `git rebase origin/<b>` | you see what arrives before applying it | default in parallel mode |
| `git pull --rebase` | same, in one step | when you already probed |
| `git pull` (merge) | merge commit on a shared branch | avoid; noisy history |
| `git pull --rebase --autostash` | also handles dirty tree | retry path; careful in shared checkouts |

Never `git pull` in a shared checkout while a sibling has uncommitted work — the merge or rebase
touches files they are holding.
