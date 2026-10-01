# ADR-0004: Claude Code Routines as the agent runtime

## Status
Superseded by ADR-0010

## Date
2026-09-27

## Context
The product visualizes agents and their permitted collaboration. Something has to run the agents.
Claude Code Routines are Anthropic's cloud-scheduled Claude Code sessions: they run on a schedule,
via API call, or on GitHub events, in a cloud environment that carries environment variables and
connectors, and they clone a repository at the start of each run. They exist on Pro/Max plans,
have no creation API (only a per-routine trigger endpoint and the `/schedule` command or the web
UI), and start with zero context.

## Decision
Agents run as Routines; this app never runs an agent. The unit of deployment is a private ledger
repo that a Routine clones: it carries `CLAUDE.md`, personas, skills, the routine prompt, team
ledgers, and status files. The app generates that repo and renders its committed state. Secrets
live in the Routine's environment variables. The app guides the user to create each Routine by
hand and stays honest about it in the README.

## Alternatives considered
- **Run agents inside the app with the Claude Agent SDK.** Rejected: the app would become a host
  that needs to stay up, hold API keys, and stream; the brief wants a config editor and a state
  renderer, and a subscription-based runtime the user already has.
- **GitHub Actions on a schedule.** Rejected as the default: requires API keys in CI secrets and
  loses the connectors and environments Routines provide. Remains possible for users who want it,
  since the ledger repo layout is runtime-agnostic.

## Consequences
- The dashboard is explicitly last-known-state, with a proof line (commit sha when the ledger is
  a git checkout, then the as-of time) in the footer, and the ledger path beside it. It never streams and never asserts what the ledger cannot prove.
- Facts about Routines (trigger payloads, environment variables, connector behavior) are looked
  up in the Claude Code docs when they matter, never invented.
- One Routine per team (ADR-0008) keeps the number of hand-created Routines small.
