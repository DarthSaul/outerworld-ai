import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { byAgent, callTool, hanging, reply, setup } from "../test/loop.js";
import { DispatchService } from "./dispatch-service.js";

/** Adds a third crew member, Scout, so the Overseer can fan out to two workers. */
const addScout = (home: string) => {
  const dir = join(home, "agents", "scout");
  mkdirSync(dir, { recursive: true });
  const quill = JSON.parse(readFileSync(join(home, "agents", "quill", "agent.json"), "utf8"));
  writeFileSync(
    join(dir, "agent.json"),
    JSON.stringify({ ...quill, name: "Scout", connectorGrants: [], schedules: [] }),
  );
  writeFileSync(join(dir, "identity.md"), "You are Scout, a researcher.\n");
};

const setAutoReview = (home: string, autoReview: boolean) => {
  const path = join(home, "station.json");
  const station = JSON.parse(readFileSync(path, "utf8"));
  writeFileSync(path, JSON.stringify({ ...station, dispatch: { maxDepth: 1, autoReview } }));
};

const withDispatch = (
  scripts: Parameters<typeof byAgent>[0],
  options: Parameters<typeof setup>[1] = {},
) => {
  const t = setup(byAgent(scripts), options);
  addScout(t.home);
  const service = new DispatchService({
    home: t.home,
    runs: t.service,
    sessions: t.sessions,
    events: t.events,
    dispatches: t.dispatches,
  });
  return { ...t, dispatch: service };
};

const until = async (check: () => boolean, what = "condition") => {
  for (let i = 0; i < 500 && !check(); i++) await new Promise((r) => setTimeout(r, 2));
  if (!check()) throw new Error(`timed out waiting for ${what}`);
};

const dispatchCall = (to: string, task: string, id: string) =>
  callTool("dispatch", { to, task }, id);

