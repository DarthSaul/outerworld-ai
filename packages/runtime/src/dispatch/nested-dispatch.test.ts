import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dispatchChain } from "@darthsaul/outerworld-ai-core";
import { describe, expect, it } from "vitest";
import { ConflictError } from "../crew/crew-service.js";
import type { ToolImpl } from "../run/run-service.js";
import {
  byAgent,
  type Chunk,
  callTool,
  finish,
  hanging,
  reply,
  type Step,
  setup,
  streamOf,
} from "../test/loop.js";
import { dispatchChainOf } from "./dispatch-chain.js";
import { DispatchService } from "./dispatch-service.js";

/**
 * Nested dispatch, hallway reach, and the guards around them (ADR-0025), with the scripted model.
 * The fixture: Vesper (Overseer, Command, Ask first), Quill (Operations, Ask first, has dispatch),
 * Wren (Research, Full power). Hallways: Operations → Command, Research → Command, Operations →
 * Research.
 */

const editJson = (path: string, change: (json: Record<string, unknown>) => void) => {
  const json = JSON.parse(readFileSync(path, "utf8"));
  change(json);
  writeFileSync(path, JSON.stringify(json));
};
const editStation = (home: string, change: (s: Record<string, unknown>) => void) =>
  editJson(join(home, "station.json"), change);
const editAgent = (home: string, id: string, change: (a: Record<string, unknown>) => void) =>
  editJson(join(home, "agents", id, "agent.json"), change);
const setDispatch = (home: string, policy: Record<string, unknown>) =>
  editStation(home, (s) => {
    s.dispatch = { ...(s.dispatch as object), ...policy };
  });
const setBudgets = (home: string, budgets: Record<string, unknown>) =>
  editStation(home, (s) => {
    s.budgets = budgets;
  });
const giveDispatch = (home: string, id: string) =>
  editAgent(home, id, (a) => {
    a.canDispatch = true;
  });
const addRoom = (home: string, id: string, name: string) =>
  editStation(home, (s) => {
    s.rooms = [...(s.rooms as object[]), { id, name, props: [] }];
  });
const addLane = (home: string, from: string, to: string) =>
  editStation(home, (s) => {
    s.lanes = [...(s.lanes as object[]), { id: `${from}-to-${to}`, from, to }];
  });

/** A crew member with no dispatch and no connectors, in `roomId`. */
const addCrew = (home: string, id: string, name: string, roomId: string) => {
  const dir = join(home, "agents", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "agent.json"),
    JSON.stringify({
      schemaVersion: 1,
      name,
      roomId,
      role: "crew",
      model: "anthropic/claude-sonnet-5.5",
      approvalMode: "ask",
    }),
  );
  writeFileSync(join(dir, "identity.md"), `You are ${name}.\n`);
};

const withDispatch = (
  scripts: Record<string, Step[]>,
  prepare: (home: string) => void = () => {},
  options: Parameters<typeof setup>[1] = {},
) => {
  const t = setup(byAgent(scripts), options);
  addCrew(t.home, "scout", "Scout", "operations");
  addCrew(t.home, "moth", "Moth", "research");
  prepare(t.home);
  const dispatch = new DispatchService({
    home: t.home,
    runs: t.service,
    sessions: t.sessions,
    events: t.events,
    dispatches: t.dispatches,
  });
  const toolsOf = (name: string) =>
    t.model.doStreamCalls
      .filter((c) =>
        String(c.prompt.find((m) => m.role === "system")?.content ?? "").includes(
          `You are ${name}`,
        ),
      )
      .map((c) => (c.tools ?? []).map((x) => x.name));
  const errorsIn = (sessionId: string) =>
    t.sessions
      .messages(sessionId)
      .flatMap((m) =>
        m.message.role === "tool" && m.message.isError ? [String(m.message.output)] : [],
      );
  const reports = (sessionId: string) =>
    t.sessions.messages(sessionId).flatMap((m) => (m.message.role === "report" ? [m.message] : []));
  return { ...t, dispatch, toolsOf, errorsIn, reports };
};

