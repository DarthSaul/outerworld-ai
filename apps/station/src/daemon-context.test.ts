import type { RuntimeEvent } from "@darthsaul/outerworld-ai-core";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { batchInvalidations, invalidateFor } from "./daemon-context.js";

describe("invalidateFor", () => {
  it("refreshes the crew member's session list when a budget cap ends a run", () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    invalidateFor(
      {
        seq: 1,
        at: "2026-10-01T09:00:00.000Z",
        type: "budget.blocked",
        agentId: "quill",
        sessionId: "s1",
        runId: "r1",
        payload: { scope: "run", spentUsd: 0.6, limitUsd: 0.5 },
      } as RuntimeEvent,
      client,
    );
    const keys = spy.mock.calls.map(([filters]) => filters?.queryKey);
    // Every list: the crew member's own and the Station's station-wide one.
    expect(keys).toContainEqual(["sessions"]);
    expect(keys).toContainEqual(["session", "s1"]);
    expect(keys).toContainEqual(["activity"]);
  });
});

describe("batchInvalidations", () => {
  const started = (seq: number): RuntimeEvent =>
    ({ seq, at: "2026-10-01T09:00:00.000Z", type: "station.started", payload: {} }) as RuntimeEvent;

  it("collapses a burst of events (a replayed log) into one invalidation per query", () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    let flush: (() => void) | undefined;
    const batch = batchInvalidations(client, (f) => {
      flush = f;
    });
    // A long-lived station replays hundreds of these on every page load.
    for (let seq = 1; seq <= 500; seq++) invalidateFor(started(seq), batch);
    expect(spy).not.toHaveBeenCalled();
    flush?.();
    const keys = spy.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toEqual([["health"]]);
  });

  it("schedules one flush per burst and starts a new batch after it", () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    const flushes: (() => void)[] = [];
    const batch = batchInvalidations(client, (f) => flushes.push(f));
    invalidateFor(started(1), batch);
    invalidateFor(started(2), batch);
    expect(flushes).toHaveLength(1);
    flushes[0]?.();
    invalidateFor(started(3), batch);
    expect(flushes).toHaveLength(2);
    flushes[1]?.();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
