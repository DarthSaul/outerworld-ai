import { describe, expect, it } from "vitest";
import { openDatabase } from "../storage/database.js";
import { EventStore } from "../storage/event-store.js";
import { MemoryStore } from "./memory-store.js";
import { createRememberTool } from "./remember.js";

const ctx = {
  agentId: "quill",
  sessionId: "s1",
  runId: "r1",
  depth: 0,
  signal: new AbortController().signal,
};

const setup = () => {
  const db = openDatabase(":memory:");
  const events = new EventStore(db);
  const memories = new MemoryStore(db);
  return { events, memories, tool: createRememberTool({ memories, events }) };
};

describe("remember", () => {
  it("is read-class: it only proposes; the Commander decides", () => {
    expect(setup().tool.class).toBe("read");
  });

  it("stores a proposal for this agent, never a belief, and logs memory.proposed", async () => {
    const { tool, memories, events } = setup();
    const out = await tool.execute({ text: "Prefers bullet points." }, ctx);
    expect(out).toMatchObject({ status: "proposed" });
    const [m] = memories.list("quill");
    expect(m).toMatchObject({
      agentId: "quill",
      scope: "agent",
      text: "Prefers bullet points.",
      status: "proposed",
      sourceRunId: "r1",
    });
    expect(events.since(0)).toEqual([
      expect.objectContaining({
        type: "memory.proposed",
        agentId: "quill",
        runId: "r1",
        payload: { memoryId: m?.id, text: "Prefers bullet points.", scope: "agent" },
      }),
    ]);
  });

  it("accepts a station-wide proposal", async () => {
    const { tool, memories } = setup();
    await tool.execute({ text: "The station runs on UTC.", scope: "station" }, ctx);
    expect(memories.list("quill")[0]?.scope).toBe("station");
  });

  it("refuses empty or oversized text", async () => {
    const { tool } = setup();
    await expect(tool.execute({ text: "" }, ctx)).rejects.toThrow(/invalid/);
    await expect(tool.execute({ text: "x".repeat(2001) }, ctx)).rejects.toThrow(/invalid/);
  });
});
