# ADR-0010: Local station runtime

## Status
Accepted

## Date
2026-09-29

## Context
Milestone 1 made this app a configuration editor and a read-only renderer for Claude Code
Routines (ADR-0004): agents ran in Anthropic's cloud, cloned a private ledger repo, and committed
status files that the dashboard read back. It worked as designed, but it cannot deliver what the
product now needs (`docs/specs/BRIEF-station-runtime.md` §2):

- **Conversation.** Routines are scheduled or triggered, not conversational. There is no
  streamed, persistent chat with an agent.
- **Concurrency you can watch.** The app only saw state after a Routine committed it. Several
  agents working at once could not be shown live.
- **Delegation.** A lead handing work to a worker and reviewing the result could only happen
  asynchronously through commits.
- **Immediate customization.** Changing an agent meant regenerating files and re-pasting a
  routine prompt by hand, because Routines have no creation API.
- **Memory with approval.** Agents could write files, but there was no path for the owner to
  approve or reject what an agent wants to remember.
- **Enforcement.** Grants were prompt-enforced and shown as declared (ADR-0006); the app could not
  verify or stop a tool call.

## Decision
Outerworld AI becomes a local-first agent runtime with a space-station interface.

- **Two processes on the user's machine.** A Node **daemon** (`apps/daemon`) owns agents, model
  calls, tools, persistence, scheduling, and the event log. A React **SPA** (`apps/station`) talks
  to it over `127.0.0.1` with a per-install bearer token and an Origin check. All runtime logic
  lives in `packages/runtime`; pure policy and schemas live in `packages/core`.
- **Bring your own key via OpenRouter.** Model calls are metered on the user's OpenRouter key.
- **Local persistence.** Station and agent configuration are human-editable files in
  `$OUTERWORLD_HOME` (default `~/.outerworld/`); sessions, runs, events, memory, and spend live in
  SQLite beside them; API keys and connector tokens live in the OS keychain.
- **Runtime-enforced capabilities.** An agent's tools are computed from its role, its room's
  props, and its connector grants. Tools not granted are never sent to the model and are rejected
  at execution. Side-effectful calls pause for consent under *Ask first*.
- **An append-only event log** is the source of truth for the live UI, notifications, and
  restart recovery. The product law stands: the interface never asserts state the runtime cannot
  prove.
- **The generator and ledger template are archived** (removed from the workspace; git history
  keeps them). `apps/web` is replaced by `apps/station` + `apps/daemon`.

This supersedes ADR-0004 (Routines as runtime), ADR-0006 (grants are prompt-enforced), and
ADR-0008 (one Routine and one ledger per team).

## Alternatives considered
- **Keep Routines, add a live channel.** Rejected: Routines still cannot hold a conversation, and
  there is no API to create or configure them; the core gaps remain.
- **A hosted Outerworld server.** Rejected: needs accounts, a privacy story for users' agent data,
  and operating cost; local-first keeps data on the user's disk.
- **Claude Agent SDK or the Anthropic API directly.** Rejected for v1: the brief chooses
  OpenRouter for model choice under one key. The loop is written against the Vercel AI SDK's
  provider interface (ADR-0011), so another provider is a small change.
- **Desktop shell (Electron/Tauri) now.** Deferred to v3: runtime logic is kept out of `apps/*`
  so it can move into a shell without rewrites.

## Consequences
- Automated work (schedules, dispatched workers) only runs while the daemon runs; the laptop must
  be on. Missed schedules are recorded and optionally caught up once on startup.
- Model calls cost money on the user's key. Budgets are checked before every model call and a
  persisted kill switch stops everything.
- The app now makes network calls: model calls to OpenRouter, connector calls to Notion, and
  `web_fetch` requests an agent makes. `docs/PRIVACY.md` lists exactly these and nothing else.
- Security moves into this codebase: localhost binding, token and Origin checks, workspace
  confinement for file tools, no shell tool in v1, secrets never in files, logs, events, or the SPA.
- Tests and CI use a scripted fake model provider and a fake MCP server; no network.
- The vocabulary adopts the brief's terms (Room, Crew, Hallway, Prop, COMMS…) through the
  glossary; code keeps neutral identifiers (ADR-0002). These are another product's words and must
  be revisited before a public release.