const until = async (check: () => boolean, what = "condition") => {
  for (let i = 0; i < 1000 && !check(); i++) await new Promise((r) => setTimeout(r, 2));
  if (!check()) throw new Error(`timed out waiting for ${what}`);
};

const dispatchCall = (to: string, task: string, id = `d-${to}`) =>
  callTool("dispatch", { to, task }, id);

const costing = (cost: number, chunks: Chunk[], reason: "stop" | "tool-calls") =>
  streamOf([
    ...chunks,
    { ...finish(reason), providerMetadata: { openrouter: { usage: { cost } } } } as Chunk,
  ]);
const toolCall = (toolName: string, input: unknown, toolCallId: string): Chunk => ({
  type: "tool-call",
  toolCallId,
  toolName,
  input: JSON.stringify(input),
});

/**
 * A step that waits for `ready` before it streams, to order runs that would race. It gives up
 * when the call is aborted, and fails the call if `ready` never comes.
 */
const after =
  (ready: () => boolean, step: () => ReturnType<typeof reply>): Step =>
  (signal) => {
    const inner = step().stream as ReadableStream<Chunk>;
    return {
      stream: new ReadableStream<Chunk>({
        async start(c) {
          const deadline = Date.now() + 2000;
          while (!ready()) {
            if (signal.aborted) return c.error(new DOMException("aborted", "AbortError"));
            if (Date.now() > deadline) return c.error(new Error("never became ready"));
            await new Promise((r) => setTimeout(r, 2));
          }
          const reader = inner.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            c.enqueue(value);
          }
          c.close();
        },
      }),
    } as ReturnType<typeof reply>;
  };

const writeTool = (writes: unknown[]): ToolImpl => ({
  description: "write",
  inputSchema: { type: "object" },
  class: "write",
  execute: async (input) => {
    writes.push(input);
    return { ok: true, path: "notes.md" };
  },
});

describe("crew dispatch and hallways", () => {
  it("lets crew with dispatch hand work to a roommate, and the report comes back to it", async () => {
    const t = withDispatch({
      Quill: [
        dispatchCall("scout", "Tidy the plan"),
        reply("Asked Scout."),
        reply("Scout did it."),
      ],
      Scout: [reply("Plan tidied.")],
    });
    const s = t.service.createSession("quill", "Chat");
    await t.service.settled((await t.service.send(s.id, "Tidy the plan")).runId);
    const [d] = t.dispatches.forLeadSession(s.id);
    expect(d).toMatchObject({ leadAgentId: "quill", workerAgentId: "scout" });
    await until(() => t.reports(s.id).length === 1, "the report");
    expect(t.reports(s.id)[0]).toMatchObject({ from: "scout", status: "completed" });
    const task = t.sessions.messages(d?.workerSessionId ?? "")[0]?.message;
    expect(task).toMatchObject({ role: "user", text: expect.stringMatching(/^Task from Quill:/) });
    expect(task?.role === "user" && task.text).not.toMatch(/Overseer/);
    expect(task?.role === "user" && task.text).toMatch(/sent back to Quill/);
  });

  it("lets crew hand work along a hallway that leads from its room", async () => {
    const t = withDispatch({
      Quill: [dispatchCall("wren", "Find sources"), reply("Asked Wren."), reply("Reviewed.")],
      Wren: [reply("Three sources found.")],
    });
    const s = t.service.createSession("quill", "Chat");
    await t.service.settled((await t.service.send(s.id, "Research this")).runId);
    await until(() => t.reports(s.id).length === 1, "the report");
    const [d] = t.dispatches.forLeadSession(s.id);
    const started = t.events.since(0).find((e) => e.type === "dispatch.started");
    expect(started?.payload).toMatchObject({
      to: "wren",
      workerSessionId: d?.workerSessionId,
      workerRunId: d?.workerRunId,
      depth: 1,
    });
  });

  it("refuses a dispatch with no hallway, naming the one that is missing", async () => {
    const t = withDispatch({ Quill: [dispatchCall("moth", "x"), reply("Understood.")] }, (home) => {
      addRoom(home, "lab", "Lab");
      editAgent(home, "moth", (a) => {
        a.roomId = "lab";
      });
    });
    const s = t.service.createSession("quill", "Chat");
    await t.service.settled((await t.service.send(s.id, "Go")).runId);
    expect(t.dispatches.forLeadSession(s.id)).toEqual([]);
    expect(t.errorsIn(s.id)).toEqual([
      "no hallway from Operations to Lab; a hallway from Operations to Lab is needed, or ask the Overseer",
    ]);
  });

  it("refuses a dispatch against a hallway's direction", async () => {
    const t = withDispatch({ Wren: [dispatchCall("quill", "x"), reply("Understood.")] }, (home) =>
      giveDispatch(home, "wren"),
    );
    const s = t.service.createSession("wren", "Chat");
    await t.service.settled((await t.service.send(s.id, "Go")).runId);
    expect(t.dispatches.forLeadSession(s.id)).toEqual([]);
    expect(t.errorsIn(s.id)).toEqual([
      "the hallway between Research and Operations only leads from Operations to Research; a hallway from Research to Operations is needed",
    ]);
  });

  it("never lets crew dispatch to the Overseer, even along a hallway into its room", async () => {
    const t = withDispatch({ Quill: [dispatchCall("vesper", "x"), reply("Understood.")] });
    const s = t.service.createSession("quill", "Chat");
    await t.service.settled((await t.service.send(s.id, "Go")).runId);
    expect(t.dispatches.forLeadSession(s.id)).toEqual([]);
    expect(t.errorsIn(s.id)).toEqual(["crew cannot dispatch to the Overseer; report back instead"]);
  });
});

