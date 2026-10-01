import { describe, expect, it } from "vitest";
import type { RuntimeEvent } from "../runtime-events.js";
import { activityOf, type CrewActivityState, foldCrewActivity } from "./crew-activity.js";

let seq = 0;
const at = "2026-10-01T09:00:00.000Z";
const ev = (event: Omit<RuntimeEvent, "seq" | "at">) =>
  ({ ...event, seq: ++seq, at }) as RuntimeEvent;
const ids = (runId: string, agentId = "quill") => ({ agentId, sessionId: `s-${runId}`, runId });
const fold = (events: RuntimeEvent[]) => events.reduce<CrewActivityState>(foldCrewActivity, {});

describe("crew activity from events", () => {
  it("follows one run: running, waiting for consent, running again, done", () => {
    const steps: string[] = [];
    let state: CrewActivityState = {};
    for (const e of [
      ev({ type: "run.queued", ...ids("r1"), payload: { trigger: "user" } }),
      ev({ type: "run.awaiting_consent", ...ids("r1"), payload: { consentId: "k1" } }),
      ev({
        type: "consent.resolved",
        ...ids("r1"),
        payload: { consentId: "k1", decision: "approved" },
      }),
      ev({ type: "run.completed", ...ids("r1"), payload: {} }),
    ]) {
      state = foldCrewActivity(state, e);
      steps.push(activityOf(state, "quill").state);
    }
    expect(steps).toEqual(["running", "awaiting_consent", "running", "done"]);
    expect(activityOf(state, "quill")).toEqual({ state: "done", runs: 0, sessionId: "s-r1", at });
  });

  it("aggregates runs at once: waiting for consent outranks running", () => {
    const state = fold([
      ev({ type: "run.started", ...ids("a"), payload: { model: "m" } }),
      ev({ type: "run.started", ...ids("b"), payload: { model: "m" } }),
      ev({ type: "run.awaiting_consent", ...ids("b"), payload: { consentId: "k" } }),
    ]);
    expect(activityOf(state, "quill")).toMatchObject({
      state: "awaiting_consent",
      runs: 2,
      sessionId: "s-b",
    });
    const after = foldCrewActivity(
      state,
      ev({ type: "run.cancelled", ...ids("b"), payload: { by: "user" } }),
    );
    expect(activityOf(after, "quill")).toMatchObject({
      state: "running",
      runs: 1,
      sessionId: "s-a",
    });
  });

  it("marks how a run ended: failed, interrupted, stopped by a budget or the kill switch, cancelled", () => {
    const end = (e: RuntimeEvent) =>
      activityOf(
        fold([ev({ type: "run.started", ...ids("r"), payload: { model: "m" } }), e]),
        "quill",
      );
    expect(
      end(ev({ type: "run.failed", ...ids("r"), payload: { error: "HTTP 500" } })),
    ).toMatchObject({
      state: "failed",
      detail: "HTTP 500",
    });
    expect(end(ev({ type: "run.interrupted", ...ids("r"), payload: {} })).state).toBe("failed");
    expect(
      end(ev({ type: "run.cancelled", ...ids("r"), payload: { by: "budget" } })),
    ).toMatchObject({
      state: "blocked",
      detail: "budget",
    });
    expect(
      end(ev({ type: "run.cancelled", ...ids("r"), payload: { by: "kill_switch" } })),
    ).toMatchObject({
      state: "blocked",
      detail: "kill_switch",
    });
    expect(end(ev({ type: "run.cancelled", ...ids("r"), payload: { by: "user" } })).state).toBe(
      "idle",
    );
  });

  it("keeps crew members apart, ignores deltas, and knows nothing of crew it never saw", () => {
    const state = fold([
      ev({ type: "run.started", ...ids("r1", "quill"), payload: { model: "m" } }),
      ev({ type: "run.delta", ...ids("r1", "quill"), payload: { text: "hi" } }),
      ev({ type: "run.completed", ...ids("r2", "vesper"), payload: {} }),
    ]);
    expect(activityOf(state, "quill").state).toBe("running");
    expect(activityOf(state, "vesper").state).toBe("done");
    expect(activityOf(state, "nobody")).toEqual({ state: "idle", runs: 0 });
  });
});
