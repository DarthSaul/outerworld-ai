# Demo station (v1)

A fictional station data directory (`$OUTERWORLD_HOME`, brief §9) for development, tests, and
screenshots. Nothing here is real: no real people, API keys, tokens, Notion IDs, or URLs (the
connector URL uses the reserved `.example` domain). `pnpm dev` runs on a copy under
`.outerworld/dev-home/`, so this directory is never mutated.

- `station.json`: three rooms (Command with Web and Memory; Operations with Web, Files, and
  Memory; Research with Web and Memory), hallways from Operations and Research to Command, a
  Notion connector, budgets ($5 / $25 / $50, the onboarding defaults), dispatch depth 1.
- `agents/vesper/`: the Overseer, in Command, *Ask first*.
- `agents/quill/`: the Project Manager (brief §17, as the template makes it), in Operations,
  granted Notion, *Ask first*, with a disabled weekday briefing schedule in UTC.
- `agents/wren/`: a researcher in Research, *Full power*, with a rig of its own.

The directory holds configuration only. Runtime history (sessions, runs, events, memory) lives in
`station.db`, which the daemon creates; `browser:verify` builds a little of it through the real
runtime and the fake model before taking screenshots (D25), so the map, Notifications, and Memory
are checked with real activity. The milestone 1 map fixture is `fixtures/map-demo/` (D14).
