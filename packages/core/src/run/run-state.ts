/**
 * The run lifecycle (brief §8) as a pure transition table. The runtime asks this before every
 * state change and records the result; nothing else decides what a run may do next.
 */
export const RUN_STATES = [
  "queued",
  "running",
  "awaiting_consent",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
  "blocked_budget",
] as const;
export type RunState = (typeof RUN_STATES)[number];

export const RUN_EVENTS = [
  "start",
  "await_consent",
  "resolve_consent",
  "complete",
  "fail",
  "cancel",
  "interrupt",
  "block_budget",
] as const;
export type RunEvent = (typeof RUN_EVENTS)[number];

const TABLE: Readonly<Record<RunState, Partial<Record<RunEvent, RunState>>>> = {
  queued: {
    start: "running",
    block_budget: "blocked_budget",
    cancel: "cancelled",
    interrupt: "interrupted",
  },
  running: {
    await_consent: "awaiting_consent",
    complete: "completed",
    fail: "failed",
    cancel: "cancelled",
    interrupt: "interrupted",
    // Budgets are checked before every model call, including between steps (brief §15).
    block_budget: "blocked_budget",
  },
  awaiting_consent: {
    resolve_consent: "running",
    cancel: "cancelled",
    interrupt: "interrupted",
  },
  completed: {},
  failed: {},
  cancelled: {},
  interrupted: {},
  blocked_budget: {},
};

/** The next state, or undefined when the event is not allowed from `state`. Pure. */
export function nextRunState(state: RunState, event: RunEvent): RunState | undefined {
  return TABLE[state][event];
}

/** No event leaves a terminal state; an interrupted run is surfaced, never resumed. */
export function isTerminal(state: RunState): boolean {
  return Object.keys(TABLE[state]).length === 0;
}
