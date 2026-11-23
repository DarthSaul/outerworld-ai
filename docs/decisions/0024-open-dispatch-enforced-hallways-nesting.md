# ADR-0024: Open dispatch: per-agent dispatch, enforced hallways, nesting to depth 3

## Status

Accepted. Amends brief §3 (the depth-1 goal and the "recursive delegation" non-goal), §4
(Dispatch), §5 (the dispatcher's depth-1 policy) and §7 (orchestration). Brings hallway
enforcement forward from v2 (ADR-0013 #7 and #8, SCHEMA.md's "enforced in v2").

## Context

In v1 only `role: "overseer"` could dispatch, `station.dispatch.maxDepth` was `0 | 1`, and hallways
were drawn on the map but ignored by policy. The glossary already told the Commander that "rooms
can't hand work to each other until a hallway is opened", which the code did not do. The owner
wants any crew member to be able to hand on part of a task, with hallways deciding where it can
go, and chains up to three levels deep. Nesting multiplies cost and widens what one request can
do, so it needs guards that hold whatever the model asks for.

## Decision

**Who dispatches.**
- `agent.json` gains `canDispatch?: boolean`; absent means no.
- The Overseer always has dispatch and the flag is ignored for it. A crew member with the flag
  gets the `dispatch` tool.
- `read_session` stays Overseer-only.
- `hasDispatch` (core) is the one test.

**Reach** (`dispatchReach` in core, which `dispatchTargets`, `checkDispatch`, the role briefing,
the map and the crew page all use):
- The Overseer reaches every other crew member and is exempt from hallways.
- A crew member reaches the other agents in its own room, plus every agent in a room that a
  hallway leads to from its room. Hallways are directed, `from → to`.
- Crew never reach the Overseer, even along a hallway into the Bridge: work flows down, and
  results come back as reports. (Owner's decision.)
- No one dispatches to itself.
- A room with no incoming hallway can be dispatched into only by the Overseer (and its own crew).
- A refusal names the hallway that is missing. Against a hallway's direction, it says which way
  the hallway runs.
- The reverse of a hallway is a hallway of its own: `POST /api/lanes` refuses only a duplicate in
  the same direction. Two rooms need two hallways for crew to dispatch both ways.

**Depth.**
- `station.dispatch.maxDepth` is an integer from 0 to 3. The default stays 1, and 0 turns
  delegation off for everyone.
- A run at depth N (the Commander's run is 0) may dispatch only if `N < maxDepth` and its agent has
  dispatch.
- At the limit `resolveGrants` leaves `dispatch` out, so the model never sees it. Skills that need
  `dispatch` drop out with it (ADR-0023 gating reads the offered tools). A call made anyway is
  refused at execution.

**Lineage.**
- Migration 7 adds `runs.parent_run_id` and `runs.root_run_id`.
- A Commander's, schedule's or user-started run is the root of its own tree.
- A dispatched run's parent is the run that dispatched it; its root is that run's root.
- A review run continues the session's latest run: it takes that run's depth, parent and root.
  Reviews, and anything they dispatch, therefore stay in the original tree.
- Existing rows are backfilled from `dispatches.lead_run_id`, which is correct because every old
  dispatch was one level deep.

**Results return level by level.** A dispatch is done when its worker session is quiet:
- its latest run has ended,
- nothing it dispatched is still running, and
- it has reviewed every report it received.

The report (the session's last reply, plus the files it wrote) then goes to the immediate
dispatcher's session.

**Auto review by level.**
- `dispatch.autoReview` governs only sessions that were not themselves dispatched: the Commander's.
- A dispatched session always reviews the reports it gets, because its own report is not finished
  until it has folded them in. It does so only while its own work went well: not after its run was
  cancelled, stopped by a budget, or failed.
- No review starts in a tree that has reached its spend cap.

**Guards.** `checkDispatch` in core checks, in this order, with a clear reason for each refusal:
1. has dispatch
2. delegation on
3. depth
4. self
5. known target
6. reach
7. no cycle: the target is not the agent of any run above the dispatching run
8. run cap per tree: `dispatch.maxRunsPerTree` (1–50, default 12) counts dispatched runs under
   the root. Reviews don't count; there is at most one per completed dispatch, and their spend
   counts toward the tree cap.
9. spend per tree

**Spend cap per tree.**
- `budgets.perTreeUsd` caps the summed spend of a root run and every run descended from it.
- Unlike the other caps, a missing value means the default, $15 (owner's decision), and `null` is
  an explicit "no cap" that `PUT /api/budgets` stores as `null`.
- It is checked before every model call in the tree (order: run → tree → agent → station) and at
  dispatch, and warns at 80% once per tree.
- When it is reached:
  - The run that hit it ends `blocked_budget` with `budget.blocked {scope: "tree"}`.
  - Every other unfinished run in the tree is cancelled, with `run.cancelled {by: "budget"}`.
  - Further dispatches in the tree are refused, and their dispatches report `blocked`.
- A tree cap counts as a budget for the fail-closed check on unpriced direct Anthropic models.

**Strictest approval wins.**
- A run's write-class calls ask for consent if its own agent or any agent above it in the chain is
  *Ask first*, read from their configs at the time of the call (`effectiveApprovalMode`).
- An agent that no longer exists counts as *Ask first*.
- A less trusted agent cannot gain *Full power* by dispatching to one that has it.

**Busy targets.**
- Every dispatch opens a fresh session, so an agent with a run in flight elsewhere can still be
  dispatched to.
- The cycle guard refuses it when that agent is above the dispatcher in the chain.
- The run semaphore (4 at once) still bounds concurrency; extra runs queue.

**Stopping and restarts.**
- Cancelling a run cancels its unfinished descendants, level by level.
- On startup, a dispatch still marked running (its worker was interrupted) reports `interrupted`
  to its dispatcher instead of waiting forever.

**Events.**
- `dispatch.started` gains optional `workerSessionId`, `workerRunId` and `depth`.
- `run.queued` gains optional `parentRunId` and `rootRunId`.
- Budget scopes gain `tree`.
- `dispatchChain(events, runId)` in core reconstructs who asked whom from events alone, for consent
  cards and the dashboard.
- All the new fields are optional, so stored events still parse.

**Handover.** ADR-0018's refusal of a dispatched worker's session holds at every level, because
each nested worker session has its own `dispatches` row.

### What bounds the cost of one root request

The root request is the Commander's run, or a schedule's. Everything it causes (its dispatches,
theirs, and every review) shares its root. Its cost is at most:

- `min(perTreeUsd, what is left of stationDailyUsd today)`,
- plus at most one model call's overshoot per run in flight when the cap is crossed, because
  every check happens *before* a call and a call's cost is known only after it. At most 4 runs are
  in flight at once.

Within that:
- each run is still held to `perRunUsd`;
- each agent's runs, dispatched or not, still count toward its own `perAgentDailyUsd`;
- everything counts toward `stationDailyUsd`.

The number of runs is bounded by `maxRunsPerTree` dispatched runs, plus at most one review per
completed dispatch, plus the root. The depth is bounded by `maxDepth`.

## Alternatives considered

- **Crew may dispatch to the Overseer along a hallway into the Bridge.** This is what the literal
  hallway rule gives. Rejected by the owner: it makes the Overseer a worker in its own tree and
  invites loops the cycle guard would have to catch every time.
- **A missing `perTreeUsd` means no cap, like the other caps.** This keeps one convention, but
  every station written before this change would have unbounded trees the moment nesting is turned
  on. Rejected by the owner.
- **Complete a dispatch when the worker's first run ends** (the v1 behaviour). With nesting, a
  middle worker that answers "handed to Wren" would report before Wren's work existed.
- **Store the effective approval mode on the run at start.** Simpler, but a Commander who switches
  an ancestor to *Ask first* mid-tree would not be obeyed until the next run.

## Consequences

- Policy for every dispatch lives in core's `checkDispatch` and `dispatchReach`. The runtime
  supplies the chain, the tree's dispatched-run count and the tree's spend
  (`RunService.tree(runId)`).
- `station.json` gains `dispatch.maxRunsPerTree` and `budgets.perTreeUsd`; `agent.json` gains
  `canDispatch`. All are optional on disk.
- `station.db` gains two columns on `runs`; nothing new leaves the machine.
- The demo fixture gives Quill dispatch and opens Operations → Research, so the map and tests have
  a crew dispatch to draw.
- Hallways now carry policy. The map's traffic follows the hallway a crew dispatch used.
- The map shows direction. Each hallway has two subtle chevrons pointing the way it runs. A
  two-way pair shares one route, and each lane is shifted `--st-map-lane-gap` to the right of its
  own travel, so the two run parallel with their corners joined. Core's `laneSegments` and
  `lanePointAlong` compute the geometry; the renderer only multiplies the shifts by the token.
  Lane names, notes and the Scanner say `→` (or `←` for a hallway coming in) instead of `⇄`. The UI
  (crew page toggle and reach, Settings for depth, run cap and the per-tree cap, the chain on
  consent cards) is Phase 14's second half.
