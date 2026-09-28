import {
  type Agent,
  type Grant,
  SCHEMA_VERSION,
  type Station,
  type Team,
} from "@darthsaul/outerworld-ai-core";
import { bullet, grantLabel, grantsOf, json, teamById } from "./text.js";

export interface EmittedFile {
  readonly path: string;
  readonly contents: string;
}

export function emitStationJson(station: Station): EmittedFile {
  return { path: "station.json", contents: `${JSON.stringify(station, null, 2)}\n` };
}

export function emitAgentPersona(agent: Agent, station: Station): EmittedFile {
  const team = teamById(station, agent.teamId);
  const grants = station.grants.filter((g) => agent.persona.allowlist.includes(g.id));
  const p = agent.persona;
  const contents = `# ${p.name}

Agent \`${agent.id}\` of station **${team?.name ?? agent.teamId}** (\`${agent.teamId}\`).

## Mandate

${p.mandate}

## Tone

${p.tone}

## Allowed tools

The only tools this agent may use. Anything not listed here is off limits, even if the Routine
has the connector enabled.

${bullet(grants.map((g) => `\`${g.id}\` · ${grantLabel(g)}`))}

## Rig (for the record)

- tintHue: ${p.rig.tintHue}
- trimHue: ${p.rig.trimHue}
- head: ${p.rig.head}
- trace: ${p.rig.trace}
`;
  return { path: `agents/${agent.id}.md`, contents };
}

/** One skill file per distinct skill tool granted anywhere in the station. */
export function emitSkill(tool: string, grants: readonly Grant[], station: Station): EmittedFile {
  const teams = [...new Set(grants.map((g) => g.teamId))].map(
    (id) => teamById(station, id)?.name ?? id,
  );
  const modes = [...new Set(grants.map((g) => g.mode))].sort().join(" / ");
  const contents =
    tool === "ledger"
      ? `---
name: ${tool}
description: Read and update this station's report (ledger/<teamId>.md) using its fixed sections.
---

# Station report skill

Granted to: ${teams.join(", ")} (${modes}).

The station report is \`ledger/<teamId>.md\`. It has exactly three sections under the marker
comment, and the dashboard parses them by heading:

- \`## Next steps\` — one bullet per concrete next action, owner and date where known.
- \`## Waiting on\` — one bullet per blocker outside this station's control.
- \`## Log\` — one bullet per run, newest first: \`<ISO timestamp> · <one line>\`.

Rules:

1. Keep the marker line \`<!-- ow:ledger v1 · team:<teamId> -->\` and the three headings exactly.
2. Edit bullets in place; do not add other headings. Prose outside the sections is preserved
   but ignored.
3. Read only: never edit a report your station does not own. Handoffs grant reading, not writing.
4. Write only in a run: every edit is followed by the status files and a commit.
`
      : `---
name: ${tool}
description: Skill "${tool}" granted to ${teams.join(", ")} (${modes}).
---

# ${tool}

Granted to: ${teams.join(", ")} (${modes}).

Describe how this station uses \`${tool}\` here. The generator only reserves the file; the
skill's instructions are yours to write.
`;
  return { path: `skills/${tool}/SKILL.md`, contents };
}

export function emitLedgerSkeleton(team: Team): EmittedFile {
  const contents = `# ${team.name} · station report
<!-- ow:ledger v1 · team:${team.id} -->

## Next steps
- (nothing yet)

## Waiting on
- (nothing yet)

## Log
- (no runs yet)
`;
  return { path: `ledger/${team.id}.md`, contents };
}

