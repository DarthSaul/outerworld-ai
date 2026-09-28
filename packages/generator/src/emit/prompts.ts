import type { Station, Team } from "@darthsaul/outerworld-ai-core";
import type { EmittedFile } from "./files.js";
import { bullet, grantLabel, grantsOf, json, scheduleLabel, table, teamById } from "./text.js";

/** Verified against the Claude Code docs (Routines, cloud environments) on 2026-09-27. */
const CREATE_HOWTO = `Create the Routine at https://claude.ai/code/routines (or run \`/schedule\` in the Claude Code CLI
and follow the questions). Paste everything below the setup checklist as the prompt.`;

function checklist(lines: readonly string[]): string {
  return `\`\`\`text
SETUP CHECKLIST (for the person creating this Routine; not part of the prompt)
${lines.map((l) => `[ ] ${l}`).join("\n")}
\`\`\``;
}

function statusInstructions(teamId: string, agentIds: readonly string[]): string {
  return `## Status files (exact contract, see status/README.md)

At the start of the run, write \`status/runs/${teamId}/<startedAt>.json\` with \`startedAt\`, the
agents as \`working\`, and no \`endedAt\`. Use the ISO start time with \`:\` replaced by \`-\` in
the filename. Read \`$CLAUDE_CODE_REMOTE_SESSION_ID\` for \`sessionId\`, and build \`sessionUrl\` by
replacing its \`cse_\` prefix with \`session_\` after \`https://claude.ai/code/\`.

At the end, rewrite that file with \`endedAt\`, \`outcome\` (\`done\` or \`failed\`, with \`error\`
when failed), each agent's final state (${agentIds.map((a) => `\`${a}\``).join(", ")}), the
\`grantsUsed\` counts, and the \`ledger\` change summary. Then rewrite \`status/teams/${teamId}.json\`.

Never write to \`status/\` outside these two files. Never invent a state you did not reach.`;
}

const COMMIT_RULES = `## Commit

Commit every change with a conventional message (\`chore(<teamId>): run <startedAt>\`) and push to
the default branch. If the push is rejected, push to \`claude/status\` instead and say so in the
run record's \`notes\`. Never force-push. Never commit secrets: no tokens, no webhook URLs.`;

export function emitRoutinePrompt(team: Team, station: Station): EmittedFile {
  const grants = grantsOf(station, team.id);
  const connectors = [...new Set(grants.filter((g) => g.kind === "connector").map((g) => g.tool))];
  const skills = grants.filter((g) => g.kind === "skill");
  const agents = station.agents.filter((a) => a.teamId === team.id);
  const inbound = station.handoffs.filter((h) => h.to === team.id);
  const outbound = station.handoffs.filter((h) => h.from === team.id);
  const name = (id: string) => teamById(station, id)?.name ?? id;

  const setup = checklist([
    `Repository: attach the ledger repo (this one)${team.scope.repos.length ? ` and ${team.scope.repos.map((r) => `\`${r}\``).join(", ")}` : ""}.`,
    `Schedule: ${scheduleLabel(team.schedule)}. Routines run at most once an hour.`,
    `Connectors: keep ${connectors.length ? connectors.map((c) => `\`${c}\``).join(", ") : "none"} enabled; remove every other connector from the Routine (all are attached by default).`,
    "Environment: the Default cloud environment is enough; this station needs no environment variables.",
    "Model: pick the model in the Routine form; the prompt does not choose one.",
  ]);

  const contents = `# Routine prompt · ${team.name}

${CREATE_HOWTO}

${setup}

---

You are the station **${team.name}** (\`${team.id}\`) in the Outerworld AI ledger repo you have just
cloned. You start with no memory: everything you need is in this repository. Read \`CLAUDE.md\`
first, then this prompt, then your agents' persona files.

## Mission

${team.mission}

## Agents

${bullet(agents.map((a) => `**${a.persona.name}** (\`${a.id}\`) — ${a.persona.mandate} Persona: \`agents/${a.id}.md\`.`))}

Work as these agents in turn; each acts only within its persona's allowed tools.

## Allowed tools

