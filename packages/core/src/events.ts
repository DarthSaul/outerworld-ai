import { deriveHealth, own } from "./health.js";
import { SCHEMA_VERSION } from "./schema/common.js";
import {
  RECENT_RUNS_MAX,
  type RunSummary,
  type StationState,
  type TeamState,
} from "./schema/state.js";
import type { Station } from "./schema/station.js";
import type { AgentRunState, OverseerState, RunOutcome } from "./schema/status.js";

/** State events derived from the ledger or scripted by the demo timeline. UI events live in ui. */
export type StationEvent =
  | { readonly type: "run.started"; readonly teamId: string; readonly at: string }
  | {
      readonly type: "agent.state";
      readonly teamId: string;
      readonly agentId: string;
      readonly state: AgentRunState;
      readonly at: string;
      readonly note?: string;
    }
  | {
      readonly type: "ledger.written";
      readonly teamId: string;
      readonly at: string;
      readonly linesAdded: number;
      readonly linesRemoved: number;
    }
  | {
      readonly type: "run.finished";
      readonly teamId: string;
      readonly at: string;
      readonly outcome: RunOutcome;
      readonly error?: string;
    }
  | { readonly type: "overseer.state"; readonly state: OverseerState; readonly at: string }
  | { readonly type: "digest.posted"; readonly at: string };

const emptyLedger = (): RunSummary["ledger"] => ({
  changed: false,
  linesAdded: 0,
  linesRemoved: 0,
});

/** A StationState with no history: every team ok and idle. The demo timeline starts here. */
export function emptyState(
  station: Station,
  options: { readonly now: string; readonly sourcePath: string; readonly sourceRef?: string },
): StationState {
  const teams: Record<string, TeamState> = {};
  for (const t of station.teams) {
    teams[t.id] = {
      health: "ok",
      run: "idle",
      recentRuns: [],
      ledger: { path: `ledger/${t.id}.md`, exists: false, changedInLastRun: false },
      degraded: false,
    };
  }
  const agents: StationState["agents"] = {};
  for (const a of station.agents) agents[a.id] = { state: "idle" };
  const handoffs: StationState["handoffs"] = {};
  for (const h of station.handoffs) handoffs[h.id] = { carrying: false };
  return {
    schemaVersion: SCHEMA_VERSION,
    provenance: {
      asOf: options.now,
      sourcePath: options.sourcePath,
      ...(options.sourceRef !== undefined ? { sourceRef: options.sourceRef } : {}),
    },
    teams,
    agents,
    handoffs,
    overseer: { state: "idle", reconciled: 0, attention: [] },
    issues: [],
  };
}

/** `(state, event) => state` with the Station bound, for reducers and timelines. */
export function bindReducer(
  station: Station,
): (state: StationState, event: StationEvent) => StationState {
  return (state, event) => applyEvent(state, event, station);
}

/**
 * Applies one event and returns a new state. Pure. The Station says which agents and handoffs
 * belong to a team. Health is re-derived with the same rules the ledger parser uses.
 */
export function applyEvent(
  state: StationState,
  event: StationEvent,
  station: Station,
): StationState {
  const next = structuredClone(state);
  next.provenance = { ...next.provenance, asOf: event.at };

  if (event.type === "overseer.state") {
    next.overseer = { ...next.overseer, state: event.state, lastRunStartedAt: event.at };
    return next;
  }
  if (event.type === "digest.posted") {
    next.overseer = { ...next.overseer, state: "reported", lastOutwardPostAt: event.at };
    return next;
  }

  const team = own(next.teams, event.teamId);
  if (!team) {
    next.issues = [
      ...next.issues,
      {
        level: "warn",
        path: `event.${event.type}`,
        message: `unknown team "${event.teamId}"; event ignored`,
      },
    ];
    return next;
  }
  const memberIds = station.agents.filter((a) => a.teamId === event.teamId).map((a) => a.id);
  const outbound = station.handoffs.filter((h) => h.from === event.teamId).map((h) => h.id);

  switch (event.type) {
    case "run.started": {
      team.run = "working";
      team.lastRun = { startedAt: event.at, grantsUsed: [], ledger: emptyLedger() };
      team.ledger = { ...team.ledger, changedInLastRun: false };
      team.degraded = false;
      for (const id of memberIds) next.agents[id] = { state: "working" };
      for (const id of outbound) next.handoffs[id] = { carrying: false };
      break;
    }
    case "agent.state": {
      if (!own(next.agents, event.agentId)) {
        next.issues = [
          ...next.issues,
          {
            level: "warn",
            path: "event.agent.state",
            message: `unknown agent "${event.agentId}"; event ignored`,
          },
        ];
        break;
      }
      next.agents[event.agentId] = {
        state: event.state,
        ...(event.note !== undefined ? { note: event.note } : {}),
      };
      break;
    }
    case "ledger.written": {
      const ledger = {
        changed: true,
        linesAdded: event.linesAdded,
        linesRemoved: event.linesRemoved,
      };
      team.ledger = { ...team.ledger, exists: true, changedInLastRun: true };
      if (team.lastRun) team.lastRun = { ...team.lastRun, ledger };
      for (const id of outbound) next.handoffs[id] = { carrying: true };
      break;
    }
    case "run.finished": {
      const finished: RunSummary = {
        ...(team.lastRun ?? { startedAt: event.at, grantsUsed: [], ledger: emptyLedger() }),
        endedAt: event.at,
        outcome: event.outcome,
        ...(event.error !== undefined ? { error: event.error } : {}),
      };
      team.lastRun = finished;
      team.run = event.outcome;
      // The open run may already be in recentRuns (parsed from the ledger): replace it, don't duplicate it.
      const rest = team.recentRuns.filter((r) => r.startedAt !== finished.startedAt);
      team.recentRuns = [finished, ...rest].slice(0, RECENT_RUNS_MAX);
      const overseerReason = next.overseer.attention.find((a) => a.teamId === event.teamId)?.reason;
      const malformed = team.healthReason === "a status file for this team could not be read";
      const h = deriveHealth({
        latest: finished,
        stalled: false,
        ...(overseerReason !== undefined ? { overseerReason } : {}),
        malformed,
      });
      team.health = h.health;
      team.healthReason = h.healthReason;
      for (const id of memberIds) next.agents[id] = { state: event.outcome };
      break;
    }
  }
  return next;
}
