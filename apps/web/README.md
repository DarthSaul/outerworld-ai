# web

The Outerworld AI dashboard: Next.js App Router, React 19, Tailwind v4 over the ui package's
tokens. Read-only in milestone 1. Renders `fixtures/demo-station/` by default, or a local ledger
repo when `OUTERWORLD_LEDGER_PATH` is set. Makes no network calls.

Routes:

- `/` the dashboard: nav, the three columns (overview, map, report), footer with the proof line
  (commit sha when the ledger is a git checkout, then the as-of time). Both routes are
  `force-dynamic`, so `pnpm start` re-reads the ledger on every request. With the fixture the
  sidebar carries the scripted "Run digest" demo; with a real ledger there is no simulation.
- `/dev` the component gallery: every component in both themes, every rig state, always from the
  fixture regardless of `OUTERWORLD_LEDGER_PATH`. It ships in production builds as a localhost
  tool; there is no Storybook.

The loader (`lib/ledger.ts`) reads only `ledger/` and `status/` under the root plus
`station.json` at the root (its real path must stay inside the root), skips symlinks, caps files at
1 MiB and 2000 per ledger, and reports everything it skipped as ledger issues in the sidebar.

```
pnpm dev          # http://localhost:3000
pnpm build
pnpm start        # production server; OUTERWORLD_LEDGER_PATH works here too
pnpm test         # render and loader tests under happy-dom
```

Browser verification lives in `scripts/browser/screenshot.mjs` (`pnpm browser:verify` from the
repo root after `pnpm build`). Its probes check, per route, theme and width: no console errors, no
horizontal scroll, reduced motion honored, axe clean, a tall page can still scroll, and, when
`OUTERWORLD_LEDGER_PATH` is unset, that the served page shows the fixture station name. With a
real ledger, check by hand that the nav shows your station's name.
