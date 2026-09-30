import { describe, expect, it } from "vitest";
import {
  EVENT_TYPES,
  type NewRuntimeEvent,
  parseRuntimeEvent,
  type RuntimeEvent,
} from "./runtime-events.js";

const ids = { agentId: "pm", sessionId: "s1", runId: "r1" };

/** One valid example per event type. The test below fails when a type is added without one. */
const samples: Record<RuntimeEvent["type"], NewRuntimeEvent> = {
  "station.started": { type: "station.started", payload: {} },
  "station.stopped": { type: "station.stopped", payload: { reason: "shutdown" } },
  "station.updated": { type: "station.updated", payload: {} },
  "station.kill_switch": { type: "station.kill_switch", payload: { engaged: true } },
  "agent.updated": { type: "agent.updated", agentId: "pm", payload: { change: "created" } },
  "session.created": {
    type: "session.created",
    agentId: "pm",
    sessionId: "s1",
    payload: { title: "Daily" },
  },
  "session.renamed": {
    type: "session.renamed",
    agentId: "pm",
    sessionId: "s1",
    payload: { title: "Weekly" },
  },
  "session.archived": { type: "session.archived", agentId: "pm", sessionId: "s1", payload: {} },
  "run.queued": { type: "run.queued", ...ids, payload: { trigger: "user" } },
  "run.started": { type: "run.started", ...ids, payload: { model: "vendor/model-a" } },
  "run.delta": { type: "run.delta", ...ids, payload: { text: "Hel" } },
  "run.tool_call": {
    type: "run.tool_call",
    ...ids,
    payload: { toolCallId: "c1", tool: "web_fetch", input: { url: "x" }, class: "read" },
  },
  "run.tool_result": {
    type: "run.tool_result",
    ...ids,
    payload: { toolCallId: "c1", tool: "web_fetch", ok: true },
  },
  "run.awaiting_consent": { type: "run.awaiting_consent", ...ids, payload: { consentId: "k1" } },
  "run.retrying": { type: "run.retrying", ...ids, payload: { attempt: 1, delayMs: 2000 } },
  "run.completed": { type: "run.completed", ...ids, payload: {} },
  "run.failed": { type: "run.failed", ...ids, payload: { error: "provider error" } },
  "run.cancelled": { type: "run.cancelled", ...ids, payload: { by: "user" } },
  "run.interrupted": { type: "run.interrupted", ...ids, payload: {} },
  "dispatch.started": {
    type: "dispatch.started",
    ...ids,
    payload: { dispatchId: "d1", to: "pm", task: "Update the hub" },
  },
  "dispatch.completed": {
    type: "dispatch.completed",
    ...ids,
    payload: { dispatchId: "d1", summary: "Done" },
  },
  "dispatch.failed": {
    type: "dispatch.failed",
    ...ids,
    payload: { dispatchId: "d1", error: "worker failed" },
  },
  "dispatch.cancelled": { type: "dispatch.cancelled", ...ids, payload: { dispatchId: "d1" } },
  "consent.requested": {
    type: "consent.requested",
    ...ids,
    payload: { consentId: "k1", toolCallId: "c1", tool: "write_file", input: { path: "a.md" } },
  },
  "consent.resolved": {
    type: "consent.resolved",
    ...ids,
    payload: { consentId: "k1", decision: "denied" },
  },
  "memory.proposed": {
    type: "memory.proposed",
    agentId: "pm",
    runId: "r1",
    payload: { memoryId: "m1", text: "Prefers bullet points", scope: "agent" },
  },
  "memory.approved": { type: "memory.approved", agentId: "pm", payload: { memoryId: "m1" } },
  "memory.rejected": { type: "memory.rejected", agentId: "pm", payload: { memoryId: "m1" } },
  "schedule.fired": {
    type: "schedule.fired",
    agentId: "pm",
    payload: { scheduleId: "daily", scheduledFor: "2026-09-29T12:00:00.000Z" },
  },
  "schedule.missed": {
    type: "schedule.missed",
    agentId: "pm",
    payload: { scheduleId: "daily", scheduledFor: "2026-09-29T12:00:00.000Z" },
  },
  "connector.status": {
    type: "connector.status",
    payload: { connectorId: "notion", status: "needs_auth" },
  },
  "budget.warning": {
    type: "budget.warning",
    agentId: "pm",
    payload: { scope: "agent", spentUsd: 1.6, limitUsd: 2 },
  },
  "budget.blocked": {
    type: "budget.blocked",
    ...ids,
    payload: { scope: "run", spentUsd: 0.5, limitUsd: 0.5 },
  },
};

