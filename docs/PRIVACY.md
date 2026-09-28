# Privacy: the data map

What lives where, and what leaves your machine. Keep this current whenever a data flow changes.

## Where data lives

| Data | Lives in | Committed to this repo? | Notes |
|------|----------|-------------------------|-------|
| The demo Station and fake ledger | `fixtures/demo-station/` | Yes | Fictional user. Every screenshot, test, and example uses it. |
| Your Station document (`station.json`) | Your private ledger repo, at its root | Never | The generator copies it there so one path serves config and state. |
| Personas, skills, routine prompts, team ledgers | Your private ledger repo | Never | Emitted by `outerworld generate`. |
| Run status and run history (`status/`) | Your private ledger repo | Never | Written by your Routines. The dashboard only reads them. |
| The Discord digest text (`status/digest.md`) | Your private ledger repo | Never | Written by the overseer Routine; posted by `scripts/post-digest.sh`. |
| Discord webhook URL, any token or secret | The Routine's cloud environment variables | Never, anywhere | The generator has no input for it and no emitted file contains it. gitleaks runs in CI. |
| Per-routine HTTP trigger URLs | Not stored in milestone 1 | Never | Treated as secrets when trigger wiring lands. |
| Local workspace (`.outerworld/`) | Your machine, inside this checkout | Never (gitignored) | Local scratch such as a checked-out ledger path. `browser:verify` writes its screenshots (of the fixture) to `.outerworld/screenshots/`, and CI uploads that directory as a build artifact. |
| Theme preference | Your browser's `localStorage` | n/a | Only per-viewer convenience; nothing else is stored in the browser. |

## What leaves the machine

**From this app: nothing.** The dashboard reads a ledger repo from a local path
(`OUTERWORLD_LEDGER_PATH`) or the bundled fixture. It makes no network requests for data. Fonts
are self-hosted (IBM Plex via Fontsource); there is no Google Fonts or CDN request. There is no
telemetry, no analytics, no error reporting.

**From your Routines:** each Routine runs in Anthropic's cloud environment, clones your private
ledger repo, uses the connectors you enabled on it, commits status back to the ledger repo, and,
for the overseer only, posts the digest to the Discord webhook URL found in its environment.
Which connectors a Routine has is configured by you on the Routine itself; this app can only
emit a checklist. See the Claude Code docs on Routines and cloud environments for network access
levels.

## Rules

- Never commit a real Station, real ledger output, real usernames, real repo names, or real
  webhook URLs to this repo. Extend the fixture instead.
- Never add a gitleaks allowlist entry to get CI green.
- Never add a network call to `apps/web` without updating this file and asking first.