export function emitPostDigestScript(): EmittedFile {
  const contents = `#!/usr/bin/env bash
# Posts status/digest.md to Discord. The webhook URL is a secret and lives ONLY in the
# overseer Routine's environment variables as DISCORD_WEBHOOK_URL; it is never in this repo.
set -euo pipefail

: "\${DISCORD_WEBHOOK_URL:?DISCORD_WEBHOOK_URL is not set. Add it to the overseer Routine's environment variables; never commit it.}"

digest="\${1:-status/digest.md}"
if [[ ! -f "$digest" ]]; then
  echo "post-digest: $digest not found; write the digest before posting" >&2
  exit 1
fi
if ! command -v node > /dev/null 2>&1; then
  echo "post-digest: node is required to build the JSON payload and was not found" >&2
  exit 1
fi

# Discord rejects empty messages and anything over 2000 characters. Refuse instead of truncating,
# so the overseer rewrites the digest rather than posting a cut-off one.
payload="$(node -e '
const fs = require("node:fs");
const text = fs.readFileSync(process.argv[1], "utf8").trim();
if (text.length === 0) { console.error("post-digest: the digest is empty"); process.exit(1); }
if ([...text].length > 2000) { console.error("post-digest: the digest is " + [...text].length + " characters; Discord allows 2000"); process.exit(1); }
process.stdout.write(JSON.stringify({ content: text }));
' "$digest")"

curl --fail --silent --show-error \\
  -H "Content-Type: application/json" \\
  -X POST \\
  --data "$payload" \\
  "\${DISCORD_WEBHOOK_URL}" > /dev/null

echo "post-digest: posted $digest"
`;
  return { path: "scripts/post-digest.sh", contents };
}

export function statusContract(): { run: unknown; team: unknown; overseer: unknown } {
  return {
    run: {
      schemaVersion: SCHEMA_VERSION,
      teamId: "<teamId>",
      startedAt: "<ISO 8601 UTC>",
      endedAt: "<ISO 8601 UTC, omit while the run is open>",
      outcome: "done | failed (omit while open)",
      sessionId: "<value of $CLAUDE_CODE_REMOTE_SESSION_ID>",
      sessionUrl: "https://claude.ai/code/<session id with cse_ replaced by session_>",
      agents: [
        {
          agentId: "<agentId>",
          state: "idle | working | done | failed",
          note: "<optional one line>",
        },
      ],
      grantsUsed: [{ grantId: "<grantId>", count: 1 }],
      ledger: { changed: true, linesAdded: 0, linesRemoved: 0, summary: "<optional one line>" },
      error: "<required when outcome is failed>",
      notes: "<optional one line, e.g. a fallback branch or a skipped step>",
    },
    team: {
      schemaVersion: SCHEMA_VERSION,
      teamId: "<teamId>",
      updatedAt: "<ISO 8601 UTC>",
      lastRunStartedAt: "<startedAt of the latest run>",
      agents: [{ agentId: "<agentId>", state: "idle | working | done | failed" }],
      ledgerPath: "ledger/<teamId>.md",
    },
    overseer: {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: "<ISO 8601 UTC>",
      state: "idle | reconciling | reported | attention",
      lastRunStartedAt: "<ISO 8601 UTC>",
      lastOutwardPostAt: "<ISO 8601 UTC of the last Discord post>",
      reconciled: 0,
      attention: [{ teamId: "<teamId>", reason: "<one line>" }],
      digestPath: "status/digest.md",
      notes: "<optional one line>",
    },
  };
}

export function emitStatusReadme(): EmittedFile {
  const c = statusContract();
  const contents = `# status/

Written by the Routines, read by the dashboard. Every file carries \`schemaVersion: ${SCHEMA_VERSION}\`.
Unknown fields are tolerated; missing required fields make the dashboard mark the station
"needs attention" and show the problem rather than guess.

## status/runs/<teamId>/<startedAt>.json

One file per run. The filename is the ISO start time with \`:\` replaced by \`-\`
(for example \`2026-09-27T14-00-04Z.json\`). Write it at the start of the run without \`endedAt\`
and \`outcome\`, then rewrite it at the end.

${json(c.run)}

## status/teams/<teamId>.json

The latest state of the station; rewritten at the end of every run.

${json(c.team)}

## status/overseer.json and status/digest.md

Written by the overseer. The digest is the Markdown it posts outward (System Report).

${json(c.overseer)}
`;
  return { path: "status/README.md", contents };
}

export function emitGitkeeps(): EmittedFile[] {
  return [
    { path: "status/runs/.gitkeep", contents: "" },
    { path: "status/teams/.gitkeep", contents: "" },
  ];
}

export { grantsOf };
