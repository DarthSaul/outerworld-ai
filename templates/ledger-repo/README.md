# Ledger repo

The private repository your Claude Code Routines clone and commit to. Outerworld AI generates
its contents from your `station.json`:

```
node packages/generator/dist/bin.js generate --station station.json --out /path/to/this/repo   # from the outerworld-ai checkout, after pnpm build
```

Then create one Routine per station plus the overseer at claude.ai/code/routines (or with
`/schedule` in the CLI), pasting the matching `routines/*.prompt.md` and following its setup
checklist. Routines write `status/` and `ledger/`; the dashboard reads them with
`OUTERWORLD_LEDGER_PATH=/path/to/this/repo`.

Never commit secrets here. The Discord webhook URL lives in the overseer Routine's environment
variables as `DISCORD_WEBHOOK_URL`.

Layout (filled in by the generator):

```
CLAUDE.md                     agent guide for the Routines
station.json                  your Station document
agents/<agentId>.md           personas
skills/<skillId>/SKILL.md     skills granted to teams
routines/<teamId>.prompt.md   one prompt per station, plus routines/overseer.prompt.md
ledger/<teamId>.md            station reports (the Routines edit these)
scripts/post-digest.sh        posts status/digest.md to Discord
status/                       written by the Routines; read by the dashboard
```
