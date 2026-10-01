import type { AgentConfig } from "./config/agent-config.js";
import type { PropKind, StationConfig } from "./config/station-config.js";
import { term } from "./glossary.js";
import type { CrewActivityEntry } from "./run/crew-activity.js";
import type { AgentStateEntry, Health, StationState, TeamState } from "./schema/state.js";
import type {
  Agent,
  Grant,
  GrantMode,
  Rig,
  RigHead,
  RigTrace,
  Station,
  Team,
} from "./schema/station.js";
import type { AgentRunState, OverseerState } from "./schema/status.js";

/**
 * The station map (brief §3 goal 9) draws the runtime through the map model the ui already
 * renders (D14, D24): rooms are panels, props and granted connectors are chips, hallways are
 * handoffs, the Overseer is the core at the edge, and live state comes only from crew activity
 * folded from events. Pure.
 */

const PROP_MODE: Record<PropKind, GrantMode> = { web: "read", memory: "read", files: "write" };
const HEADS: readonly RigHead[] = ["dome", "wedge"];
const TRACES: readonly RigTrace[] = ["core", "bar", "chevron", "split", "twin"];

/** A small stable hash, so a crew member without a rig keeps the same look everywhere. */
const hash = (s: string) => {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
};

const rigFor = (id: string, config: AgentConfig): Rig => {
  if (config.rig) return config.rig;
  const h = hash(id);
  return {
    tintHue: h % 360,
    trimHue: (h * 7 + 137) % 360,
    head: HEADS[h % HEADS.length] ?? "dome",
    trace: TRACES[(h >>> 4) % TRACES.length] ?? "core",
  };
};

const NOTES: Partial<Record<CrewActivityEntry["state"], (e: CrewActivityEntry) => string>> = {
  awaiting_consent: () => "waiting for your approval",
  blocked: (e) =>
    e.detail === "kill_switch" ? "stopped by the kill switch" : "stopped by a budget",
  failed: (e) => (e.detail ? `last run failed: ${e.detail}` : "last run failed"),
};

const RIG_STATE: Record<CrewActivityEntry["state"], AgentRunState> = {
  idle: "idle",
  running: "working",
  awaiting_consent: "working",
  done: "done",
  failed: "failed",
  blocked: "failed",
};

const OVERSEER_STATE: Record<CrewActivityEntry["state"], OverseerState> = {
  idle: "idle",
  running: "reconciling",
  awaiting_consent: "attention",
  done: "reported",
  failed: "attention",
  blocked: "attention",
};

const IDLE: CrewActivityEntry = { state: "idle", runs: 0 };

export function mapModelFor(
  config: StationConfig,
  crew: readonly { readonly id: string; readonly config: AgentConfig }[],
  activity: Readonly<Record<string, CrewActivityEntry>>,
  asOf: string,
): { station: Station; state: StationState } {
  const overseer = crew.find((a) => a.config.role === "overseer");
  const members = crew.filter((a) => a !== overseer);
  const connectorName = (id: string) => config.connectors.find((c) => c.id === id)?.name ?? id;

  const teams: Team[] = config.rooms.map((room) => ({
    id: room.id,
    name: room.name,
    mission: room.description ?? room.name,
    category: "other",
    emblem: { hue: hash(room.id) % 360, mark: "none" },
    scope: { repos: [] },
    schedule: { kind: "interval", everyMinutes: 60 },
  }));

  const grants: Grant[] = [];
  for (const room of config.rooms) {
    for (const prop of room.props) {
      grants.push({
        id: `${room.id}--${prop.kind}`,
        teamId: room.id,
        tool: prop.kind,
        mode: PROP_MODE[prop.kind],
        kind: "skill",
        label: term(`prop.${prop.kind}`),
      });
    }
    const granted = new Set(
      crew.filter((a) => a.config.roomId === room.id).flatMap((a) => a.config.connectorGrants),
    );
    for (const connectorId of granted) {
      grants.push({
        id: `${room.id}--${connectorId}`,
        teamId: room.id,
        tool: connectorId,
        mode: "write",
        kind: "connector",
        label: connectorName(connectorId),
      });
    }
  }

  const agents: Agent[] = members.map(({ id, config: a }) => ({
    id,
    teamId: a.roomId,
    persona: {
      name: a.name,
      mandate: term(`approvalMode.${a.approvalMode}`),
      tone: a.approvalMode,
      allowlist: grants
        .filter(
          (g) =>
            g.teamId === a.roomId && (g.kind === "skill" || a.connectorGrants.includes(g.tool)),
        )
        .map((g) => g.id),
      rig: rigFor(id, a),
    },
  }));

  const station: Station = {
    schemaVersion: 1,
    id: "station",
    name: config.name,
    teams,
    agents,
    grants,
    handoffs: config.lanes.map((l) => ({ id: l.id, from: l.from, to: l.to })),
    overseer: {
      persona: {
        name: overseer?.config.name ?? term("overseer.role"),
        mandate: term("overseer.role"),
        tone: "plain",
      },
      schedule: { kind: "interval", everyMinutes: 60 },
      outward: { kind: "discord-webhook" },
    },
  };

  const entryOf = (id: string) => activity[id] ?? IDLE;
  const agentStates: Record<string, AgentStateEntry> = {};
  for (const a of members) {
    const e = entryOf(a.id);
    const note = NOTES[e.state]?.(e);
    agentStates[a.id] = { state: RIG_STATE[e.state], ...(note ? { note } : {}) };
  }

  const teamStates: Record<string, TeamState> = {};
  const attention: { teamId: string; reason: string }[] = [];
  for (const room of config.rooms) {
    const entries = members.filter((a) => a.config.roomId === room.id).map((a) => entryOf(a.id));
    const has = (s: CrewActivityEntry["state"]) => entries.find((e) => e.state === s);
    const waiting = has("awaiting_consent");
    const blocked = has("blocked");
    const failed = has("failed");
    const health: Health = waiting || failed ? "attention" : blocked ? "stalled" : "ok";
    const reason = waiting
      ? NOTES.awaiting_consent?.(waiting)
      : failed
        ? NOTES.failed?.(failed)
        : blocked
          ? NOTES.blocked?.(blocked)
          : undefined;
    const run: AgentRunState =
      has("running") || waiting
        ? "working"
        : failed || blocked
          ? "failed"
          : has("done")
            ? "done"
            : "idle";
    teamStates[room.id] = {
      health,
      ...(reason ? { healthReason: reason } : {}),
      run,
      recentRuns: [],
      ledger: { path: "", exists: false, changedInLastRun: false },
      degraded: false,
    };
    if (health !== "ok" && reason) attention.push({ teamId: room.id, reason });
  }

  const state: StationState = {
    schemaVersion: 1,
    provenance: { asOf, sourcePath: "runtime" },
    teams: teamStates,
    agents: agentStates,
    handoffs: Object.fromEntries(config.lanes.map((l) => [l.id, { carrying: false }])),
    overseer: {
      state: overseer ? OVERSEER_STATE[entryOf(overseer.id).state] : "idle",
      reconciled: 0,
      attention,
    },
    issues: [],
  };
  return { station, state };
}