describe("dispatch", () => {
  it("returns at once, runs the worker in its own session, posts the result back, and triggers a review", async () => {
    const t = withDispatch({
      Vesper: [
        dispatchCall("quill", "Update the hub", "d1"),
        reply("Handed to Quill."),
        reply("Reviewed: done."),
      ],
      Quill: [reply("Hub updated with this week's progress.")],
    });
    const lead = t.service.createSession("vesper", "Chat");
    const { runId } = await t.service.send(lead.id, "Update the hub");
    expect((await t.service.settled(runId)).state).toBe("completed");

    const [d] = t.dispatches.forLeadSession(lead.id);
    expect(d).toMatchObject({ workerAgentId: "quill", task: "Update the hub", leadRunId: runId });
    const toolResult = t.sessions.messages(lead.id).find((m) => m.message.role === "tool")?.message;
    expect(toolResult).toMatchObject({
      output: { dispatchId: d?.id, status: "started", to: "quill" },
    });

    await until(
      () => t.sessions.messages(lead.id).some((m) => m.message.role === "report"),
      "the report",
    );
    expect(t.sessions.messages(d?.workerSessionId ?? "")[0]?.message).toMatchObject({
      role: "user",
      text: expect.stringContaining("Update the hub"),
    });
    const report = t.sessions.messages(lead.id).find((m) => m.message.role === "report")?.message;
    expect(report).toEqual({
      role: "report",
      dispatchId: d?.id,
      from: "quill",
      status: "completed",
      text: "Hub updated with this week's progress.",
    });
    expect(t.dispatches.get(d?.id ?? "")?.status).toBe("completed");
    expect(t.stored()).toEqual(expect.arrayContaining(["dispatch.started", "dispatch.completed"]));

    await until(
      () => t.sessions.runs(lead.id).some((r) => r.trigger === "review" && r.state === "completed"),
      "the review",
    );
    expect(t.sessions.messages(lead.id).at(-1)?.message).toEqual({
      role: "assistant",
      text: "Reviewed: done.",
    });
  });

  it("fans out to two workers that run at the same time, and each result lands in the lead's session", async () => {
    let releaseQuill: () => void = () => {};
    const quillWaits = new Promise<void>((r) => {
      releaseQuill = r;
    });
    const t = withDispatch({
      Vesper: [
        {
          stream: new ReadableStream({
            start(c) {
              c.enqueue({ type: "stream-start", warnings: [] });
              c.enqueue({
                type: "tool-call",
                toolCallId: "d1",
                toolName: "dispatch",
                input: JSON.stringify({ to: "quill", task: "A" }),
              });
              c.enqueue({
                type: "tool-call",
                toolCallId: "d2",
                toolName: "dispatch",
                input: JSON.stringify({ to: "scout", task: "B" }),
              });
              c.enqueue({
                type: "finish",
                finishReason: { unified: "tool-calls", raw: "tool_calls" },
                usage: {
                  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
                  outputTokens: { total: 1, text: 1, reasoning: 0 },
                },
              });
              c.close();
            },
          }),
        },
        reply("Both started."),
        reply("Reviewed."),
        reply("Reviewed again."),
      ],
      Quill: [
        (s) => ({
          stream: new ReadableStream({
            async start(c) {
              c.enqueue({ type: "stream-start", warnings: [] });
              await quillWaits;
              if (s.aborted) return;
              c.enqueue({ type: "text-start", id: "t" });
              c.enqueue({ type: "text-delta", id: "t", delta: "A done" });
              c.enqueue({ type: "text-end", id: "t" });
              c.enqueue({
                type: "finish",
                finishReason: { unified: "stop", raw: "stop" },
                usage: {
                  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
                  outputTokens: { total: 1, text: 1, reasoning: 0 },
                },
              });
              c.close();
            },
          }),
        }),
      ],
      Scout: [reply("B done")],
    });
    const lead = t.service.createSession("vesper", "Chat");
    await t.service.settled((await t.service.send(lead.id, "Do A and B")).runId);
    const [a, b] = t.dispatches.forLeadSession(lead.id);
    await until(() => t.dispatches.get(b?.id ?? "")?.status === "completed", "Scout");
    // Scout finished while Quill was still working: they ran at the same time.
    expect(t.dispatches.get(a?.id ?? "")?.status).toBe("running");
    releaseQuill();
    await until(() => t.dispatches.get(a?.id ?? "")?.status === "completed", "Quill");
    const reports = () =>
      t.sessions
        .messages(lead.id)
        .filter((m) => m.message.role === "report")
        .map((m) => m.message);
    expect(reports().map((r) => (r.role === "report" ? r.from : ""))).toEqual(["scout", "quill"]);
  });

  it("reports a cancelled worker as cancelled", async () => {
    const t = withDispatch({
      Vesper: [dispatchCall("quill", "Long task", "d1"), reply("Started."), reply("Noted.")],
      Quill: [(s) => hanging(s)],
    });
    const lead = t.service.createSession("vesper", "Chat");
    await t.service.settled((await t.service.send(lead.id, "Go")).runId);
    const [d] = t.dispatches.forLeadSession(lead.id);
    await until(
      () => d?.id !== undefined && t.dispatches.get(d.id)?.workerRunId !== undefined,
      "the worker run",
    );
    await t.service.cancel(t.dispatches.get(d?.id ?? "")?.workerRunId ?? "");
    await until(() => t.dispatches.get(d?.id ?? "")?.status === "cancelled", "cancelled");
    expect(
      t.sessions.messages(lead.id).find((m) => m.message.role === "report")?.message,
    ).toMatchObject({
      status: "cancelled",
      text: expect.stringContaining("Partial"),
    });
    expect(t.stored()).toContain("dispatch.cancelled");
  });

  it("reports a worker stopped by a budget", async () => {
    const t = withDispatch({
      Vesper: [dispatchCall("quill", "Costly", "d1"), reply("Started."), reply("Noted.")],
      Quill: [reply("never")],
    });
    const path = join(t.home, "station.json");
    const station = JSON.parse(readFileSync(path, "utf8"));
    writeFileSync(path, JSON.stringify({ ...station, budgets: { perAgentDailyUsd: 0.5 } }));
    const earlier = t.sessions.createSession("quill", "Earlier");
    const earlierRun = t.sessions.createRun({
      sessionId: earlier.id,
      agentId: "quill",
      trigger: "user",
      model: "m",
    });
    t.spend.record({
      runId: earlierRun.id,
      sessionId: earlier.id,
      agentId: "quill",
      model: "m",
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0.5,
      at: new Date().toISOString(),
    });
    const lead = t.service.createSession("vesper", "Chat");
    await t.service.settled((await t.service.send(lead.id, "Go")).runId);
    const [d] = t.dispatches.forLeadSession(lead.id);
    await until(() => t.dispatches.get(d?.id ?? "")?.status === "blocked", "blocked");
    expect(
      t.sessions.messages(lead.id).find((m) => m.message.role === "report")?.message,
    ).toMatchObject({
      status: "blocked",
      text: expect.stringMatching(/budget/),
    });
    expect(t.stored()).toContain("dispatch.failed");
  });

  it("returns a refusal to the Overseer for an unknown or self target, and dispatches nothing", async () => {
    const t = withDispatch({ Vesper: [dispatchCall("ghost", "x", "d1"), reply("Understood.")] });
    const lead = t.service.createSession("vesper", "Chat");
    await t.service.settled((await t.service.send(lead.id, "Go")).runId);
    expect(t.dispatches.forLeadSession(lead.id)).toEqual([]);
    const result = t.sessions.messages(lead.id).find((m) => m.message.role === "tool")?.message;
    expect(result).toMatchObject({
      isError: true,
      output: expect.stringMatching(/no crew member "ghost"/),
    });
  });

  it("never gives a worker the dispatch tool, and rejects a worker's attempt at execution", async () => {
    const t = withDispatch({ Quill: [dispatchCall("scout", "x", "d1"), reply("Cannot.")] });
    const s = t.service.createSession("quill", "Chat");
    await t.service.settled((await t.service.send(s.id, "Delegate")).runId);
    expect((t.model.doStreamCalls[0]?.tools ?? []).map((x) => x.name)).not.toContain("dispatch");
    expect(t.events.since(0).find((e) => e.type === "run.tool_call")?.payload).toMatchObject({
      tool: "dispatch",
      rejected: expect.stringMatching(/not granted/),
    });
    expect(t.dispatches.running()).toEqual([]);
  });

  it("leaves the review to the Commander when auto review is off", async () => {
    const t = withDispatch({
      Vesper: [dispatchCall("quill", "x", "d1"), reply("Started.")],
      Quill: [reply("Done.")],
    });
    setAutoReview(t.home, false);
    const lead = t.service.createSession("vesper", "Chat");
    await t.service.settled((await t.service.send(lead.id, "Go")).runId);
    await until(
      () => t.sessions.messages(lead.id).some((m) => m.message.role === "report"),
      "the report",
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(t.sessions.runs(lead.id).filter((r) => r.trigger === "review")).toEqual([]);
  });

  it("delivers a steer to a running worker at its next step", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const t = withDispatch(
      {
        Vesper: [dispatchCall("quill", "Research", "d1"), reply("Started."), reply("Reviewed.")],
        Quill: [
          callTool("web_fetch", { url: "https://example.test" }),
          reply("Summary focused as asked."),
        ],
      },
      {
        tools: {
          web_fetch: {
            description: "fetch",
            inputSchema: { type: "object" },
            class: "read",
            execute: async () => {
              await gate;
              return { text: "page" };
            },
          },
        },
      },
    );
    const lead = t.service.createSession("vesper", "Chat");
    await t.service.settled((await t.service.send(lead.id, "Go")).runId);
    const [d] = t.dispatches.forLeadSession(lead.id);
    await until(
      () =>
        t.stored().includes("run.tool_call") &&
        t.dispatches.get(d?.id ?? "")?.workerRunId !== undefined,
      "the worker's tool call",
    );
    t.service.steer(t.dispatches.get(d?.id ?? "")?.workerRunId ?? "", "Focus on pricing.");
    expect(t.stored()).toContain("run.steered");
    release();
    await until(() => t.dispatches.get(d?.id ?? "")?.status === "completed", "the worker");
    const workerPrompt = t.model.doStreamCalls.find((c) =>
      JSON.stringify(c.prompt).includes("Focus on pricing."),
    );
    expect(workerPrompt).toBeDefined();
    expect(() => t.service.steer(t.dispatches.get(d?.id ?? "")?.workerRunId ?? "", "late")).toThrow(
      /not running/,
    );
  });

  it("lets the Overseer read another session with read_session, size-capped", async () => {
    const t = withDispatch({});
    const other = t.service.createSession("quill", "Notes");
    t.sessions.appendMessage(other.id, undefined, { role: "user", text: "Hello Quill" });
    t.sessions.appendMessage(other.id, undefined, { role: "assistant", text: "x".repeat(50_000) });
    const ctx = {
      agentId: "vesper",
      sessionId: "s",
      runId: "r",
      depth: 0,
      signal: new AbortController().signal,
    };
    const tool = t.dispatch.readSessionTool();
    expect(tool.class).toBe("read");
    const out = (await tool.execute({ sessionId: other.id }, ctx)) as {
      transcript: string;
      truncated: boolean;
      session: { agentId: string; title: string };
    };
    expect(out.session).toMatchObject({ agentId: "quill", title: "Notes" });
    expect(out.transcript.startsWith("Commander: Hello Quill")).toBe(true);
    expect(out.truncated).toBe(true);
    expect(out.transcript.length).toBeLessThanOrEqual(20_000);
    await expect(tool.execute({ sessionId: "nope" }, ctx)).rejects.toThrow(/no session/);
  });
});
