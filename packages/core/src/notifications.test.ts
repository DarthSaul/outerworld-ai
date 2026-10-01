import { describe, expect, it } from "vitest";
import { NOTIFICATION_EVENT_TYPES, notificationFor } from "./notifications.js";
import type { RuntimeEvent } from "./runtime-events.js";

const at = "2026-10-01T09:00:00.000Z";
const run = { agentId: "quill", sessionId: "s1", runId: "r1" };
const e = (event: Omit<RuntimeEvent, "seq" | "at">, seq = 7) =>
  ({ ...event, seq, at }) as RuntimeEvent;

describe("notificationFor", () => {
  it("asks the Commander to act on consent requests and memory proposals", () => {
    expect(
      notificationFor(
        e({
          type: "consent.requested",
          ...run,
          payload: { consentId: "k1", toolCallId: "c1", tool: "write_file", input: {} },
        }),
      ),
    ).toEqual({
      seq: 7,
      at,
      kind: "consent",
      level: "action",
      ...run,
      subject: "write_file",
    });
    expect(
      notificationFor(
        e({
          type: "memory.proposed",
          agentId: "quill",
          payload: { memoryId: "m1", text: "Likes bullets.", scope: "agent" },
        }),
      ),
    ).toMatchObject({
      kind: "memory",
      level: "action",
      agentId: "quill",
      detail: "Likes bullets.",
    });
  });

  it("reports a scheduled run's result, but not every run's", () => {
    expect(
      notificationFor(e({ type: "run.completed", ...run, payload: { trigger: "schedule" } })),
    ).toMatchObject({ kind: "schedule_done", level: "info", ...run });
    expect(
      notificationFor(e({ type: "run.completed", ...run, payload: { trigger: "user" } })),
    ).toBeUndefined();
    expect(notificationFor(e({ type: "run.completed", ...run, payload: {} }))).toBeUndefined();
  });

  it("raises an alert for failures, interruptions, budget stops, missed schedules, and the kill switch", () => {
    const kinds = [
      e({ type: "run.failed", ...run, payload: { error: "HTTP 500", trigger: "schedule" } }),
      e({ type: "run.interrupted", ...run, payload: {} }),
      e({
        type: "budget.blocked",
        agentId: "quill",
        runId: "r1",
        payload: { scope: "run", spentUsd: 5.1, limitUsd: 5 },
      }),
      e({
        type: "schedule.missed",
        agentId: "quill",
        payload: { scheduleId: "briefing", scheduledFor: at, reason: "down" },
      }),
      e({ type: "station.kill_switch", payload: { engaged: true } }),
      e({
        type: "connector.status",
        payload: { connectorId: "notion", status: "needs_auth", detail: "Sign in to connect" },
      }),
      e({ type: "run.completed", ...run, payload: { reason: "max_steps" } }),
    ].map((x) => {
      const n = notificationFor(x);
      return [n?.kind, n?.level];
    });
    expect(kinds).toEqual([
      ["run_failed", "alert"],
      ["run_interrupted", "alert"],
      ["budget_blocked", "alert"],
      ["schedule_missed", "alert"],
      ["kill_switch", "alert"],
      ["connector", "alert"],
      ["max_steps", "alert"],
    ]);
  });

  it("keeps details the screen needs: the error, the cap, the reason, the connector", () => {
    expect(
      notificationFor(e({ type: "run.failed", ...run, payload: { error: "HTTP 500" } }))?.detail,
    ).toBe("HTTP 500");
    expect(
      notificationFor(
        e({ type: "budget.warning", payload: { scope: "station", spentUsd: 40, limitUsd: 50 } }),
      ),
    ).toMatchObject({
      kind: "budget_warning",
      level: "info",
      subject: "station",
      detail: "$40.00 of $50.00",
    });
    expect(
      notificationFor(
        e({
          type: "schedule.missed",
          agentId: "quill",
          payload: { scheduleId: "briefing", scheduledFor: at, reason: "busy" },
        }),
      ),
    ).toMatchObject({ subject: "briefing", reason: "busy" });
    expect(
      notificationFor(
        e({
          type: "connector.status",
          payload: { connectorId: "notion", status: "error", detail: "ECONNREFUSED" },
        }),
      ),
    ).toMatchObject({ subject: "notion", detail: "ECONNREFUSED" });
  });

  it("reports finished dispatches to the Overseer's session", () => {
    expect(
      notificationFor(
        e({
          type: "dispatch.completed",
          agentId: "vesper",
          sessionId: "lead",
          runId: "r0",
          payload: { dispatchId: "d1", summary: "Updated the hub." },
        }),
      ),
    ).toMatchObject({
      kind: "dispatch_done",
      level: "info",
      sessionId: "lead",
      detail: "Updated the hub.",
    });
    expect(
      notificationFor(
        e({
          type: "dispatch.failed",
          agentId: "vesper",
          sessionId: "lead",
          runId: "r0",
          payload: { dispatchId: "d1", error: "boom" },
        }),
      ),
    ).toMatchObject({ kind: "dispatch_failed", level: "alert" });
  });

  it("ignores the chatter: deltas, tool calls, healthy connectors, the kill switch cleared", () => {
    expect(
      notificationFor(e({ type: "run.delta", ...run, payload: { text: "hi" } })),
    ).toBeUndefined();
    expect(
      notificationFor(
        e({ type: "connector.status", payload: { connectorId: "notion", status: "connected" } }),
      ),
    ).toBeUndefined();
    expect(
      notificationFor(e({ type: "station.kill_switch", payload: { engaged: false } })),
    ).toBeUndefined();
  });

  it("names every event type it can project, so storage can filter by type", () => {
    expect(NOTIFICATION_EVENT_TYPES).toContain("consent.requested");
    expect(NOTIFICATION_EVENT_TYPES).not.toContain("run.delta");
  });
});
