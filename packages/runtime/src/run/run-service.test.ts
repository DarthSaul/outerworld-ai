import { APICallError } from "ai";
import { describe, expect, it } from "vitest";
import { createRedactor } from "../secrets/redact.js";
import { apiError, callTool, hanging, reply, scripted, setup } from "../test/loop.js";
import type { ToolImpl } from "./run-service.js";

const echoTool = (calls: unknown[] = []): ToolImpl => ({
  description: "Fetch a page",
  inputSchema: { type: "object", properties: { url: { type: "string" } } },
  class: "read",
  execute: async (input) => {
    calls.push(input);
    return { text: "page body" };
  },
});

describe("RunService: a chat turn", () => {
  it("streams deltas live, stores one final message, and logs the run", async () => {
    const t = setup(scripted([reply("Hel", "lo", "!")]));
    const session = t.service.createSession("vesper");
    const { runId } = await t.service.send(session.id, "Hi");
    const run = await t.service.settled(runId);
    expect(run.state).toBe("completed");
    expect(
      t.live.filter((e) => e.ephemeral).map((e) => (e.payload as { text: string }).text),
    ).toEqual(["Hel", "lo", "!"]);
    expect(t.stored()).toEqual(["session.created", "run.queued", "run.started", "run.completed"]);
    expect(t.sessions.messages(session.id).map((m) => m.message)).toEqual([
      { role: "user", text: "Hi" },
      { role: "assistant", text: "Hello!" },
    ]);
  });

  it("builds the prompt from the agent's documents, role, and history", async () => {
    const t = setup(scripted([reply("One"), reply("Two")]));
    const session = t.service.createSession("vesper");
    await t.service.settled((await t.service.send(session.id, "First")).runId);
    await t.service.settled((await t.service.send(session.id, "Second")).runId);
    const prompt = t.model.doStreamCalls[1]?.prompt ?? [];
    const system = prompt[0];
    expect(system?.role).toBe("system");
    expect(String(system?.content)).toContain("You are Vesper");
    expect(String(system?.content)).toContain("You are the Overseer of Demo Station");
    expect(prompt.slice(1).map((m) => m.role)).toEqual(["user", "assistant", "user"]);
  });

  it("titles a new session and refuses a second run while one is active", async () => {
    const t = setup(scripted([(s) => hanging(s)]));
    const session = t.service.createSession("vesper");
    expect(session.title).toBe("New session");
    const { runId } = await t.service.send(session.id, "Go");
    await expect(t.service.send(session.id, "Again")).rejects.toThrow(/already running/);
    await t.service.cancel(runId);
    await t.service.settled(runId);
  });

  it("refuses to send to an unknown or archived session", async () => {
    const t = setup(scripted([]));
    await expect(t.service.send("nope", "x")).rejects.toThrow(/no session/);
    const session = t.service.createSession("vesper");
    t.service.archiveSession(session.id);
    await expect(t.service.send(session.id, "x")).rejects.toThrow(/archived/);
  });
});

