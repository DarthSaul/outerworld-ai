# station

The Outerworld AI SPA (ADR-0010): Vite + React 19, react-router 7, TanStack Query 5, Tailwind v4
over the `ui` tokens. Thin by design: it renders runtime state from the daemon and sends
commands; it holds no runtime logic and never simulates state (the product law).

## Run

`pnpm dev` at the repo root starts the daemon and this dev server together. Alone:

```
pnpm --filter station dev      # http://localhost:5173, proxies /api to 127.0.0.1:$OUTERWORLD_PORT (4317)
pnpm --filter station build    # dist/, which the daemon serves in production
```

In development a Vite plugin reads `$OUTERWORLD_HOME/daemon.token` and injects it into
`index.html`, as the daemon does for the built SPA. A page without a token shows how to start the
daemon.

## Structure

| Path | Description |
|------|-------------|
| `src/lib/api.ts` | `readToken(document)` and `createApi({ token })`: JSON GETs under `/api` with the bearer token; `ApiError` with status. |
| `src/lib/event-stream.ts` | `connectEvents(options)`: the SSE stream over `fetch` (to send the token), core's parser and event schema, reconnect with `Last-Event-ID` and capped exponential backoff, stop on 401. |
| `src/daemon-context.tsx` | `DaemonProvider` owns the one event connection and the API client; `useDaemon()` gives `{ api, status, latestSeq, recent }`. |
| `src/App.tsx` | Shell and routes: Station, COMMS, Crew, Memory, Notifications, Connectors, Settings (glossary names); `/dev` is the component gallery (milestone 1 map fixture, D14). |
| `src/queries.ts` | TanStack Query hooks for station, agents, models, and every crew/room mutation. Mutations never patch the cache: the daemon's `agent.updated` / `station.updated` events invalidate it (`invalidateFor` in `daemon-context.tsx`), so changes from other tabs or hand edits appear the same way. |
| `src/pages/` | Screens. Station shows the latest events until the map is adapted (Phase 9). Crew (`/crew`) lists rooms with prop toggles and their crew; the agent editor (`/crew/:id`) edits config (Full power flagged), connector grants, the four documents (each with its own save state), and shows the effective tools. |
| `src/comms/` | COMMS (`/comms`): pick a crew member, start or open sessions, several chat windows side by side (`?agent=…&open=a,b`). A window streams the reply from ephemeral `run.delta` events (`subscribe` on the daemon context), then shows the stored transcript once the run ends; tool use and refusals appear inline; Cancel while a run is active. A `dispatch` result shows as a card (worker, task, live status) whose Watch button embeds the worker's session, live; a worker's report shows as a labelled card. While a run is working, the message box sends a direction to it (steer). |
| `src/pages/StationPage.tsx` | Station: Running now (every run in flight, dispatched work marked, each linking to its session) and the latest events. |
| `src/pages/SettingsPage.tsx` | Settings (`/settings`): which models runs use (OpenRouter or the scripted fake) and whether a key is configured; a password field sends a new key once, and it is never shown again. |
| `src/pages/MemoryPage.tsx` | Memory: pick a crew member (`?agent=`), approve (as written or edited) or discard proposals, edit or forget stored beliefs. |
| `src/test/fake-daemon.tsx` | An in-memory fake of the crew API and a hand-driven event stream for component tests. |

## Tests

```
pnpm --filter station test     # Vitest + React Testing Library + vitest-axe under happy-dom, offline
```
