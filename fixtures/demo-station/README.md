# Demo Station fixture

A fictional person's Station and a fake ledger repo. Every screenshot, test, gallery cell (`/dev`), and
example in this repository uses this fixture. Nothing here is real: no real people, repos, sessions, or
webhook URLs. When you need a new shape of data, extend this fixture rather than adding real data.

- `station.json` — the Station document (two teams, three agents, one overseer named Ultron).
- `ledger/` — what a ledger repo looks like after a few runs: team ledgers, run records, team
  status, overseer status, and the last digest.

Static states covered: Project Management has an open run (planner working, scribe idle) and is
healthy; Strength App's last run failed 30 hours ago, so it is stalled and degraded with the
builder shown failed; the overseer is in attention. The demo timeline in the ui package plays the
remaining transitions.

The "as of" moment for this fixture is 2026-09-27T15:00:00Z.
