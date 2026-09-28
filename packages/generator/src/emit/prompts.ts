import type { Station, Team } from "@darthsaul/outerworld-ai-core";
import type { EmittedFile } from "./files.js";
import { bullet, grantLabel, grantsOf, json, scheduleLabel, table, teamById } from "./text.js";

/**
 * Routines facts used below, verified against the Claude Code docs on 2026-09-27 (pages:
 * routines, cloud-environments): Routines are created at claude.ai/code/routines or with
 * `/schedule`; the minimum schedule interval is one hour; every connected connector is attached
 * by default and can be removed per Routine; the Default environment uses the Trusted network
 * allow-list, which does not include discord.com (Custom + Allowed domains adds it); environment
 * variables are set on the cloud environment; each run clones the default branch; pushes to
 * `claude/`-prefixed branches are always accepted; the session id is in
 * `CLAUDE_CODE_REMOTE_SESSION_ID` and its `cse_` prefix becomes `session_` in the transcript URL.
 */
const CREATE_HOWTO = `Create the Routine at https://claude.ai/code/routines (or run \`/schedule\` in the Claude Code CLI
and follow the questions). Paste everything from the line after the \`---\` separator below as the
prompt; the setup checklist is for you, not for the Routine.`;

function checklist(lines: readonly string[]): string {
  return `\`\`\`text
SETUP CHECKLIST (for the person creating this Routine; not part of the prompt)
${lines.map((l) => `[ ] ${l}`).join("\n")}
\`\`\``;
}

function statusInstructions(teamId: string, agentIds: readonly string[]): string {
  const agentList = agentIds.length ? agentIds.map((a) => `\`${a}\``).join(", ") : "none";
  return `## Status files (exact contract, see status/README.md)

Opening record: at the start of the run, write \`status/runs/${teamId}/<startedAt>.json\` with
\`startedAt\`, the agents as \`working\`, and no \`endedAt\`. Use the ISO start time with \`:\`
replaced by \`-\` in the filename. Read \`$CLAUDE_CODE_REMOTE_SESSION_ID\` for \`sessionId\`, and
build \`sessionUrl\` by replacing its \`cse_\` prefix with \`session_\` after \`https://claude.ai/code/\`.

Closing record: at the end, rewrite that same file with \`endedAt\`, \`outcome\` (\`done\` or
\`failed\`, with \`error\` when failed), each agent's final state (agents: ${agentList}), the
\`grantsUsed\` counts, the \`ledger\` change summary, and \`notes\` if anything unusual happened.
Then rewrite \`status/teams/${teamId}.json\`.

Never write to \`status/\` outside these two files. Never invent a state you did not reach.`;
}

const COMMIT_RULES = `## Commit and push

Commit every change with a conventional message (\`chore(<teamId>): run <startedAt>\`). Then:

1. \`git pull --rebase origin <default branch>\` (another station may have pushed since you cloned).
2. \`git push origin <default branch>\`.
3. If the push is rejected, repeat steps 1 and 2 once.
4. If it is rejected again, push to a fresh branch named \`claude/status-<teamId>-<startedAt>\`
   (\`claude/\` branches are always accepted) and write \`notes: "pushed to claude/status-…"\` in the
   closing record. The dashboard reads only the default branch, so the owner merges that branch.

Never force-push. Never commit secrets: no tokens, no webhook URLs.`;

const FAILURE_PROCEDURE = `## If anything fails

If any step fails (a tool is unavailable, a connector errors, a command breaks): stop the mission
there. Write the closing record with \`outcome: "failed"\` and an \`error\` that says what broke,
set the agent that was working to \`failed\` and the others to \`idle\`, rewrite the team status
file, commit, and push. A recorded failure is worth more than a guessed success.`;

