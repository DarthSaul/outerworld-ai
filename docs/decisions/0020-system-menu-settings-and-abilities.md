# ADR-0020: System menu, Settings and Abilities under /system

## Status
Accepted. Amends ADR-0014 (Connectors in Settings) and ADR-0015 (Settings routes).

## Context

Settings had grown a Connectors section that is not a setting: it is what crew members can do.
Toolsets and skills will join connectors, and each needs room for discovery and management.

## Decision

- The footer's Settings link becomes a **System** button (gear glyph) that opens a menu
  (`MenuButton` in ui). Each item is an icon beside a title over a subtitle:
  Settings ("keys, model, appearance") and Abilities ("everything agents can do — toolsets,
  connectors, skills").
- Both screens live under `/system/` and share one layout (`SectionLayout`): a side menu of
  sections, each its own route, the chosen one in the main panel. Section routes accept deeper
  paths (`/system/settings/providers/...`) for later sub-views.
  - `/system/settings/{providers,models,budgets,appearance}`. Connectors left Settings.
  - `/system/abilities/{discover,installed}`. Discover offers the connector presets not installed
    yet; adding one lands on Installed, which holds the connector cards.
- `/system` opens Settings; a bare screen path or an unknown section opens its first section.
- Old addresses redirect: `/settings/<section>` → `/system/settings/<section>`;
  `/settings/connectors` and `/connectors` → `/system/abilities/installed`. Budget notifications
  link to `/system/settings/budgets`, connector notifications to `/system/abilities/installed`.
- Words: the screen is "Abilities"; an individual MCP server is still a "connector", one kind of
  ability. Paths live in `apps/station/src/lib/routes.ts`.
