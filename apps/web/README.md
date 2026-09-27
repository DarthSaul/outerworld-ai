# web

The Outerworld AI dashboard: Next.js App Router, React 19, Tailwind v4 over the ui package's
tokens. Read-only in milestone 1. Renders `fixtures/demo-station/` by default, or a local ledger
repo when `OUTERWORLD_LEDGER_PATH` is set. Makes no network calls.

Routes: `/` the map, `/dev` the component gallery (every component in both themes, every rig state).

```
pnpm dev          # http://localhost:3000
pnpm build
pnpm test         # render smoke tests under happy-dom
```