${bullet(grants.map((g) => `\`${g.id}\` · ${grantLabel(g)}`))}
${skills.length ? `\nSkills: ${skills.map((g) => `\`skills/${g.tool}/SKILL.md\``).join(", ")}.` : ""}

Use nothing else, even if a connector is available. Write access means write; read access means
read only.

## Station report and handoffs

Your station report is \`ledger/${team.id}.md\`. Keep its marker line and its three sections
(\`## Next steps\`, \`## Waiting on\`, \`## Log\`) exactly; the dashboard parses them.

Inbound handoffs (reports you may read, never edit):
${bullet(inbound.map((h) => `\`ledger/${h.from}.md\` from ${name(h.from)}${h.note ? ` — ${h.note}` : ""}`))}

Outbound handoffs (who reads your report):
${bullet(outbound.map((h) => `${name(h.to)} reads \`ledger/${team.id}.md\`${h.note ? ` — ${h.note}` : ""}`))}

## Procedure

1. Write the opening run record (below).
2. Read your station report and every inbound report.
3. Do the mission with the allowed tools, as your agents.
4. Update the three sections of your station report. Add one Log line: \`<ISO timestamp> · <what happened>\`.
5. Write the closing run record and the team status file.
6. Commit and push.

${statusInstructions(
  team.id,
  agents.map((a) => a.id),
)}

${COMMIT_RULES}
`;
  return { path: `routines/${team.id}.prompt.md`, contents };
}

export function emitOverseerPrompt(station: Station): EmittedFile {
  const o = station.overseer;
  const reports = station.teams.map((t) => `\`ledger/${t.id}.md\` (${t.name})`);
  const setup = checklist([
    "Repository: attach the ledger repo (this one).",
    `Schedule: ${scheduleLabel(o.schedule)}. Run it after the stations' schedules so it reads fresh reports.`,
    "Connectors: remove every connector from this Routine; the overseer only needs the repository.",
    "Environment: create or edit a cloud environment and set DISCORD_WEBHOOK_URL=<your Discord webhook URL> under Environment variables. Never put it in this repo.",
    "Network: on that environment, set Network access to Custom and add discord.com to Allowed domains (the Default allow-list blocks it).",
  ]);
  const handoffRows = station.handoffs.map((h) => [
    teamById(station, h.from)?.name ?? h.from,
    "→",
    teamById(station, h.to)?.name ?? h.to,
    h.note ?? "",
  ]);
  const contents = `# Routine prompt · Overseer (${o.persona.name})

${CREATE_HOWTO}

${setup}

---

You are **${o.persona.name}**, the overseer of this Outerworld AI ledger repo. You start with no
memory: everything you need is here. Read \`CLAUDE.md\` first.

## Mandate

${o.persona.mandate}

## Tone

${o.persona.tone}

## What you read

Every station report, read only:
${bullet(reports)}

Every status file under \`status/teams/\` and \`status/runs/\`, read only.

Handoffs in force:

${table(["from", "", "to", "note"], handoffRows)}

## What you write

1. \`status/overseer.json\` with \`state: "reconciling"\` at the start, then the final state at the
   end: \`reported\` when you posted, \`attention\` when any station needs attention (list them with
   one-line reasons), \`idle\` otherwise. Set \`reconciled\` to the number of reports read.
2. \`status/digest.md\`: the System Report, under 2000 characters, plain words. First line:
   "${o.persona.name} reconciled <n> station reports · <m> need attention". Then one bullet per
   station with its last run, what changed, and anything blocked. End with the single most
   important next step across all stations.
3. Post it: \`bash scripts/post-digest.sh\`. It reads \`DISCORD_WEBHOOK_URL\` from the environment
   and fails loudly if it is missing; never write that URL anywhere.
4. Commit and push (default branch; \`claude/status\` if rejected).

You never edit a station report. You never post anything except the digest. You never assert
a state you did not read from a file.

Contract for \`status/overseer.json\`:

${json({
  schemaVersion: 1,
  updatedAt: "<ISO 8601 UTC>",
  state: "idle | reconciling | reported | attention",
  lastRunStartedAt: "<ISO 8601 UTC>",
  lastOutwardPostAt: "<ISO 8601 UTC>",
  reconciled: station.teams.length,
  attention: [{ teamId: "<teamId>", reason: "<one line>" }],
  digestPath: "status/digest.md",
})}
`;
  return { path: "routines/overseer.prompt.md", contents };
}
