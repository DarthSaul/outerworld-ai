import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type Chunk,
  callTool,
  finish,
  hanging,
  reply,
  scripted,
  setup,
  streamOf,
} from "../test/loop.js";
import type { ToolImpl } from "./run-service.js";

/** A reply whose final step reports an OpenRouter cost, as the real provider does. */
const costing = (cost: number, text = "ok") =>
  streamOf([
    { type: "text-start", id: "t" },
    { type: "text-delta", id: "t", delta: text },
    { type: "text-end", id: "t" },
    { ...finish("stop"), providerMetadata: { openrouter: { usage: { cost } } } } as Chunk,
  ]);
const toolCosting = (cost: number, toolName: string, id: string) =>
  streamOf([
    {
      type: "tool-call",
      toolCallId: id,
      toolName,
      input: JSON.stringify({ path: "a.md", content: "x" }),
    },
    { ...finish("tool-calls"), providerMetadata: { openrouter: { usage: { cost } } } } as Chunk,
  ]);

const writeTool = (writes: unknown[] = []): ToolImpl => ({
  description: "write",
  inputSchema: { type: "object" },
  class: "write",
  execute: async (input) => {
    writes.push(input);
    return { ok: true };
  },
});

const waitFor = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 2));
  expect(check()).toBe(true);
};

const setBudgets = (home: string, budgets: Record<string, number>) => {
  const path = join(home, "station.json");
  const station = JSON.parse(readFileSync(path, "utf8"));
  writeFileSync(path, JSON.stringify({ ...station, budgets }));
};

const setApproval = (home: string, agent: string, approvalMode: "ask" | "full") => {
  const path = join(home, "agents", agent, "agent.json");
  writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, "utf8")), approvalMode }));
};

describe("consent under Ask first", () => {
  it("pauses a write call until the Commander approves, then runs it", async () => {
    const writes: unknown[] = [];
    const t = setup(scripted([callTool("write_file", { path: "a.md" }), reply("Written.")]), {
      tools: { write_file: writeTool(writes) },
    });
    const session = t.service.createSession("quill");
    const { runId } = await t.service.send(session.id, "Write it");
    await waitFor(() => t.consents.pending().length === 1);
    expect(t.sessions.getRun(runId)?.state).toBe("awaiting_consent");
    expect(writes).toEqual([]);
    const [consent] = t.consents.pending();
    expect(consent).toMatchObject({ tool: "write_file", input: { path: "a.md" }, runId });
    t.service.resolveConsent(consent?.id ?? "", "approved");
    const run = await t.service.settled(runId);
    expect(run.state).toBe("completed");
    expect(writes).toEqual([{ path: "a.md" }]);
    expect(t.stored()).toEqual(
      expect.arrayContaining(["consent.requested", "run.awaiting_consent", "consent.resolved"]),
    );
  });

  it("returns a denial to the model as the tool's result and never runs the tool", async () => {
    const writes: unknown[] = [];
    const t = setup(scripted([callTool("write_file", {}), reply("Understood.")]), {
      tools: { write_file: writeTool(writes) },
    });
    const session = t.service.createSession("quill");
    const { runId } = await t.service.send(session.id, "Write it");
    await waitFor(() => t.consents.pending().length === 1);
    t.service.resolveConsent(t.consents.pending()[0]?.id ?? "", "denied");
    expect((await t.service.settled(runId)).state).toBe("completed");
    expect(writes).toEqual([]);
    const result = t.sessions.messages(session.id).find((m) => m.message.role === "tool")?.message;
    expect(result).toMatchObject({ isError: true, output: expect.stringMatching(/denied/) });
    const second = t.model.doStreamCalls[1]?.prompt.at(-1);
    expect(JSON.stringify(second)).toContain("denied");
  });

  it("does not ask under Full power, nor for read calls", async () => {
    const writes: unknown[] = [];
    const t = setup(scripted([callTool("write_file", {}), reply("Done.")]), {
      tools: { write_file: writeTool(writes) },
    });
    setApproval(t.home, "quill", "full");
    const session = t.service.createSession("quill");
    await t.service.settled((await t.service.send(session.id, "Go")).runId);
    expect(writes).toHaveLength(1);
    expect(t.stored()).not.toContain("consent.requested");
  });

  it("never lets a request time out into approval: it waits until decided", async () => {
    const t = setup(scripted([callTool("write_file", {}), reply("x")]), {
      tools: { write_file: writeTool() },
    });
    const session = t.service.createSession("quill");
    const { runId } = await t.service.send(session.id, "Go");
    await waitFor(() => t.consents.pending().length === 1);
    await new Promise((r) => setTimeout(r, 30));
    expect(t.sessions.getRun(runId)?.state).toBe("awaiting_consent");
    await t.service.cancel(runId);
    await t.service.settled(runId);
  });

  it("cancels a run waiting for consent and expires the request", async () => {
    const t = setup(scripted([callTool("write_file", {})]), { tools: { write_file: writeTool() } });
    const session = t.service.createSession("quill");
    const { runId } = await t.service.send(session.id, "Go");
    await waitFor(() => t.consents.pending().length === 1);
    const id = t.consents.pending()[0]?.id ?? "";
    await t.service.cancel(runId);
    expect((await t.service.settled(runId)).state).toBe("cancelled");
    expect(t.consents.get(id)?.status).toBe("expired");
    expect(() => t.service.resolveConsent(id, "approved")).toThrow(/already expired/);
  });

  it("refuses to decide an unknown request", () => {
    const t = setup(scripted([]));
    expect(() => t.service.resolveConsent("nope", "approved")).toThrow(/no consent/);
  });

  it("after a restart, expires pending requests and interrupts their runs", async () => {
    const t = setup(scripted([callTool("write_file", {})]), { tools: { write_file: writeTool() } });
    const session = t.service.createSession("quill");
    const { runId } = await t.service.send(session.id, "Go");
    await waitFor(() => t.consents.pending().length === 1);
    const id = t.consents.pending()[0]?.id ?? "";
    // A second service over the same database stands in for the next daemon process.
    const { RunService } = await import("./run-service.js");
    const next = new RunService({
      home: t.home,
      events: t.events,
      sessions: t.sessions,
      consents: t.consents,
      spend: t.spend,
      killSwitch: t.killSwitch,
      models: () => {
        throw new Error("unused");
      },
    });
    next.recover();
    expect(t.consents.get(id)?.status).toBe("expired");
    expect(t.sessions.getRun(runId)?.state).toBe("interrupted");
    await t.service.cancel(runId);
    expect((await t.service.settled(runId)).state).toBe("interrupted");
  });
});

