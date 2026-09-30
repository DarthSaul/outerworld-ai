# Schema and contracts

v1 is being built. Until Phase 1 lands the new schemas and Phase 10 documents them here, the data
model is [specs/BRIEF-station-runtime.md](specs/BRIEF-station-runtime.md) §9 (data model, storage
split, station data directory) and §10 (event envelope and families). Versioning follows
[decisions/0009-schema-versioning.md](decisions/0009-schema-versioning.md).

The milestone 1 schema (Station, ledger repo, status files, StationState) is in git history before
ADR-0010; `packages/core` still carries it until Phase 1 replaces it.
