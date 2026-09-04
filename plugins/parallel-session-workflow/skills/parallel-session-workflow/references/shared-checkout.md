# Mode B — shared checkout

Several sessions, one directory, one branch. Some projects run this way deliberately: the user wants
one branch to be the single window on progress, and sub-branches break that view. It is a legitimate
mode, but nothing in git protects you — every safeguard here is procedural.

## What is actually shared

| Shared state | What a careless command does to a sibling |
| --- | --- |
| working tree | `git checkout` / `git switch` / `git restore` rewrites files under a sibling mid-edit |
| **index (staging area)** | your `git commit` sweeps in whatever a sibling has staged but not committed |
| `.git/index.lock` | two concurrent git writes — one fails and stages nothing |
| HEAD and branch ref | `git reset` / `rebase` / `amend` rewinds a sibling's commits |
| stash stack | `git stash pop` restores a sibling's work into the tree |
| remote-tracking refs | a sibling's `git fetch` moves your `origin/<branch>` under you |
| reflog | your only recovery log, and it is shared |

## The index sweep (the one that bites quietly)

`git add <path>` does not scope your commit. The index is one object per repository, so a commit with
no pathspec commits *everything* staged, including a sibling's.

Observed:

```
# sibling staged f4, f5 and has not committed yet
git add f6.txt
git commit -m "session1: only f6"
#  f4.txt | 1 +
#  f5.txt | 1 +
#  f6.txt | 1 +      ← three files in a commit that claimed one
```

The fix is a pathspec on `commit`, not just on `add`:

```bash
git add <my paths> && git commit -m "…" -- <my paths>
```

Observed with the same setup: only `f6.txt` was committed, and the sibling's `f4`/`f5` were still
staged afterwards, intact.

Two details:

- The `--` form only accepts paths git already knows, so a **new** file still needs `git add` first.
  `git add` then `git commit -- <same paths>` is the safe pair for both new and modified files.
- A pathspec commit ignores the index for those paths and takes the working-tree content. That is
  what you want here; it also means a partially staged hunk (`git add -p`) is not honoured. Do not
  use `git add -p` in this mode.

Never `git add -A`, `git add .`, or `git commit -a` in a shared checkout.

## The lock collision

Two git write commands at once:

```
fatal: Unable to create '.../.git/index.lock': File exists.
```

The losing command stages nothing, so its files stay untracked or unstaged while the winning commit
goes through and looks fine. Rules:

- Never issue two git write commands in parallel Bash calls, even for unrelated paths.
- Never build two commits in one parallel batch — ordering scrambles too.
- If you hit the lock, wait, retry, then verify with `git status --short` what was actually left
  behind before assuming your work landed.

## Rewinding is the incident that actually happens

The recorded failure: a session ran `git reset --soft HEAD~2` to reword its own commit, but a sibling
had stacked a commit on top and already pushed it — the reset rewound the sibling's work too.

Before any `reset`, `rebase -i`, or `commit --amend`:

```bash
git rev-parse HEAD                 # record this after every commit you make
git log --oneline -5               # every SHA in the rewind range must be one of yours
git log --oneline @{u}..           # anything NOT here is already pushed — never rewind it
```

If the range contains a SHA you did not create this session, stop. A commit-message typo is not worth
it — leave it.

Recovery, if it already happened:

```bash
git pull --rebase --autostash      # if the lost commits were already on the remote
git reflog --date=iso | head -30   # otherwise find them here
git branch rescue/<name> <sha>     # park before doing anything else
```

## Working rules

1. **One branch, no switching.** Do not `git checkout`/`switch`; you would move every sibling's tree.
2. **Own paths, not files-in-general.** Announce your paths, and never edit a file showing as `M` that
   you did not modify — it is a sibling's in-flight work.
3. **Stage and commit by path.** `git add <paths> && git commit -m "…" -- <paths>`.
4. **Serialize.** One git write at a time, sequentially.
5. **Verify before rewinding.** SHA check, every time.
6. **Commit often.** An uncommitted change in a shared tree is the most fragile thing in the repo —
   it lives in state any sibling can overwrite.
7. **Prefer a WIP commit to a stash.** The stash stack is shared; a WIP commit is yours.
8. **Push is the user's call**, and one session at a time — see the session-landing skill.

## Pre-flight snippet

Run before your first write in a shared checkout:

```bash
git branch --show-current                    # expected branch?
git status --short                           # whose in-flight edits are already here?
git log --oneline -3                         # who committed last?
git rev-list --left-right --count @{u}...HEAD  # <behind> <ahead> vs the remote
```

Anything in `git status --short` that you did not create belongs to a sibling. Leave it alone, and do
not let it into your commit.
