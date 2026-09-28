# ADR-0002: Neutral vocabulary in code, themed strings in one glossary

## Status
Accepted

## Date
2026-09-27

## Context
The product is space-themed and the final themed names are still being workshopped
(`docs/design/naming-workshop.dc.html` proposes Outpost, Clearance, Relay, Hand, Sortie, and
"the Assayer"). Renaming identifiers, schema keys, and filenames across three packages every time
the vocabulary shifts would be expensive and would leak into the user's ledger repo, which the
generator writes.

## Decision
Code, schema keys, filenames, CSS custom properties, and test names use neutral terms only:
`station`, `team`, `grant`, `handoff`, `agent`, `overseer`, `run`, `persona`, `ledger`, `emblem`.
Display strings live in one glossary module in `packages/core`, so a rename is a one-file change.
The floor guard (`scripts/floor-guard.mjs`) fails the diff when a themed noun appears in code
outside the glossary and docs.

## Alternatives considered
- **Themed names everywhere now.** Rejected: the names are not final, and the design doc itself
  changed the run noun between two documents (Shift vs Sortie).
- **Themed names in the schema, neutral in code.** Rejected: the schema is the product's public
  API and is written into users' repos; it must not churn.

## Consequences
- The design docs read differently from the code. `docs/design/README.md` carries the map.
- The overseer's role noun and proper name both come from the glossary and the persona, never
  from code, which also keeps unlicensable placeholder names out of the repo.
- When the vocabulary is final, the glossary changes and nothing else does.
