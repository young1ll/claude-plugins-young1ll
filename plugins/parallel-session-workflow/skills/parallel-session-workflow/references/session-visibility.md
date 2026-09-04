# Session visibility

Two surfaces list sessions. They are built from different sources, they carry different
information, and neither is a boundary. Read this before you conclude "nobody else is here"
from a roster — that conclusion is the one this file exists to block.

Claude Code specific, and it is the harness layer: the git layer in `git-facts.md` depends on
none of it. Observed in the 2.1.x line; surfaces move. The rules survive the details.

## The two surfaces

| | `ListAgents` — the tool | the agents view — the UI |
| --- | --- | --- |
| Read by | you | the user |
| Gives an address to message | **yes** — this is its point | no |
| Reports each session's working directory | **no** | **yes** — grouping cycles `state → directory → group` |
| Membership | its own filter | four merged sources, filtered (below) |
| Acts on a session | send a message | attach, rename, stop, pin |

The user opens the view with `←` on an empty prompt (on by default; `/config` → "← opens
agents", and "Open agents view by default" makes it the start screen).

Neither surface is a superset of the other, and neither is a superset of the processes actually
running. A running `claude` need not be a row anywhere.

## Ask the user when you need a working directory

`ListAgents` does not report where each session is working, so it cannot answer *"who else is on
this repository"* — the question that decides whether you are in parallel mode with a particular
sibling. The git probe in the skill answers whether you are sharing; it does not produce names.

The agents view *does* carry the directory, and switching its grouping to `directory` is one
keystroke. So when names matter and the git probe is positive, ask:

> Two other sessions are live but I cannot see their working directories. Press `←` and group by
> directory — are either of them in this repository?

That is a better move than inferring repository membership from a peer list that carries none.
It also costs the user nothing when they are present, and when they are not you fall back to the
git probe and mode B rules, which never needed the names.

## What the agents view merges

Four sources, rendered as one roster:

- **local background jobs** — sessions this machine's daemon started and owns
- **adopted peers** — other *interactive* sessions on this machine
- **remote sessions** — cloud and Remote Control
- **pending** — sessions still starting

## Peer rows are filtered, and the filter is the trap

A sibling interactive session joins the roster only if **all** of these hold:

- it reports itself as interactive — a background job appears as a job row instead, and a subagent
  gets no row of its own (consistent with "a subagent is not a peer" in the skill)
- it is not you
- it is not already listed as a job
- it speaks at least the minimum peer protocol of the build rendering the view — an older `claude`
  running on the same machine is invisible to a newer one
- **its last activity is within 24 hours**

...and peer adoption sits behind a feature gate that may simply be off for the build in front of
you.

Two consequences, and they are the whole point:

- **An absent row proves nothing.** A session that went quiet more than a day ago while holding an
  uncommitted edit is not in the roster, and is still holding it. Absence is not evidence of
  absence, in either surface.
- **Neither roster bounds the risk.** Both answer *with whom*, at best. Whether you are sharing a
  repository is a git question, and only the repo probe answers it.

## Rows are not uniform

The kind of row decides what you can do with it — the view will let you try either way.

| Row kind | Status comes from | Attach a terminal | Rename travels |
| --- | --- | --- | --- |
| local job | the job's own status file | **yes** | to the status file |
| peer | the session, live | **no** | over a live socket |
| remote (cloud / RC) | the remote listing | **no** | — |

You can attach only to a job this machine owns. A peer row is a live socket to somebody else's
terminal, which is why renaming one can fail with *"that session isn't responding"* while a job
rename fails with *"the job may have been removed"*. The two failures mean different things: the
peer was reachable and went away; the job's record went away.

That asymmetry is also why a row is not a channel. Seeing a session in the view does not mean you
can hold a `FREEZE?` handshake with it — that question is answered by the row-kind table in the
skill, not by the row's presence.

## The rule

A roster is a lead. Git is the boundary.

Use `ListAgents` for addresses, ask the user to read the view when you need directories, and let
the repo probe — not either list — decide whether you are in parallel mode.
