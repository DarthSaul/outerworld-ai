# Demo station (v1)

A fictional station data directory (`$OUTERWORLD_HOME`, brief §9) for development, tests, and
screenshots. Nothing here is real: no real people, API keys, tokens, Notion IDs, or URLs (the
connector URL uses the reserved `.example` domain). `pnpm dev` runs on a copy under
`.outerworld/dev-home/`, so this directory is never mutated.

- `station.json`: two rooms (Command with Web and Memory; Operations with Web, Files, and Memory),
  one hallway from Operations to Command, a Notion connector, budgets, dispatch depth 1.
- `agents/vesper/`: the Overseer, in Command, *Ask first*.
- `agents/quill/`: a project manager in Operations, granted Notion, with a disabled weekday
  briefing schedule.

Model ids are placeholders until Phase 3 fixes the supported-model list. Phase 9 extends this
fixture to exercise every screen; the milestone 1 map fixture is `fixtures/map-demo/` (D14).
