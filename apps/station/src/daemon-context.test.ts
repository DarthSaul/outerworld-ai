import type { RuntimeEvent } from "@darthsaul/outerworld-ai-core";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { invalidateFor } from "./daemon-context.js";

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
    expect(keys).toContainEqual(["sessions", "quill"]);
    expect(keys).toContainEqual(["session", "s1"]);
    expect(keys).toContainEqual(["activity"]);
  });
});
