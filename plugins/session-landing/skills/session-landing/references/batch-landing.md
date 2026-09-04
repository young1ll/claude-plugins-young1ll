# Landing several sessions' work together

The situation: three or four sessions each finished a piece, and the user wants them on the remote
together — one review, one CI run, one coherent history.

Every snippet below is written with `set -- <branches>` and `"$@"` rather than a plain variable,
because on macOS the shell is zsh, which does **not** word-split `for b in $BRANCHES`. That form
passes the whole list to git as one argument and fails with `unknown revision or path`.

## Collection is free

Worktrees of one repository share the object store and the ref namespace. A sibling session's branch
is already a local ref: no fetch, no network, no remote at all.

```bash
git worktree list                                    # who exists, and where
git for-each-ref --format='%(refname:short)  %(objectname:short)  %(committerdate:relative)' refs/heads
git log --oneline <base>..<branch>                   # what a sibling's branch adds
git diff --name-only <base>...<branch>               # which files it touches
```

Verified: a branch created inside a sibling worktree is immediately visible and loggable from the
main checkout, with no network operation.

## Step 1 — prescan for overlap

Conflicts are predictable before you land anything. Intersect the changed-file sets:

```bash
BASE=develop
set -- feat/a feat/b feat/c

for b in "$@"; do git diff --name-only "$BASE...$b" | sed "s|^|$b |"; done \
  | awk '{c[$2]=c[$2]" "$1} END {for (f in c) if (split(c[f],x," ")>1) print f ":" c[f]}'
```

Each line printed is a file two or more branches both changed:

```
src/shared.ts: feat/a feat/b
```

Options, in order of preference:

1. The two owning sessions agree who lands first; the second rebases and resolves in its own
   worktree, where it has the context.
2. If the file is a shared file (lockfile, migration, CI config), its designated owner lands it first
   as its own commit.
3. If neither session can resolve it, stop and ask the user. Do not resolve a sibling's conflict by
   guessing at their intent.

Then check nothing is empty or already landed:

```bash
for b in "$@"; do
  printf '%s: %s commits' "$b" "$(git rev-list --count "$BASE..$b")"
  git merge-base --is-ancestor "$b" "$BASE" && printf '  (already contained in %s)' "$BASE"
  echo
done
```

## Step 2 — order

1. **Shared-file / migration / lockfile commits first.** One session owns them; landing them first
   means everyone else rebases onto them exactly once.
2. **Then lowest-overlap branches**, so most of the batch lands cleanly.
3. **Then the rest**, rebasing each onto the growing base.

## Pattern A — one integrator, one push

Best when the user reviews locally and wants linear history and a single CI run.

Done by **one** session (the integrator), in its own checkout, holding a `FROZEN <branch> @ <sha>`
from every owning session. Do not start the loop on a branch you have no `FROZEN` for — a session
that is idle in ListAgents can still be holding an uncommitted edit.

```bash
BASE=develop
set -- feat/shared-config feat/a feat/b        # ordered per Step 2

git fetch origin
git checkout "$BASE" && git rebase "origin/$BASE"

for b in "$@"; do
  git rebase -q "$BASE" "$b"
  if [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ]; then
    echo ">> CONFLICT in $b — stopping, ask the user"
    git rebase --abort; git checkout -q "$BASE"; break
  fi
  git checkout -q "$BASE"
  git merge --ff-only -q "$b" || { echo ">> $b would not fast-forward"; break; }
  echo "   landed $b -> $(git rev-parse --short HEAD)"
done

git log --oneline "origin/$BASE..HEAD"          # review the whole batch before publishing
git push origin "$BASE"                         # single push, single CI run
```

Verified end to end: two clean branches land, the third conflicts, the rebase is aborted and the tree
is left clean on `$BASE` with the first two still landed.

Why this shape:

- Rebasing each branch onto the moving base keeps history linear and surfaces conflicts one branch at
  a time, attributable to one session.
- The explicit `.git/rebase-merge` check is needed because `git rebase` on conflict leaves the repo
  mid-rebase; without the check the loop would continue on top of a broken state.
- `--ff-only` on the merge guarantees you never create a merge commit you did not intend.

If a branch fails: stop the loop and report which one. Do not `--force` past it, and do not silently
skip a branch to "get the rest in" — say exactly which branches landed and which did not.

## Pattern B — atomic multi-branch push

Best when each piece needs its own review and its own PR.

```bash
git push --atomic origin feat/a feat/b feat/c
```

`--atomic` is all-or-nothing. Verified with one stale branch in the set:

```
$ git push --atomic origin feat/p3 feat/p9
error: atomic push failed for ref refs/heads/feat/p3. status: 5
 ! [rejected]        feat/p3 -> feat/p3 (fetch first)
 ! [rejected]        feat/p9 -> feat/p9 (atomic push failed)
→ feat/p9 on the remote: absent
```

The same push without `--atomic` left the batch half-landed:

```
$ git push origin feat/p3 feat/p9
 * [new branch]      feat/p9 -> feat/p9
 ! [rejected]        feat/p3 -> feat/p3 (fetch first)
→ feat/p9 on the remote: present
```

A half-landed batch is worse than a failed one: reviewers see a partial set, and CI runs on a
combination nobody intended. Always `--atomic` for multi-ref pushes. Per `git push --help`: "Use an
atomic transaction on the remote side if available. Either all refs are updated, or on error, no refs
are updated. If the server does not support atomic pushes the push will fail." — so the failure mode
of an unsupporting server is a refused push, never a partial one.

Then one PR per branch, if the user asked for PRs:

```bash
for b in "$@"; do gh pr create --base "$BASE" --head "$b" --fill; done
```

## Pattern C — staging branch

Best when the batch must be reviewed as one unit but must not touch the integration branch yet.

```bash
git checkout -b "integration/$(date +%Y%m%d)-<topic>" "origin/$BASE"
# ...Pattern A's rebase + ff-merge loop, onto this branch instead of $BASE...
git push -u origin "integration/$(date +%Y%m%d)-<topic>"
gh pr create --base "$BASE" --fill
```

One PR, one CI run, and the integration branch stays untouched until the user merges.

## Step 3 — verify, then release

```bash
git fetch origin
for b in "$@"; do
  git merge-base --is-ancestor "$b" "origin/$BASE" \
    && echo "$b  landed" || echo "$b  NOT LANDED"
done
git log --oneline "origin/$BASE" | head -10
```

Report by SHA, then tell each owning session what landed and what its new base is:

```
LANDED origin/develop @ 9feba0b99 — feat/a, feat/b, feat/c
       rebase onto origin/develop before your next commit
```

Only after that: remove worktrees (`ExitWorktree` in the owning session, or `git worktree remove`),
and `git branch -d` the landed branches. `-d` refuses anything unmerged, which is exactly the check
you want; never `-D` without the user's approval.

## What not to do

- **No octopus merge** (`git merge b1 b2 b3`). It aborts on any conflict between branches, produces
  one opaque commit, and makes it hard to say which session's change broke what.
- **No cherry-picking to "just get it in".** It duplicates commits, and the original branch then
  conflicts with itself on its next rebase.
- **No landing on behalf of a session that is still writing.** Get its scope release first.
- **No force-push to make a batch fit.** If the base moved, rebase the batch again.
