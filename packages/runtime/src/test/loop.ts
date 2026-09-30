import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RuntimeEvent } from "@darthsaul/outerworld-ai-core";
import { APICallError } from "ai";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import { ConsentStore } from "../controls/consent-store.js";
import { KillSwitch } from "../controls/kill-switch.js";
import { SpendStore } from "../controls/spend-store.js";
import { DispatchStore } from "../dispatch/dispatch-store.js";
import { RunService, type RunServiceOptions } from "../run/run-service.js";
import { SessionStore } from "../sessions/session-store.js";
import { openDatabase } from "../storage/database.js";
import { EventStore } from "../storage/event-store.js";

/** Scripted models and a RunService over a copy of the fixture, for loop tests. No network. */
const fixture = join(import.meta.dirname, "..", "..", "..", "..", "fixtures", "demo-station");

export const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};
export type Chunk = Record<string, unknown>;
export const finish = (reason: "stop" | "tool-calls"): Chunk => ({
  type: "finish",
  finishReason: { unified: reason, raw: reason },
  usage,
});
export const streamOf = (chunks: Chunk[]) => ({
  stream: simulateReadableStream({ chunks: [{ type: "stream-start", warnings: [] }, ...chunks] }),
});
/** A reply streamed in pieces. */
export const reply = (...pieces: string[]) =>
  streamOf([
    { type: "text-start", id: "t" },
    ...pieces.map((delta) => ({ type: "text-delta", id: "t", delta })),
    { type: "text-end", id: "t" },
    finish("stop"),
  ]);
export const callTool = (toolName: string, input: unknown, toolCallId = "c1") =>
  streamOf([
    { type: "tool-call", toolCallId, toolName, input: JSON.stringify(input) },
    finish("tool-calls"),
  ]);
export const apiError = (statusCode: number, headers: Record<string, string> = {}) =>
  new APICallError({
    message: `HTTP ${statusCode}`,
    url: "https://openrouter.test/api",
    requestBodyValues: {},
    statusCode,
    responseHeaders: headers,
  });

export type Step =
  | ReturnType<typeof reply>
  | Error
  | ((signal: AbortSignal) => ReturnType<typeof reply>);

/** A model that plays `steps` in order, one per model call. */
export const scripted = (steps: Step[]) => {
  let i = 0;
  return new MockLanguageModelV4({
    doStream: async (options) => {
      const step = steps[i++];
      if (step === undefined) throw new Error("script exhausted");
      if (step instanceof Error) throw step;
      // Hand-built chunks stand in for the provider's stream-part type (not a direct dependency).
      return (
        typeof step === "function" ? step(options.abortSignal as AbortSignal) : step
      ) as never;
    },
  });
};

/** A stream that sends one delta and then waits until the call is aborted. */
export const hanging = (signal: AbortSignal) => ({
  stream: new ReadableStream({
    start(controller) {
      controller.enqueue({ type: "stream-start", warnings: [] });
      controller.enqueue({ type: "text-start", id: "t" });
      controller.enqueue({ type: "text-delta", id: "t", delta: "Partial" });
      signal.addEventListener("abort", () =>
        controller.error(new DOMException("aborted", "AbortError")),
      );
    },
  }),
});

export const setup = (model: MockLanguageModelV4, options: Partial<RunServiceOptions> = {}) => {
  const home = join(mkdtempSync(join(tmpdir(), "ow-run-")), "home");
  cpSync(fixture, home, { recursive: true });
  const db = openDatabase(":memory:");
  const events = new EventStore(db);
  const sessions = new SessionStore(db);
  const consents = new ConsentStore(db);
  const spend = new SpendStore(db);
  const killSwitch = new KillSwitch(db);
  const dispatches = new DispatchStore(db);
  const sleeps: number[] = [];
  const service = new RunService({
    home,
    events,
    sessions,
    consents,
    spend,
    killSwitch,
    models: () => model,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    ...options,
  });
  const live: RuntimeEvent[] = [];
  events.subscribe((e) => live.push(e));
  const stored = () => events.since(0).map((e) => e.type);
  return {
    service,
    events,
    sessions,
    consents,
    spend,
    killSwitch,
    dispatches,
    model,
    live,
    stored,
    sleeps,
    home,
  };
};

/**
 * One model for several agents: each call is answered from the script of the agent whose
 * identity ("You are <Name>") is in the system prompt. Unscripted calls fail the test loudly.
 */
export const byAgent = (scripts: Record<string, Step[]>) => {
  const cursors: Record<string, number> = {};
  return new MockLanguageModelV4({
    doStream: async (options) => {
      const system = String(options.prompt.find((m) => m.role === "system")?.content ?? "");
      const name = Object.keys(scripts).find((n) => system.includes(`You are ${n}`));
      if (!name) throw new Error(`no script for this agent: ${system.slice(0, 80)}`);
      const i = cursors[name] ?? 0;
      cursors[name] = i + 1;
      const step = scripts[name]?.[i];
      if (step === undefined) throw new Error(`${name}'s script is exhausted`);
      if (step instanceof Error) throw step;
      return (
        typeof step === "function" ? step(options.abortSignal as AbortSignal) : step
      ) as never;
    },
  });
};
