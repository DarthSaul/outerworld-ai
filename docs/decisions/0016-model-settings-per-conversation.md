# ADR-0016: Model, key, and reasoning level per conversation and per scheduled job

## Status
Accepted

## Date
2026-11-11

## Context
A crew member has one model in `agent.json`. The owner wants to choose, as in a standard chat app,
the model and the reasoning level for each conversation, and which key (Anthropic or OpenRouter,
ADR-0015) it uses. Scheduled jobs should be able to do the same.

## Decision
- **`ModelSettings`** (core): `{ model?, provider?: auto | anthropic | openrouter, reasoning?:
  default | none | low | medium | high | xhigh }`, every field optional. `resolveModelSettings`
  layers them: the crew member's model, then the session's settings, then the send's (a
  schedule's), a later field winning field by field. Unset means `auto` and `default`.
- **Routing** (`routeModel(id, keys, prefer)`): `auto` is ADR-0015's rule. `anthropic` forces the
  Anthropic key (`not_on_anthropic` for a non-Claude model, `needs_anthropic` without the key).
  `openrouter` forces OpenRouter, even for Claude with an Anthropic key (`needs_openrouter`
  without it).
- **Reasoning** goes to the model as the AI SDK's `reasoning` call setting, which the Anthropic
  provider maps to effort and adaptive thinking, and as OpenRouter's `reasoning.effort`.
  `default` sends neither, so the provider decides. Models that cannot switch reasoning off map
  `none` to their lowest level (the provider warns; the run goes on).
- **Storage.** Migration 6 adds `sessions.model_settings` (JSON, null = the crew member's) and
  `runs.provider` / `runs.reasoning`. A run records the settings it was started with, so changing
  them mid-run affects only the next run. `run.started` carries model, provider, and reasoning.
- **Schedules.** `agent.json` schedules gain an optional `modelSettings`. The scheduler passes it
  with the send, over the schedule session's own settings. `null` in a PATCH clears it.
- **HTTP.** `PATCH /api/sessions/:id { modelSettings }` (`null` clears); schedule create and
  update accept `modelSettings`.
- **UI.** COMMS shows a model picker (model, key, reasoning) above the message box, with a line
  saying where the next call goes with today's keys, in amber when it cannot run. The run status
  line names the model, key, and reasoning level a run used. The schedule form has the same
  picker; a schedule card names its own model when it has one.

## Consequences
- An agent's model in `agent.json` stays the default; nothing changes for conversations that
  never touch the picker.
- Dispatched workers run on their own crew member's settings, not the lead's.
- The picker lists the supported models; a hand-edited id still shows and runs.
