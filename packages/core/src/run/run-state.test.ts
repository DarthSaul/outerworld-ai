import { describe, expect, it } from "vitest";
import {
  isTerminal,
  nextRunState,
  RUN_EVENTS,
  RUN_STATES,
  type RunEvent,
  type RunState,
} from "./run-state.js";

/** Every allowed transition in brief §8's diagram, plus a budget stop between steps. */
const ALLOWED: ReadonlyArray<[RunState, RunEvent, RunState]> = [
  ["queued", "start", "running"],
  ["queued", "block_budget", "blocked_budget"],
  ["queued", "cancel", "cancelled"],
  ["queued", "interrupt", "interrupted"],
  ["running", "await_consent", "awaiting_consent"],
  ["running", "complete", "completed"],
  ["running", "fail", "failed"],
  ["running", "cancel", "cancelled"],
  ["running", "interrupt", "interrupted"],
  ["running", "block_budget", "blocked_budget"],
  ["awaiting_consent", "resolve_consent", "running"],
  ["awaiting_consent", "cancel", "cancelled"],
  ["awaiting_consent", "interrupt", "interrupted"],
];

describe("run state machine", () => {
  it.each(ALLOWED)("%s --%s--> %s", (from, event, to) => {
    expect(nextRunState(from, event)).toBe(to);
  });

  it("refuses every other transition", () => {
    const allowed = new Set(ALLOWED.map(([f, e]) => `${f}:${e}`));
    for (const from of RUN_STATES) {
      for (const event of RUN_EVENTS) {
        if (allowed.has(`${from}:${event}`)) continue;
        expect(nextRunState(from, event), `${from} --${event}-->`).toBeUndefined();
      }
    }
  });

  it("marks completed, failed, cancelled, interrupted, and blocked_budget as terminal", () => {
    expect(RUN_STATES.filter(isTerminal)).toEqual([
      "completed",
      "failed",
      "cancelled",
      "interrupted",
      "blocked_budget",
    ]);
  });

  it("never resumes an interrupted run (surfaced on restart, never silently resumed)", () => {
    for (const event of RUN_EVENTS) expect(nextRunState("interrupted", event)).toBeUndefined();
  });
});
