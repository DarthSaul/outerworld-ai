# @darthsaul/outerworld-ai-generator

Turns a Station document into the files a private ledger repo needs: `CLAUDE.md`, agent
personas, skills, one routine prompt per station plus the overseer's, the station report
skeletons, the digest script, and the status contract. Pure functions plus a small CLI; the CLI
is the only place `node:fs` appears. Knows nothing about rendering. Private package.

The contract is `docs/SCHEMA.md` §6; every emitted file is snapshot-tested against
`fixtures/demo-station` under `src/emit/__snapshots__/`, so a change to any output shows up
as a reviewable diff.

## CLI

```
outerworld generate --station station.json --out ../my-ledger-repo [--dry-run] [--force] [--generated-at <ISO>]
outerworld validate --station station.json
```

- `generate` validates the Station, emits the file set, and writes it under `--out`. It never
  overwrites `station.json`, `ledger/*.md`, or anything under `status/` unless `--force`, because
  those belong to you and to the Routines. Personas, skills, prompts, `CLAUDE.md`, and the script
  are regenerated every time. `--dry-run` lists files and sizes and writes nothing.
- Exit codes: `0` written or dry run · `1` invalid station or bad arguments (issues printed as
  `level: path: message`) · `2` could not read or write.
- Output is deterministic for the same Station and `--generated-at`.

In this workspace: `pnpm --filter @darthsaul/outerworld-ai-generator build`, then
`node packages/generator/dist/bin.js generate --station fixtures/demo-station/station.json --out /tmp/ledger`.

## Public API

| Export | Description |
|--------|-------------|
| `emitLedger(station, { generatedAt? })` | The whole ledger repo as `EmittedFile[]`, sorted by path. |
| `protectedPaths(files)` | `station.json`, `ledger/*.md`, `status/**`: never overwritten without `--force`. |
| `emitClaudeMd`, `emitStationJson`, `emitAgentPersona`, `emitSkill`, `emitRoutinePrompt`, `emitOverseerPrompt`, `emitLedgerSkeleton`, `emitPostDigestScript`, `emitStatusReadme`, `emitGitkeeps` | The individual emitters, all pure. |
| `runCli(argv, io)` | The CLI as a function: returns the exit code; `io` receives stdout and stderr lines. |
| `sortEmitted(files)` | Deterministic path order. |

## What the prompts contain

Each `routines/<teamId>.prompt.md` opens with a setup checklist for the person creating the
Routine (repositories to attach, which connectors to keep and that every other one should be
removed, the schedule, environment needs, and the two ways to create a Routine), then the
prompt itself: identity and mission, agents and personas, allowed tools, station report and
handoffs, the procedure, the exact status-file contract with the session id from
`CLAUDE_CODE_REMOTE_SESSION_ID`, and commit rules with the `claude/status` fallback. The overseer
prompt adds `DISCORD_WEBHOOK_URL` and the `discord.com` network allow-list. Every Routines fact
in them was checked against the Claude Code docs; nothing is invented.

## Develop

```
pnpm --filter @darthsaul/outerworld-ai-generator test    # coverage thresholds 90 / 85
pnpm --filter @darthsaul/outerworld-ai-generator test -- -u   # after an intended output change, to refresh snapshots
```
