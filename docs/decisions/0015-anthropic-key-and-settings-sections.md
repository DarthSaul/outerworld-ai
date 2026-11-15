# ADR-0015: An Anthropic key beside OpenRouter, and Settings as a side menu of sections

## Status
Accepted

## Date
2026-11-11

## Context
ADR-0011 sends every model call through OpenRouter. The owner wants to use their own Anthropic API
key as well, with both providers available. Settings had grown to four stacked panels (models,
the key, budgets, connectors), and a second key card would make it longer still.

## Decision
**Providers**
- Two provider keys, each optional: **Anthropic** and **OpenRouter**. Each lives in the OS
  keychain under its own account (`anthropic-api-key`, `openrouter-api-key`), with an environment
  fallback for development (`ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`). `ApiKeyService` takes a
  `KeyProvider` describing the entry, the variable, and the key check.
- A new Anthropic key is checked with `GET https://api.anthropic.com/v1/models?limit=1`
  (`x-api-key`, `anthropic-version: 2023-06-01`): metadata only, no tokens spent, like
  OpenRouter's key endpoint.
- **Routing** is pure, in core (`routeModel`): a Claude model goes straight to Anthropic when an
  Anthropic key is set; every other model, and Claude when only an OpenRouter key is set, goes
  through OpenRouter. A bare Anthropic id (`claude-…`, a hand edit) can only go to Anthropic.
  Agent configs keep OpenRouter ids (`anthropic/claude-sonnet-5.5`); `SupportedModel.anthropicId`
  maps them (an unlisted `anthropic/x.y` maps to `x-y`).
- The Anthropic path uses `@ai-sdk/anthropic` (pinned to the release matching the installed
  `ai`), so the agent loop stays one `streamText` call per step (ADR-0011) with either provider.
- **Spend.** OpenRouter reports a cost per call; Anthropic reports only tokens. For Anthropic
  calls the runtime estimates cost at the model's list price (`SupportedModel.pricing`, input,
  output, cache reads, five-minute cache writes) via core's `estimateCostUsd`, so budgets keep
  working. Budgets and the footer count it like any other spend. It is an estimate; the Anthropic
  Console is the bill.
- `OUTERWORLD_MODEL` is now `live` (default) or `fake`. `openrouter` is still accepted as an
  older name for `live`. `SettingsView.modelMode` is `live | fake` and gains `anthropic`.
- HTTP: `PUT`/`DELETE /api/settings/anthropic` beside `/api/settings/openrouter`.
- Onboarding's key step asks for a model key with a provider choice, Anthropic first.

**Settings layout**
- Settings is a side menu of sections, each its own route, with the chosen one in the main panel:
  `/settings/providers` (both key cards), `/settings/models` (the run mode and where each model's
  calls go with today's keys), `/settings/budgets`, `/settings/connectors`. `/settings` and unknown
  sections open Providers. On narrow screens the menu wraps above the panel.
- This replaces `/settings#connectors` (ADR-0014): `/connectors` and connector notifications land
  on `/settings/connectors`; budget notifications land on `/settings/budgets`.

## Consequences
- With an Anthropic key, Claude runs without OpenRouter's markup and with Anthropic's own prompt
  caching; spend for those calls is an estimate rather than a reported figure.
- Non-Claude models still need an OpenRouter key; Settings › Models says so per model.
- Prices in `SUPPORTED_MODELS` must be kept current when Anthropic changes them.