describe("RunService: tools", () => {
  it("runs a multi-step tool loop and returns the result to the model", async () => {
    const calls: unknown[] = [];
    const t = setup(
      scripted([callTool("web_fetch", { url: "https://example.test" }), reply("Done.")]),
      {
        tools: { web_fetch: echoTool(calls) },
      },
    );
    const session = t.service.createSession("vesper");
    const run = await t.service.settled((await t.service.send(session.id, "Look")).runId);
    expect(run).toMatchObject({ state: "completed", steps: 2 });
    expect(calls).toEqual([{ url: "https://example.test" }]);
    expect(t.stored()).toContain("run.tool_call");
    expect(t.stored()).toContain("run.tool_result");
    const second = t.model.doStreamCalls[1]?.prompt ?? [];
    expect(second.at(-1)).toMatchObject({
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "c1",
          output: { type: "json", value: { text: "page body" } },
        },
      ],
    });
    expect(t.sessions.messages(session.id).map((m) => m.message.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
    ]);
  });

  it("offers only granted tools that exist, and rejects a call to anything else at execution", async () => {
    const executed: unknown[] = [];
    const t = setup(scripted([callTool("write_file", { path: "x" }), reply("OK")]), {
      tools: { web_fetch: echoTool(), write_file: { ...echoTool(executed), class: "write" } },
    });
    const session = t.service.createSession("vesper");
    await t.service.settled((await t.service.send(session.id, "Write")).runId);
    const offered = (t.model.doStreamCalls[0]?.tools ?? []).map((tool) => tool.name);
    expect(offered).toEqual(["web_fetch"]);
    expect(executed).toEqual([]);
    const call = t.events.since(0).find((e) => e.type === "run.tool_call");
    expect(call?.payload).toMatchObject({
      tool: "write_file",
      rejected: expect.stringMatching(/not granted/),
    });
    const result = t.sessions.messages(session.id).find((m) => m.message.role === "tool")?.message;
    expect(result).toMatchObject({ isError: true });
  });

  it("returns a tool's failure to the model as an error result instead of failing the run", async () => {
    const t = setup(scripted([callTool("web_fetch", { url: "u" }), reply("It failed.")]), {
      tools: {
        web_fetch: {
          ...echoTool(),
          execute: async () => Promise.reject(new Error("timed out")),
        },
      },
    });
    const session = t.service.createSession("vesper");
    const run = await t.service.settled((await t.service.send(session.id, "Look")).runId);
    expect(run.state).toBe("completed");
    const result = t.events.since(0).find((e) => e.type === "run.tool_result");
    expect(result?.payload).toMatchObject({ ok: false, summary: "timed out" });
  });

  it("stops after the step limit and says so", async () => {
    const t = setup(
      scripted([
        callTool("web_fetch", {}, "a"),
        callTool("web_fetch", {}, "b"),
        callTool("web_fetch", {}, "c"),
      ]),
      { tools: { web_fetch: echoTool() }, maxSteps: 2 },
    );
    const session = t.service.createSession("vesper");
    const run = await t.service.settled((await t.service.send(session.id, "Loop")).runId);
    expect(run).toMatchObject({ state: "completed", steps: 2 });
    const done = t.events.since(0).find((e) => e.type === "run.completed");
    expect(done?.payload).toEqual({ reason: "max_steps", trigger: "user" });
    expect(t.model.doStreamCalls).toHaveLength(2);
  });
});