describe("nested dispatch", () => {
  it("runs a three-level chain and returns each result to its dispatcher, level by level", async () => {
    const t = withDispatch(
      {
        Vesper: [dispatchCall("quill", "Plan it"), reply("Handed to Quill."), reply("All done.")],
        Quill: [
          dispatchCall("wren", "Research it"),
          reply("Asked Wren."),
          reply("Quill: plan written from Wren's notes."),
        ],
        Wren: [
          dispatchCall("moth", "Read the sources"),
          reply("Asked Moth."),
          reply("Wren: notes from Moth's reading."),
        ],
        Moth: [reply("Moth: read all three.")],
      },
      (home) => {
        setDispatch(home, { maxDepth: 3 });
        giveDispatch(home, "wren");
      },
    );
    const lead = t.service.createSession("vesper", "Chat");
    const { runId: root } = await t.service.send(lead.id, "Plan it");
    await until(
      () => t.sessions.runs(lead.id).some((r) => r.trigger === "review" && r.state === "completed"),
      "the Overseer's review",
    );

    const [toQuill] = t.dispatches.forLeadSession(lead.id);
    const [toWren] = t.dispatches.forLeadSession(toQuill?.workerSessionId ?? "");
    const [toMoth] = t.dispatches.forLeadSession(toWren?.workerSessionId ?? "");
    expect([toQuill, toWren, toMoth].map((d) => [d?.leadAgentId, d?.workerAgentId])).toEqual([
      ["vesper", "quill"],
      ["quill", "wren"],
      ["wren", "moth"],
    ]);
    expect([toQuill, toWren, toMoth].map((d) => d?.status)).toEqual([
      "completed",
      "completed",
      "completed",
    ]);
    // Each level's report is what its worker said after folding in the level below.
    expect(t.reports(toWren?.workerSessionId ?? "")[0]?.text).toBe("Moth: read all three.");
    expect(t.reports(toQuill?.workerSessionId ?? "")[0]?.text).toBe(
      "Wren: notes from Moth's reading.",
    );
    expect(t.reports(lead.id)).toHaveLength(1);
    expect(t.reports(lead.id)[0]?.text).toBe("Quill: plan written from Wren's notes.");
    // The Overseer heard back only after the deepest work was done.
    const mothRun = t.sessions.getRun(toMoth?.workerRunId ?? "");
    expect(String(toQuill?.endedAt) >= String(mothRun?.endedAt)).toBe(true);

    // One tree: every run shares the root, at depths 0 to 3.
    const tree = t.sessions.treeRuns(root);
    expect(new Set(tree.map((r) => r.rootRunId))).toEqual(new Set([root]));
    expect(mothRun).toMatchObject({ depth: 3, parentRunId: toWren?.workerRunId, rootRunId: root });
    // A nested review continues its worker's place in the tree.
    const quillReview = t.sessions
      .runs(toQuill?.workerSessionId ?? "")
      .find((r) => r.trigger === "review");
    expect(quillReview).toMatchObject({ depth: 1, parentRunId: root, rootRunId: root });
    // Who asked whom, from events alone.
    expect(dispatchChain(t.events.since(0), mothRun?.id ?? "").map((l) => l.agentId)).toEqual([
      "vesper",
      "quill",
      "wren",
      "moth",
    ]);
    expect(t.service.tree(mothRun?.id ?? "").chain).toEqual(["moth", "wren", "quill", "vesper"]);
    // The same chain walked through the stored log, one run.queued per level, for consent cards.
    expect(dispatchChainOf(t.events, mothRun?.id ?? "").map((l) => l.agentId)).toEqual([
      "vesper",
      "quill",
      "wren",
      "moth",
    ]);
    expect(dispatchChainOf(t.events, root)).toEqual([{ agentId: "vesper", runId: root }]);
    // Dispatch is offered below the limit only.
    expect(t.toolsOf("Wren")[0]).toContain("dispatch");
    expect(t.toolsOf("Moth")[0]).not.toContain("dispatch");

    // Handover is refused for a dispatched session at every level.
    for (const d of [toQuill, toWren, toMoth]) {
      await expect(t.service.reassignSession(d?.workerSessionId ?? "", "scout")).rejects.toThrow(
        ConflictError,
      );
    }
  });

  it("does not offer dispatch at the depth limit, and refuses a call there", async () => {
    const t = withDispatch({
      Vesper: [dispatchCall("quill", "Plan it"), reply("Handed."), reply("Done.")],
      Quill: [dispatchCall("scout", "x"), reply("Did it myself.")],
    });
    const lead = t.service.createSession("vesper", "Chat");
    await t.service.send(lead.id, "Plan it");
    await until(() => t.reports(lead.id).length === 1, "the report");
    expect(t.toolsOf("Quill")[0]).not.toContain("dispatch");
    // Its briefing agrees: no roster of crew to hand work to, and a plain "do it yourself".
    const system = t.model.doStreamCalls
      .map((c) => String(c.prompt.find((m) => m.role === "system")?.content ?? ""))
      .find((s) => s.includes("You are Quill"));
    expect(system).not.toContain("You can hand part");
    expect(system).toContain("Do it yourself and report back.");
    const [d] = t.dispatches.forLeadSession(lead.id);
    expect(t.errorsIn(d?.workerSessionId ?? "")).toEqual([
      'the tool "dispatch" is not granted to this crew member',
    ]);
    expect(t.dispatches.forLeadSession(d?.workerSessionId ?? "")).toEqual([]);
  });

  it("refuses a cycle: work cannot go back to an agent above in the chain", async () => {
    const t = withDispatch(
      {
        Vesper: [dispatchCall("quill", "Plan it"), reply("Handed."), reply("Done.")],
        Quill: [dispatchCall("wren", "Research"), reply("Asked Wren."), reply("Quill: done.")],
        Wren: [dispatchCall("quill", "Do it for me"), reply("Wren: did it myself.")],
      },
      (home) => {
        setDispatch(home, { maxDepth: 3 });
        giveDispatch(home, "wren");
        addLane(home, "research", "operations");
      },
    );
    const lead = t.service.createSession("vesper", "Chat");
    await t.service.send(lead.id, "Plan it");
    await until(() => t.reports(lead.id).length === 1, "the report");
    const [toQuill] = t.dispatches.forLeadSession(lead.id);
    const [toWren] = t.dispatches.forLeadSession(toQuill?.workerSessionId ?? "");
    expect(t.errorsIn(toWren?.workerSessionId ?? "")).toEqual([
      "quill is already working on this request above you; report back instead",
    ]);
    expect(t.dispatches.forLeadSession(toWren?.workerSessionId ?? "")).toEqual([]);
  });

  it("stops a tree at its run cap", async () => {
    const t = withDispatch(
      {
        Vesper: [
          streamOf([
            toolCall("dispatch", { to: "quill", task: "A" }, "d1"),
            toolCall("dispatch", { to: "scout", task: "B" }, "d2"),
            toolCall("dispatch", { to: "wren", task: "C" }, "d3"),
            finish("tool-calls"),
          ]),
          reply("Two handed off."),
        ],
        Quill: [reply("A done.")],
        Scout: [reply("B done.")],
      },
      (home) => setDispatch(home, { maxRunsPerTree: 2, autoReview: false }),
    );
    const lead = t.service.createSession("vesper", "Chat");
    await t.service.settled((await t.service.send(lead.id, "Go")).runId);
    await until(() => t.reports(lead.id).length === 2, "both reports");
    expect(t.dispatches.forLeadSession(lead.id).map((d) => d.workerAgentId)).toEqual([
      "quill",
      "scout",
    ]);
    expect(t.errorsIn(lead.id)).toEqual([
      "this request has used 2 dispatched runs, the station's limit of 2",
    ]);
  });

  it("stops a whole tree at its spend cap: blocks, cancels the rest, and reviews nothing", async () => {
    const wrenRunning = () =>
      t.sessions.activeRuns().some((r) => r.agentId === "wren" && r.state === "running");
    const t = withDispatch(
      {
        Vesper: [
          costing(
            0.2,
            [
              toolCall("dispatch", { to: "wren", task: "Read" }, "d1"),
              toolCall("dispatch", { to: "quill", task: "Write" }, "d2"),
            ],
            "tool-calls",
          ),
          reply("Handed off."),
          reply("never: no review once the tree is spent"),
        ],
        Wren: [hanging],
        Quill: [
          after(wrenRunning, () => costing(0.9, [toolCall("noop", {}, "n1")], "tool-calls")),
          reply("never"),
        ],
      },
      (home) => setBudgets(home, { perTreeUsd: 1 }),
    );
    const lead = t.service.createSession("vesper", "Chat");
    const { runId: root } = await t.service.send(lead.id, "Go");
    await until(() => t.reports(lead.id).length === 2, "both reports");

    const blocked = t.events.since(0).find((e) => e.type === "budget.blocked");
    expect(blocked).toMatchObject({ agentId: "quill", payload: { scope: "tree", limitUsd: 1 } });
    expect(blocked?.payload).toMatchObject({ spentUsd: expect.closeTo(1.1) });
    const byAgentRun = (id: string) =>
      t.sessions.getRun(
        t.dispatches.forLeadSession(lead.id).find((d) => d.workerAgentId === id)?.workerRunId ?? "",
      );
    expect(byAgentRun("quill")?.state).toBe("blocked_budget");
    expect(byAgentRun("wren")?.state).toBe("cancelled");
    const wrenRun = byAgentRun("wren")?.id;
    const cancelled = t.events
      .since(0)
      .find((e) => e.type === "run.cancelled" && e.runId === wrenRun);
    expect(cancelled).toMatchObject({ agentId: "wren", payload: { by: "budget" } });
    expect(t.reports(lead.id).map((r) => [r.from, r.status])).toEqual(
      expect.arrayContaining([
        ["quill", "blocked"],
        ["wren", "blocked"],
      ]),
    );
    expect(t.reports(lead.id).every((r) => r.text.includes("reached its budget"))).toBe(true);
    // No review starts on a spent tree, and the tree refuses any further dispatch.
    await new Promise((r) => setTimeout(r, 20));
    expect(t.sessions.runs(lead.id).filter((r) => r.trigger === "review")).toEqual([]);
    expect(t.service.tree(root).spentUsd).toBeGreaterThanOrEqual(1);
  });

  it("asks for consent in a Full power worker dispatched by an Ask first agent", async () => {
    const writes: unknown[] = [];
    const t = withDispatch(
      {
        Quill: [dispatchCall("wren", "Write notes"), reply("Asked Wren."), reply("Reviewed.")],
        Wren: [callTool("write_file", { path: "notes.md" }, "w1"), reply("Wrote notes.md.")],
      },
      (home) =>
        editStation(home, (s) => {
          for (const room of s.rooms as { id: string; props: object[] }[]) {
            if (room.id === "research") room.props = [...room.props, { kind: "files" }];
          }
        }),
      { tools: { write_file: writeTool(writes) } },
    );
    const s = t.service.createSession("quill", "Chat");
    await t.service.send(s.id, "Write notes");
    await until(() => t.consents.pending().length === 1, "the consent request");
    const [d] = t.dispatches.forLeadSession(s.id);
    expect(t.consents.pending()[0]).toMatchObject({ runId: d?.workerRunId, tool: "write_file" });
    expect(writes).toEqual([]);
    t.service.resolveConsent(t.consents.pending()[0]?.id ?? "", "approved");
    await until(() => t.reports(s.id).length === 1, "the report");
    expect(writes).toEqual([{ path: "notes.md" }]);
  });

  it("still holds the per-run cap on a run deep inside a tree", async () => {
    const t = withDispatch(
      {
        Vesper: [dispatchCall("quill", "Plan"), reply("Handed."), reply("Done.")],
        Quill: [dispatchCall("wren", "Read"), reply("Asked."), reply("Quill: Wren was stopped.")],
        Wren: [costing(0.6, [toolCall("noop", {}, "n1")], "tool-calls"), reply("never")],
      },
      (home) => {
        setDispatch(home, { maxDepth: 2 });
        setBudgets(home, { perRunUsd: 0.5, perTreeUsd: null });
      },
    );
    const lead = t.service.createSession("vesper", "Chat");
    await t.service.send(lead.id, "Plan");
    await until(() => t.reports(lead.id).length === 1, "the report");
    expect(t.events.since(0).find((e) => e.type === "budget.blocked")).toMatchObject({
      agentId: "wren",
      payload: { scope: "run", limitUsd: 0.5 },
    });
    const [toQuill] = t.dispatches.forLeadSession(lead.id);
    expect(t.reports(toQuill?.workerSessionId ?? "")[0]).toMatchObject({
      from: "wren",
      status: "blocked",
    });
    expect(t.reports(lead.id)[0]?.text).toBe("Quill: Wren was stopped.");
  });

  it("cancels the runs a cancelled run dispatched, level by level", async () => {
    const t = withDispatch(
      {
        Vesper: [dispatchCall("quill", "Plan"), reply("Handed.")],
        Quill: [dispatchCall("wren", "Read"), hanging],
        Wren: [hanging],
      },
      (home) => setDispatch(home, { maxDepth: 2, autoReview: false }),
    );
    const lead = t.service.createSession("vesper", "Chat");
    await t.service.send(lead.id, "Plan");
    await until(
      () => t.sessions.activeRuns().some((r) => r.agentId === "wren" && r.state === "running"),
      "Wren at work",
    );
    const [toQuill] = t.dispatches.forLeadSession(lead.id);
    await t.service.cancel(toQuill?.workerRunId ?? "");
    await until(() => t.reports(lead.id).length === 1, "the report");
    const [toWren] = t.dispatches.forLeadSession(toQuill?.workerSessionId ?? "");
    expect(t.sessions.getRun(toWren?.workerRunId ?? "")?.state).toBe("cancelled");
    expect([toQuill, toWren].map((d) => t.dispatches.get(d?.id ?? "")?.status)).toEqual([
      "cancelled",
      "cancelled",
    ]);
    // A worker whose own run was cancelled does not review the report it gets.
    expect(t.sessions.runs(toQuill?.workerSessionId ?? "").map((r) => r.trigger)).toEqual([
      "dispatch",
    ]);
  });

  it("starts no review for a request the Commander cancelled, though its report arrives later", async () => {
    const t = withDispatch({
      Vesper: [dispatchCall("quill", "Plan"), hanging, reply("never: a cancelled request")],
      Quill: [hanging],
    });
    const lead = t.service.createSession("vesper", "Chat");
    const { runId: root } = await t.service.send(lead.id, "Plan");
    await until(
      () => t.sessions.activeRuns().some((r) => r.agentId === "quill" && r.state === "running"),
      "Quill at work",
    );
    await t.service.cancel(root);
    await until(() => t.reports(lead.id).length === 1, "the report");
    expect(t.reports(lead.id)[0]).toMatchObject({ from: "quill", status: "cancelled" });
    await new Promise((r) => setTimeout(r, 20));
    expect(t.sessions.runs(lead.id).map((r) => [r.trigger, r.state])).toEqual([
      ["user", "cancelled"],
    ]);
  });

  it("cancels a dispatched worker's review with its dispatch, since the review is not its child", async () => {
    const t = withDispatch(
      {
        Vesper: [dispatchCall("quill", "Plan"), reply("Handed.")],
        Quill: [dispatchCall("wren", "Read"), reply("Asked Wren."), hanging],
        Wren: [reply("Read it.")],
      },
      (home) => setDispatch(home, { maxDepth: 2, autoReview: false }),
    );
    const lead = t.service.createSession("vesper", "Chat");
    await t.service.send(lead.id, "Plan");
    const [toQuill] = await (async () => {
      await until(() => t.dispatches.forLeadSession(lead.id)[0]?.workerRunId !== undefined, "it");
      return t.dispatches.forLeadSession(lead.id);
    })();
    const review = () =>
      t.sessions.runs(toQuill?.workerSessionId ?? "").find((r) => r.trigger === "review");
    await until(() => review()?.state === "running", "Quill's review");
    expect(review()?.dispatchId).toBe(toQuill?.id);
    // Quill's own dispatched run has already finished; cancelling it still reaches the review.
    await t.service.cancel(toQuill?.workerRunId ?? "");
    await until(() => t.reports(lead.id).length === 1, "the report");
    expect(review()?.state).toBe("cancelled");
    expect(t.dispatches.get(toQuill?.id ?? "")?.status).toBe("cancelled");
  });

  it("chains a run whose run.queued predates lineage, through its stored row", () => {
    const t = withDispatch({});
    const append = (runId: string, agentId: string) =>
      t.events.append({
        type: "run.queued",
        agentId,
        sessionId: `s-${runId}`,
        runId,
        payload: { trigger: "user" },
      });
    append("old-lead", "vesper");
    append("old-worker", "quill");
    const parents: Record<string, string> = { "old-worker": "old-lead" };
    expect(dispatchChainOf(t.events, "old-worker")).toEqual([
      { agentId: "quill", runId: "old-worker" },
    ]);
    expect(dispatchChainOf(t.events, "old-worker", (id) => parents[id])).toEqual([
      { agentId: "vesper", runId: "old-lead" },
      { agentId: "quill", runId: "old-worker" },
    ]);
  });

  it("reports a dispatch that a restart left running as interrupted, once", async () => {
    const t = withDispatch(
      { Vesper: [dispatchCall("quill", "Plan"), reply("Handed.")], Quill: [hanging] },
      (home) => setDispatch(home, { autoReview: false }),
    );
    const lead = t.service.createSession("vesper", "Chat");
    await t.service.send(lead.id, "Plan");
    await until(() => t.dispatches.running()[0]?.workerRunId !== undefined, "the dispatch");
    const [d] = t.dispatches.running();
    expect(t.dispatch.recover().map((r) => r.id)).toEqual([d?.id]);
    expect(t.dispatches.get(d?.id ?? "")?.status).toBe("interrupted");
    expect(t.reports(lead.id)).toEqual([
      expect.objectContaining({ status: "interrupted", text: expect.stringMatching(/daemon/) }),
    ]);
    // The worker's run ending afterwards changes nothing.
    await t.service.cancel(d?.workerRunId ?? "");
    await t.service.settled(d?.workerRunId ?? "");
    await new Promise((r) => setTimeout(r, 20));
    expect(t.reports(lead.id)).toHaveLength(1);
  });
});
