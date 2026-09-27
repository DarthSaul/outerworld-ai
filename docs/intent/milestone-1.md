# Milestone 1 — statement of intent

Confirmed 2026-09-27 via interview.

- **Outcome:** a read-only space-map dashboard plus a generator CLI that turns a Station document
  into a ledger repo a Claude Code Routine can run from zero context.
- **User:** the project owner, dogfooding against their own private ledger repo first. Open source
  so anyone with a Claude Pro/Max subscription can clone and run it.
- **Why now:** Routines exist, there is no API to create them, and nothing shows a person how their
  agents are permitted to work together. The ledger repo is the missing contract.
- **Success:** all three packages green in CI (typecheck, Biome, Vitest, gitleaks); the demo fixture
  renders in both themes down to one column; generator snapshot tests pass; `docs/SCHEMA.md`
  documents the emitted ledger layout. Then the owner runs one manual live smoke test with a real
  Routine. A failure there becomes milestone 2's first issue, not a blocker for this milestone.
- **Constraint:** grants are prompt-enforced, not platform-enforced. The generator emits tool
  allowlists, skill files, and a "enable these connectors before creating the Routine" checklist.
  The dashboard shows grants as declared. It never asserts run state it cannot read from the ledger.
- **Out of scope:** in-browser editing of any kind, live streaming, npm publishing, the final themed
  vocabulary, Storybook (a `/dev` route instead), verifying connector drift from status files.

## Assumptions carried forward

- Node 22 pinned via `.nvmrc` and `engines` (the owner's machine has Node 24; CI uses 22).
- Ledger status files are JSON, validated by the zod `StationState` schema.
- The Claude Code Routines docs are consulted during the core step, when the status format is
  designed, not deferred to the generator step.