describe("spend and budgets", () => {
  it("records tokens and OpenRouter's cost for every model call", async () => {
    const t = setup(scripted([costing(0.012)]));
    const session = t.service.createSession("vesper");
    const { runId } = await t.service.send(session.id, "Hi");
    await t.service.settled(runId);
    expect(t.spend.forRun(runId)).toMatchObject({
      costUsd: 0.012,
      inputTokens: 10,
      outputTokens: 5,
      calls: 1,
    });
  });

  it("stops a run before a model call once its per-run cap is reached", async () => {
    const t = setup(
      scripted([
        toolCosting(0.3, "write_file", "a"),
        toolCosting(0.3, "write_file", "b"),
        reply("never"),
      ]),
      { tools: { write_file: writeTool() } },
    );
    setBudgets(t.home, { perRunUsd: 0.5 });
    setApproval(t.home, "quill", "full");
    const session = t.service.createSession("quill");
    const run = await t.service.settled((await t.service.send(session.id, "Go")).runId);
    expect(run.state).toBe("blocked_budget");
    expect(t.model.doStreamCalls).toHaveLength(2);
    const blocked = t.events.since(0).find((e) => e.type === "budget.blocked");
    expect(blocked?.payload).toEqual({ scope: "run", spentUsd: 0.6, limitUsd: 0.5 });
  });

  it("blocks a new run at once when the station's daily cap is already spent", async () => {
    const t = setup(scripted([costing(1), reply("never")]));
    setBudgets(t.home, { stationDailyUsd: 1 });
    const a = t.service.createSession("vesper");
    await t.service.settled((await t.service.send(a.id, "first")).runId);
    const b = t.service.createSession("quill");
    const second = await t.service.settled((await t.service.send(b.id, "second")).runId);
    expect(second.state).toBe("blocked_budget");
    expect(t.model.doStreamCalls).toHaveLength(1);
  });

  it("warns once at 80% of a cap", async () => {
    const t = setup(scripted([costing(0.85), costing(0.01)]));
    setBudgets(t.home, { perAgentDailyUsd: 1 });
    const s = t.service.createSession("vesper");
    await t.service.settled((await t.service.send(s.id, "one")).runId);
    await t.service.settled((await t.service.send(s.id, "two")).runId);
    const warnings = t.events.since(0).filter((e) => e.type === "budget.warning");
    expect(warnings.map((e) => e.payload)).toEqual([
      { scope: "agent", spentUsd: 0.85, limitUsd: 1 },
    ]);
  });
});

describe("the kill switch", () => {
  it("is saved before it acts, cancels every active run, and refuses new ones until cleared", async () => {
    const t = setup(scripted([(s) => hanging(s), reply("after")]));
    const session = t.service.createSession("vesper");
    const { runId } = await t.service.send(session.id, "Go");
    await waitFor(() => t.sessions.getRun(runId)?.state === "running");
    t.service.setKillSwitch(true);
    expect(t.killSwitch.engaged()).toBe(true);
    const run = await t.service.settled(runId);
    expect(run.state).toBe("cancelled");
    expect(t.events.since(0).find((e) => e.type === "run.cancelled")?.payload).toEqual({
      by: "kill_switch",
    });
    await expect(t.service.send(session.id, "again")).rejects.toThrow(/kill switch/);
    t.service.setKillSwitch(false);
    expect((await t.service.settled((await t.service.send(session.id, "again")).runId)).state).toBe(
      "completed",
    );
    expect(t.stored().filter((e) => e === "station.kill_switch")).toHaveLength(2);
  });

  it("cancels a run still queued for a slot", async () => {
    const t = setup(scripted([(s) => hanging(s)]), { concurrency: 1 });
    const a = t.service.createSession("vesper");
    const b = t.service.createSession("quill");
    const first = await t.service.send(a.id, "one");
    const second = await t.service.send(b.id, "two");
    t.service.setKillSwitch(true);
    expect((await t.service.settled(first.runId)).state).toBe("cancelled");
    expect((await t.service.settled(second.runId)).state).toBe("cancelled");
  });
});
