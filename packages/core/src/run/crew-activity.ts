import type { RuntimeEvent } from "../runtime-events.js";

/**
 * What a crew member is doing now, folded from run events (brief §10): the map is a projection of
 * events, never a simulation. A crew member can have several runs at once (one per dispatch), so
 * the active runs are kept apart and the strongest state wins: waiting for consent, then running,
 * then how the last run ended.
 */
export type CrewActivity = "idle" | "running" | "awaiting_consent" | "done" | "failed" | "blocked";

type Active = "running" | "awaiting_consent";
type Ended = "idle" | "done" | "failed" | "blocked";

interface AgentRuns {
  readonly active: Readonly<Record<string, { state: Active; sessionId: string; at: string }>>;
  readonly last?: { state: Ended; sessionId: string; at: string; detail?: string };
}

export type CrewActivityState = Readonly<Record<string, AgentRuns>>;

export interface CrewActivityEntry {
  readonly state: CrewActivity;
  /** Runs in flight. */
  readonly runs: number;
  /** Where to look: the session of the run that decided the state. */
  readonly sessionId?: string;
  readonly at?: string;
  /** Why a run ended badly: the error, or what stopped it (`budget`, `kill_switch`). */
  readonly detail?: string;
}

const ACTIVE_EVENTS = new Set(["run.queued", "run.started", "run.steered", "consent.resolved"]);

export function foldCrewActivity(state: CrewActivityState, event: RuntimeEvent): CrewActivityState {
  if (event.ephemeral || !event.agentId || !event.runId || !event.sessionId) return state;
  const { agentId, runId, sessionId, at } = event;
  const current: AgentRuns = state[agentId] ?? { active: {} };
  const activate = (s: Active): AgentRuns => ({
    ...current,
    active: { ...current.active, [runId]: { state: s, sessionId, at } },
  });
  const end = (s: Ended, detail?: string): AgentRuns => {
    const { [runId]: _ended, ...active } = current.active;
    return { active, last: { state: s, sessionId, at, ...(detail ? { detail } : {}) } };
  };
  let next: AgentRuns | undefined;
  if (ACTIVE_EVENTS.has(event.type)) next = activate("running");
  else if (event.type === "run.awaiting_consent") next = activate("awaiting_consent");
  else if (event.type === "run.completed") next = end("done");
  else if (event.type === "run.failed") next = end("failed", event.payload.error);
  else if (event.type === "run.interrupted") next = end("failed");
  else if (event.type === "run.cancelled")
    next = event.payload.by === "user" ? end("idle") : end("blocked", event.payload.by);
  // A cap stops a run with budget.blocked (state blocked_budget), not run.cancelled.
  else if (event.type === "budget.blocked") next = end("blocked", "budget");
  return next ? { ...state, [agentId]: next } : state;
}

export function activityOf(state: CrewActivityState, agentId: string): CrewActivityEntry {
  const runs = state[agentId];
  if (!runs) return { state: "idle", runs: 0 };
  const active = Object.values(runs.active).sort((a, b) => b.at.localeCompare(a.at));
  const count = active.length;
  const top =
    active.find((r) => r.state === "awaiting_consent") ?? active.find((r) => r.state === "running");
  if (top) return { state: top.state, runs: count, sessionId: top.sessionId, at: top.at };
  if (!runs.last) return { state: "idle", runs: 0 };
  return {
    state: runs.last.state,
    runs: 0,
    sessionId: runs.last.sessionId,
    at: runs.last.at,
    ...(runs.last.detail ? { detail: runs.last.detail } : {}),
  };
}

/** Every event type that can change crew activity, so storage can filter by type. */
export const CREW_ACTIVITY_EVENT_TYPES = [
  "run.queued",
  "run.started",
  "run.steered",
  "run.awaiting_consent",
  "consent.resolved",
  "run.completed",
  "run.failed",
  "run.interrupted",
  "run.cancelled",
  "budget.blocked",
] as const;
