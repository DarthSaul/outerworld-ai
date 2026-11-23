import { describe, expect, it } from "vitest";
import type { RuntimeEvent } from "../runtime-events.js";
import { dispatchChain } from "./dispatch-chain.js";

let seq = 0;
const at = "2026-11-22T10:00:00.000Z";
const queued = (agentId: string, runId: string, parentRunId?: string): RuntimeEvent => ({
  seq: ++seq,
  at,
  agentId,
  sessionId: `s-${runId}`,
  runId,
  type: "run.queued",
  payload: { trigger: parentRunId ? "dispatch" : "user", ...(parentRunId ? { parentRunId } : {}) },
});
const started = (
  agentId: string,
  runId: string,
  to: string,
  workerRunId?: string,
): RuntimeEvent => ({
  seq: ++seq,
  at,
  agentId,
  sessionId: `s-${runId}`,
  runId,
  type: "dispatch.started",
  payload: {
    dispatchId: `d-${to}`,
    to,
    task: "t",
    ...(workerRunId ? { workerRunId, workerSessionId: `s-${workerRunId}` } : {}),
  },
});

describe("dispatchChain", () => {
  it("returns just the run when nothing dispatched it, and nothing for an unknown run", () => {
    const events = [queued("vesper", "r0")];
    expect(dispatchChain(events, "r0")).toEqual([{ agentId: "vesper", runId: "r0" }]);
    expect(dispatchChain(events, "nope")).toEqual([]);
  });

  it("follows dispatch.started from the worker back to the root, three levels deep", () => {
    const events = [
      queued("vesper", "r0"),
      started("vesper", "r0", "quill", "r1"),
      started("quill", "r1", "wren", "r2"),
      started("wren", "r2", "scout", "r3"),
    ];
    expect(dispatchChain(events, "r3")).toEqual([
      { agentId: "vesper", runId: "r0" },
      { agentId: "quill", runId: "r1" },
      { agentId: "wren", runId: "r2" },
      { agentId: "scout", runId: "r3" },
    ]);
  });

  it("follows a review run up through run.queued's parent, which it shares with its worker run", () => {
    const events = [
      queued("vesper", "r0"),
      started("vesper", "r0", "quill", "r1"),
      queued("quill", "r1-review", "r0"),
    ];
    expect(dispatchChain(events, "r1-review")).toEqual([
      { agentId: "vesper", runId: "r0" },
      { agentId: "quill", runId: "r1-review" },
    ]);
  });

  it("ignores older dispatch.started events with no worker run, and never loops", () => {
    const events = [
      started("vesper", "r0", "quill"),
      queued("quill", "a", "b"),
      queued("wren", "b", "a"),
    ];
    expect(dispatchChain(events, "r0")).toEqual([{ agentId: "vesper", runId: "r0" }]);
    expect(dispatchChain(events, "a")).toEqual([
      { agentId: "wren", runId: "b" },
      { agentId: "quill", runId: "a" },
    ]);
  });
});