describe("RunService: cancel, errors, and retries", () => {
  it("cancels mid-stream, keeps what was already said, and logs who cancelled", async () => {
    const t = setup(scripted([(s) => hanging(s)]));
    const session = t.service.createSession("vesper");
    const { runId } = await t.service.send(session.id, "Go");
    // Cancel once the model has streamed something, so there is text to keep.
    for (let i = 0; i < 500 && !t.live.some((e) => e.ephemeral); i++) {
      await new Promise((r) => setTimeout(r, 2));
    }
    await t.service.cancel(runId);
    const run = await t.service.settled(runId);
    expect(run.state).toBe("cancelled");
    expect(t.events.since(0).find((e) => e.type === "run.cancelled")?.payload).toEqual({
      by: "user",
    });
    expect(t.sessions.messages(session.id).at(-1)?.message).toEqual({
      role: "assistant",
      text: "Partial",
    });
  });

  it("cancels a queued run before it starts", async () => {
    const t = setup(scripted([(s) => hanging(s), reply("never")]), { concurrency: 1 });
    const a = t.service.createSession("vesper");
    const b = t.service.createSession("quill");
    const first = await t.service.send(a.id, "one");
    const second = await t.service.send(b.id, "two");
    await t.service.cancel(second.runId);
    expect((await t.service.settled(second.runId)).state).toBe("cancelled");
    await t.service.cancel(first.runId);
    await t.service.settled(first.runId);
    expect(t.model.doStreamCalls).toHaveLength(1);
  });

  it("retries a rate limit after the server's retry-after, logging each retry", async () => {
    const t = setup(scripted([apiError(429, { "retry-after": "3" }), apiError(503), reply("Hi")]));
    const session = t.service.createSession("vesper");
    const run = await t.service.settled((await t.service.send(session.id, "Hi")).runId);
    expect(run.state).toBe("completed");
    expect(t.sleeps).toEqual([3000, 4000]);
    const retries = t.events.since(0).filter((e) => e.type === "run.retrying");
    expect(retries.map((e) => e.payload)).toEqual([
      { attempt: 1, delayMs: 3000, status: 429 },
      { attempt: 2, delayMs: 4000, status: 503 },
    ]);
  });

  it("fails after the retries run out", async () => {
    const t = setup(scripted([apiError(500), apiError(500), apiError(500), apiError(500)]), {
      retry: { attempts: 3, baseMs: 100, maxMs: 1000 },
    });
    const session = t.service.createSession("vesper");
    const run = await t.service.settled((await t.service.send(session.id, "Hi")).runId);
    expect(run.state).toBe("failed");
    expect(t.sleeps).toEqual([100, 200, 400]);
  });

  it("keeps the provider's reason for a rejected request, redacted and short", async () => {
    const bad = new APICallError({
      message: "vendor/model-a is not a valid model ID (key sk-or-v1-abcdefghijklmnop)",
      url: "https://openrouter.test/api",
      requestBodyValues: {},
      statusCode: 400,
    });
    const t = setup(scripted([bad]), { redact: createRedactor(() => []) });
    const session = t.service.createSession("vesper");
    const run = await t.service.settled((await t.service.send(session.id, "Hi")).runId);
    expect(run.error).toBe(
      "the model provider returned HTTP 400: vendor/model-a is not a valid model ID (key [redacted])",
    );
    expect(t.sleeps).toEqual([]);
  });

  it("never retries a 402 and explains it", async () => {
    const t = setup(scripted([apiError(402)]));
    const session = t.service.createSession("vesper");
    const run = await t.service.settled((await t.service.send(session.id, "Hi")).runId);
    expect(run.state).toBe("failed");
    expect(run.error).toMatch(/credit/i);
    expect(t.sleeps).toEqual([]);
  });

  it("fails cleanly when the model cannot be created (no API key)", async () => {
    const t = setup(scripted([]), {
      models: () => {
        throw new Error("No OpenRouter key: add one in Settings");
      },
    });
    const session = t.service.createSession("vesper");
    const run = await t.service.settled((await t.service.send(session.id, "Hi")).runId);
    expect(run).toMatchObject({ state: "failed", error: "No OpenRouter key: add one in Settings" });
  });

  it("fails a run for an agent that no longer exists", async () => {
    const t = setup(scripted([]));
    const session = t.service.createSession("ghost");
    const run = await t.service.settled((await t.service.send(session.id, "Hi")).runId);
    expect(run).toMatchObject({ state: "failed", error: 'no agent "ghost"' });
  });
});

describe("RunService: concurrency and restarts", () => {
  it("queues runs beyond the concurrency limit and starts them as slots free up", async () => {
    const t = setup(scripted([(s) => hanging(s), reply("second")]), { concurrency: 1 });
    const a = t.service.createSession("vesper");
    const b = t.service.createSession("quill");
    const first = await t.service.send(a.id, "one");
    const second = await t.service.send(b.id, "two");
    await new Promise((r) => setTimeout(r, 20));
    expect(t.sessions.getRun(second.runId)?.state).toBe("queued");
    await t.service.cancel(first.runId);
    expect((await t.service.settled(second.runId)).state).toBe("completed");
  });

  it("surfaces runs left unfinished by a crash as interrupted, with an event each", () => {
    const t = setup(scripted([]));
    const session = t.sessions.createSession("vesper", "Chat");
    const run = t.sessions.createRun({
      sessionId: session.id,
      agentId: "vesper",
      trigger: "user",
      model: "m",
    });
    t.sessions.transition(run.id, "start");
    const recovered = t.service.recover();
    expect(recovered.map((r) => r.state)).toEqual(["interrupted"]);
    const e = t.events.since(0).find((x) => x.type === "run.interrupted");
    expect(e).toMatchObject({ runId: run.id, sessionId: session.id, agentId: "vesper" });
  });
});
