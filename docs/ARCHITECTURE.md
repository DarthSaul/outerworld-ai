# Architecture

Outerworld AI has two jobs and three packages. The schema is documented in `SCHEMA.md` and
decisions in `decisions/`.

## The two jobs

1. **Configuration editor.** A Station document (teams, agents, grants, handoffs, overseer) goes
   in; ledger-repo files come out. `packages/generator` does this as pure functions; the CLI is
   the only thing that touches the filesystem.
2. **State renderer.** A ledger repo (status files, run history, team ledgers) goes in; a
   StationState comes out and the map renders it. `packages/core` parses an in-memory file map;
   `apps/web` reads the files from disk; `packages/ui` renders.

Neither job talks to the network. The agents run elsewhere, as Claude Code Routines.

## Package boundaries

```
apps/web ──▶ packages/ui ──▶ packages/core ◀── packages/generator
    └──────────────────────────▶ core (glossary `term`, `parseStation`, `parseLedger`)
```

- **core** knows nothing about React or files. Schema (zod), glossary, layout and handoff
  geometry, rig derivation, event model, ledger parsing. Zero runtime dependencies beyond zod.
- **ui** knows nothing about Routines or GitHub. Tokens, the character rig, map and panel
  components, the scripted demo timeline.
- **generator** knows nothing about rendering. Station → files.
- **web** depends on both ui and core directly: its server components call core's loader
  functions and `term()` for the nav label, and render ui's `StationView`. It consumes both through
  their built `dist/`, so a change in a package needs `pnpm build` before web sees it.

The Station and StationState schemas in core are the product's real API; ui and generator both
key off them. Schema versions are recorded in `decisions/`.

## Runtime flow (milestone 1)

```
station.json ──generate──▶ ledger repo ──clone──▶ Routine (cloud) ──commit──▶ ledger repo
                                                                                   │
apps/web (OUTERWORLD_LEDGER_PATH) ◀────────────────────── read status/, ledger/, station.json
```

The dashboard shows the last committed state with a proof line (commit sha when the ledger is a
git checkout, then the as-of time) in the footer. It never streams.

## The web app

**Loader.** `apps/web/lib/ledger.ts` is the only code that touches the filesystem. `loadLedger()`
resolves `OUTERWORLD_LEDGER_PATH` against the working directory, or falls back to the fixture.
It reads `station.json` at the root (the real path must resolve inside the root; a symlink out is
refused with an error naming the path), walks only `ledger/` and `status/` with `withFileTypes`,
skips symbolic links, caps files at 1 MiB and 2000 per ledger, and reads the short HEAD sha from
`.git/HEAD` (direct or via `refs/heads/*` or `packed-refs`) when the ledger is a git checkout.
Everything it could not read becomes an entry in `state.issues`, which the sidebar lists, so the
map only ever shows what the ledger proves. `loadFixture()` ignores the env var; the gallery uses
it.

**Dynamic rendering.** Both routes export `dynamic = "force-dynamic"`. A real ledger changes
between visits, so `pnpm start` must re-read it per request rather than serve a build-time
snapshot. The fixture is evaluated at its own as-of moment so the demo never rots into "stalled".

**Demo mode.** The `Dashboard` client component receives `demo`, true only when the source is the
fixture. In demo mode it runs the scripted timeline through core's reducer and shows the "Run
digest" control and toast; otherwise it renders the loaded state as-is, with no simulation.

**Routes.** `/` is the dashboard: a nav / columns (1fr 3fr 2fr) / footer grid that fits the
viewport (`data-fits-viewport` on its root scopes the body overflow lock so panes scroll inside
themselves). `/dev` is the component gallery, a normal scrolling document that always renders the
fixture and ships in production builds as a localhost tool. There is no Storybook.

**Theme.** An inline init script applies the stored `data-theme` before paint. `ThemeToggle`
starts with a null choice, reads `localStorage` (or a `?theme=` query, which wins for that page
load but is never persisted), applies the attribute once the choice is known, and persists only
choices the viewer makes. Nothing else is stored in the browser (`PRIVACY.md`).

**Browser verification.** `scripts/browser/screenshot.mjs` serves the production build and, for
every route × theme × width × motion preference, screenshots the page, collects console and page
errors, runs axe (WCAG 2.1 AA), and probes: reduced motion honored, no horizontal scroll, a page
taller than the viewport can scroll, and, with no `OUTERWORLD_LEDGER_PATH`, that the fixture
station name is on the served page. Output goes to `.outerworld/screenshots/` (gitignored) and is
uploaded as a CI artifact.