export function emitRoutinePrompt(team: Team, station: Station): EmittedFile {
  const grants = grantsOf(station, team.id);
  const connectors = [...new Set(grants.filter((g) => g.kind === "connector").map((g) => g.tool))];
  const skills = grants.filter((g) => g.kind === "skill");
  const agents = station.agents.filter((a) => a.teamId === team.id);
  const held = new Set(agents.flatMap((a) => a.persona.allowlist));
  const inbound = station.handoffs.filter((h) => h.to === team.id);
  const outbound = station.handoffs.filter((h) => h.from === team.id);
  const name = (id: string) => teamById(station, id)?.name ?? id;

  const setup = checklist([
    `Repository: attach the ledger repo (this one)${team.scope.repos.length ? ` and ${team.scope.repos.map((r) => `\`${r}\``).join(", ")}` : ""}.`,
    `Schedule: ${scheduleLabel(team.schedule)}. Routines run at most once an hour.`,
    `Connectors: keep ${connectors.length ? connectors.map((c) => `\`${c}\``).join(", ") : "none"} enabled; remove every other connector from the Routine (all are attached by default).`,
    "Environment: the Default cloud environment is enough; this station needs no environment variables.",
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

${bullet(grants.map((g) => `\`${g.id}\` · ${grantLabel(g)}${held.has(g.id) ? "" : " (granted to the station; no agent holds it)"}`))}
${skills.length ? `\nSkills: ${skills.map((g) => `\`skills/${g.tool}/SKILL.md\``).join(", ")}.` : ""}

Use nothing else, even if a connector is available. Write access means write; read access means
read only. A tool no agent holds is not used by anyone this run.

## Station report and handoffs

Your station report is \`ledger/${team.id}.md\`. Keep its marker line and its three sections
(\`## Next steps\`, \`## Waiting on\`, \`## Log\`) exactly; the dashboard parses them. The skeleton's
placeholder bullets ("(nothing yet)", "(no runs yet)") are replaced by real content on your first
run, never kept alongside it.

Inbound handoffs (reports you may read, never edit):
${bullet(inbound.map((h) => `\`ledger/${h.from}.md\` from ${name(h.from)}${h.note ? ` — ${h.note}` : ""}`))}

If an inbound report is missing, still a skeleton, or lacks its marker line, note that under your
\`## Waiting on\` and continue; never create or edit another station's report.

Outbound handoffs (who reads your report):
${bullet(outbound.map((h) => `${name(h.to)} reads \`ledger/${team.id}.md\`${h.note ? ` — ${h.note}` : ""}`))}

## Procedure

1. Write the opening run record (below), commit it, and push, so the dashboard can see the run
   is open even if a later step fails.
2. Read your station report and every inbound report.
3. Do the mission with the allowed tools, as your agents.
4. Update the three sections of your station report. Add one Log line at the top of \`## Log\`
   (newest first): \`<ISO timestamp> · <what happened>\`.
5. Write the closing run record and the team status file.
6. Commit and push (rules below).

${FAILURE_PROCEDURE}

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

Every status file under \`status/teams/\` and \`status/runs/\`, read only. A station whose report is
missing or still a skeleton, or whose latest run failed, needs attention.

Handoffs in force:

${table(["from", "", "to", "note"], handoffRows)}

## What you write, in this order

1. \`status/overseer.json\` with \`state: "reconciling"\` at the start of the run; commit and push it.
2. Read everything above. Set \`reconciled\` to the number of station reports you actually read.
3. \`status/digest.md\`: the System Report, plain words, under 2000 characters (the post fails above
   that). First line: "${o.persona.name} reconciled <n> station reports · <m> need attention". Then
   one bullet per station with its last run, what changed, and anything blocked. End with the
   single most important next step across all stations.
4. \`status/overseer.json\` with the final state. Precedence: \`attention\` if any station needs
   attention (list each with a one-line \`reason\`), else \`reported\` once the post succeeds, else
   \`idle\`. Commit and push the digest and this file BEFORE posting, so the repo has them even if
   the post fails.
5. Post it: \`bash scripts/post-digest.sh\`. It reads \`DISCORD_WEBHOOK_URL\` from the environment
   and fails loudly if it is missing or the digest is empty or too long; never write that URL
   anywhere. On success set \`lastOutwardPostAt\` to now (and \`state: "reported"\` unless attention
   applies), commit, and push. On failure keep the previous \`lastOutwardPostAt\`, set
   \`state: "attention"\`, add \`notes: "post failed: <reason>"\`, commit, and push.

Push rules: \`git pull --rebase origin <default branch>\` before each push; if a push is rejected
twice, push to \`claude/status-overseer-<startedAt>\` and say so in \`notes\`; never force-push.

You never edit a station report. You never post anything except the digest. You never assert
a state you did not read from a file.

Contract for \`status/overseer.json\`:

${json({
  schemaVersion: 1,
  updatedAt: "<ISO 8601 UTC>",
  state: "idle | reconciling | reported | attention",
  lastRunStartedAt: "<ISO 8601 UTC>",
  lastOutwardPostAt: "<ISO 8601 UTC of the last successful post>",
  reconciled: "<number of reports read>",
  attention: [{ teamId: "<teamId>", reason: "<one line>" }],
  digestPath: "status/digest.md",
  notes: "<optional one line>",
})}
`;
  return { path: "routines/overseer.prompt.md", contents };
}