const stamp = (e: NewRuntimeEvent, seq = 1) => ({ ...e, seq, at: "2026-09-29T12:00:00.000Z" });

describe("runtime events", () => {
  it("has a sample for every event type", () => {
    expect(Object.keys(samples).sort()).toEqual([...EVENT_TYPES].sort());
  });

  it.each(EVENT_TYPES)("%s parses and round-trips through JSON", (type) => {
    const input = stamp(samples[type]);
    const r = parseRuntimeEvent(JSON.parse(JSON.stringify(input)));
    expect(r.issues).toEqual([]);
    expect(r.ok && r.value).toEqual(input);
  });

  it("covers the brief's event families", () => {
    const families = new Set(EVENT_TYPES.map((t) => t.split(".")[0]));
    expect([...families].sort()).toEqual(
      [
        "agent",
        "budget",
        "connector",
        "consent",
        "dispatch",
        "memory",
        "run",
        "schedule",
        "session",
        "station",
      ].sort(),
    );
  });

  it("requires the ids a family is about: run events need agent, session, and run", () => {
    const { runId: _drop, ...noRun } = stamp(samples["run.delta"]) as Record<string, unknown>;
    expect(parseRuntimeEvent(noRun).ok).toBe(false);
    const { sessionId: _s, ...noSession } = stamp(samples["session.created"]) as Record<
      string,
      unknown
    >;
    expect(parseRuntimeEvent(noSession).ok).toBe(false);
    const { agentId: _a, ...noAgent } = stamp(samples["agent.updated"]) as Record<string, unknown>;
    expect(parseRuntimeEvent(noAgent).ok).toBe(false);
  });

  it("marks an ephemeral event, which carries the last stored seq (possibly 0)", () => {
    const r = parseRuntimeEvent({ ...stamp(samples["run.delta"], 0), ephemeral: true });
    expect(r.ok && r.value.ephemeral).toBe(true);
    expect(parseRuntimeEvent({ ...stamp(samples["run.delta"]), ephemeral: false }).ok).toBe(false);
  });

  it("rejects an unknown type, a negative seq, and a bad timestamp", () => {
    expect(
      parseRuntimeEvent({ ...stamp(samples["station.updated"]), type: "run.exploded" }).ok,
    ).toBe(false);
    expect(parseRuntimeEvent(stamp(samples["station.updated"], -1)).ok).toBe(false);
    expect(parseRuntimeEvent({ ...stamp(samples["station.updated"]), at: "yesterday" }).ok).toBe(
      false,
    );
  });

  it("rejects payloads missing their required fields", () => {
    expect(parseRuntimeEvent({ ...stamp(samples["run.delta"]), payload: { chars: "x" } }).ok).toBe(
      false,
    );
    expect(
      parseRuntimeEvent({
        ...stamp(samples["consent.resolved"]),
        payload: { consentId: "k1", decision: "maybe" },
      }).ok,
    ).toBe(false);
  });

  it("keeps unknown payload fields so a newer daemon's events still parse", () => {
    const input = stamp({ type: "run.delta", ...ids, payload: { text: "a", tokens: 1 } });
    const r = parseRuntimeEvent(input);
    expect(r.ok && r.value.payload).toEqual({ text: "a", tokens: 1 });
  });
});
