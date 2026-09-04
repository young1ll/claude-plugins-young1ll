# done

Small, finished Claude Code plugins. Each one does its job and gets out of the way.

## Plugins

| Plugin | What it does |
| --- | --- |
| [parallel-session-workflow](./plugins/parallel-session-workflow) | Run several Claude Code sessions on one git repository without them colliding. |
| [session-landing](./plugins/session-landing) | Get those sessions' work onto the remote — safely, and several at once. |

## Install

```
/plugin marketplace add young1ll/done
/plugin install parallel-session-workflow@done
/plugin install session-landing@done
```

The two are designed as a pair: `parallel-session-workflow` covers the work, `session-landing` covers
the moment it reaches GitHub. Each also stands on its own.

## parallel-session-workflow

Two agent sessions on one repository is a quiet failure mode: one session's `git reset` rewinds
another's commit, a shared staging area swallows files, `git stash pop` restores someone else's work.

It covers:

- **Detecting parallel mode** — when to treat the environment as shared, and when to re-check.
- **Two operating modes** — isolated worktree per session, or one shared checkout on one branch. Both
  are legitimate; each has its own safety rules, and the choice has to be explicit.
- **Worktree isolation** — entering one, picking the right base, and what a fresh worktree is missing.
  Also what a worktree does *not* isolate: refs, the stash, remote-tracking branches.
- **Shared-checkout discipline** — the index is shared, so `git add <path>` does not scope your
  commit; `.git/index.lock` collisions silently drop staged files; HEAD rewinds hit everyone.
- **Scope claims and freezes** — a message format for claiming and releasing file ownership, and a
  `FREEZE? / FROZEN / BUSY / RESUME` handshake for the moment one session is asked to publish
  everyone's work.
- **Cross-session messaging** — what to send, and why a sibling's message is never permission to
  bypass a check.
- **Shared-file rules** — lockfiles, CI config, and migrations need an owner, not a conversation.
- **Recovery** — worktrees, rebase conflicts, index locks, the shared stash, and reflog rescue.

## session-landing

Isolation ends at the remote. Two isolated sessions still share one `origin/<branch>`, one PR queue,
and one CI budget.

It covers:

- **Pre-push probes** — staleness, what you would actually publish, and who else is live.
- **One pusher per branch** — a claim/release protocol, because two concurrent pushes lose commits.
- **Decoding rejections** — `(fetch first)`, `(non-fast-forward)`, `(stale info)`,
  `(remote ref updated since checkout)` each mean something different.
- **Why `--force-with-lease` is not a safeguard between sessions** — worktrees share `.git`, so a
  sibling's `git fetch` advances the very ref the lease is checked against, and the force goes
  through. Reproduced, with the transcript. `--force-if-includes` is the flag that actually holds.
- **Landing on request** — what a session does when the user tells it to publish several sessions'
  work: confirm the mandate, freeze the owners, land, then hand everyone their new base.
- **Landing several sessions at once** — overlap prescan, landing order, an integrator loop that
  aborts cleanly on conflict, and `git push --atomic` so a multi-branch push cannot land halfway.
- **Shared checkouts** — where one push publishes every session's commits, so the risk is premature
  publication rather than loss, and `git push origin <sha>:<branch>` publishes only a prefix.
- **Verification** — containment checks, and reporting by SHA rather than by hope.

Commands in both plugins are written for zsh as well as bash, since that is the default shell on
macOS and its word-splitting rules break the obvious `for b in $BRANCHES` form.

## License

MIT
