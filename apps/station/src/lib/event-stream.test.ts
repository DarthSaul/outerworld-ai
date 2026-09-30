import type { RuntimeEvent } from "@darthsaul/outerworld-ai-core";
import { describe, expect, it } from "vitest";
import { type ConnectionStatus, connectEvents } from "./event-stream.js";

const TOKEN = "t".repeat(64);

const event = (seq: number): RuntimeEvent => ({
  seq,
  type: "run.delta",
  at: "2026-09-29T12:00:00.000Z",
  agentId: "pm",
  sessionId: "s1",
  runId: "r1",
  payload: { text: String(seq) },
});

const sse = (...events: RuntimeEvent[]) =>
  events.map((e) => `id: ${e.seq}\ndata: ${JSON.stringify(e)}\n\n`).join("");

/** A body that emits the given chunks, then either ends or stays open until aborted. */
const body = (
  chunks: string[],
  { hang = false, signal }: { hang?: boolean; signal?: AbortSignal } = {},
) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
      if (!hang) controller.close();
      signal?.addEventListener("abort", () =>
        controller.error(new DOMException("aborted", "AbortError")),
      );
    },
  });

type Call = { url: string; headers: Record<string, string> };

const fakeFetch = (responses: Array<(signal: AbortSignal) => Response>) => {
  const calls: Call[] = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), headers: { ...(init?.headers as Record<string, string>) } });
    const next = responses.shift();
    if (!next) return new Promise<Response>(() => {});
    return next(init?.signal as AbortSignal);
  };
  return { fetch: fetch as typeof globalThis.fetch, calls };
};

const until = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 1));
  expect(check()).toBe(true);
};

describe("connectEvents", () => {
  it("sends the bearer token, parses events, and reports connected", async () => {
    const { fetch, calls } = fakeFetch([
      (signal) => new Response(body([sse(event(1), event(2))], { hang: true, signal })),
    ]);
    const got: number[] = [];
    const statuses: ConnectionStatus[] = [];
    const conn = connectEvents({
      url: "/api/events",
      token: TOKEN,
      fetch,
      onEvent: (e) => got.push(e.seq),
      onStatus: (s) => statuses.push(s),
      sleep: async () => {},
    });
    await until(() => got.length === 2);
    expect(calls[0]?.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(calls[0]?.headers["last-event-id"]).toBeUndefined();
    expect(statuses).toEqual(["connecting", "connected"]);
    conn.close();
  });

  it("reconnects after the stream ends and resumes from the last event id", async () => {
    const { fetch, calls } = fakeFetch([
      () => new Response(body([sse(event(1), event(2))])),
      (signal) => new Response(body([sse(event(3))], { hang: true, signal })),
    ]);
    const got: number[] = [];
    const conn = connectEvents({
      url: "/api/events",
      token: TOKEN,
      fetch,
      onEvent: (e) => got.push(e.seq),
      sleep: async () => {},
    });
    await until(() => got.length === 3);
    expect(calls[1]?.headers["last-event-id"]).toBe("2");
    expect(got).toEqual([1, 2, 3]);
    conn.close();
  });

  it("backs off exponentially between failed attempts, up to a cap", async () => {
    const { fetch } = fakeFetch([
      () => Promise.reject(new TypeError("offline")) as unknown as Response,
      () => new Response("down", { status: 503 }),
      () => Promise.reject(new TypeError("offline")) as unknown as Response,
    ]);
    const waits: number[] = [];
    const conn = connectEvents({
      url: "/api/events",
      token: TOKEN,
      fetch: (async (...args: Parameters<typeof globalThis.fetch>) =>
        fetch(...args)) as typeof globalThis.fetch,
      onEvent: () => {},
      sleep: async (ms) => {
        waits.push(ms);
      },
      backoff: { initialMs: 100, maxMs: 300 },
    });
    await until(() => waits.length >= 3);
    expect(waits.slice(0, 3)).toEqual([100, 200, 300]);
    conn.close();
  });

  it("resets the backoff once a connection succeeds", async () => {
    const { fetch } = fakeFetch([
      () => new Response("down", { status: 503 }),
      () => new Response(body([sse(event(1))])),
      () => new Response("down", { status: 503 }),
    ]);
    const waits: number[] = [];
    const conn = connectEvents({
      url: "/api/events",
      token: TOKEN,
      fetch,
      onEvent: () => {},
      sleep: async (ms) => {
        waits.push(ms);
      },
      backoff: { initialMs: 100, maxMs: 1000 },
    });
    await until(() => waits.length >= 3);
    expect(waits.slice(0, 3)).toEqual([100, 100, 200]);
    conn.close();
  });

  it("stops and reports unauthorized on 401 instead of retrying forever", async () => {
    const { fetch, calls } = fakeFetch([() => new Response("no", { status: 401 })]);
    const statuses: ConnectionStatus[] = [];
    connectEvents({
      url: "/api/events",
      token: TOKEN,
      fetch,
      onEvent: () => {},
      onStatus: (s) => statuses.push(s),
      sleep: async () => {},
    });
    await until(() => statuses.includes("unauthorized"));
    await new Promise((r) => setTimeout(r, 5));
    expect(calls).toHaveLength(1);
  });

  it("skips a message that is not a valid event, and reports it", async () => {
    const bad = `id: 1\ndata: {"type":"run.exploded"}\n\n`;
    const { fetch } = fakeFetch([
      (signal) => new Response(body([bad, sse(event(2))], { hang: true, signal })),
    ]);
    const got: number[] = [];
    const invalid: string[] = [];
    const conn = connectEvents({
      url: "/api/events",
      token: TOKEN,
      fetch,
      onEvent: (e) => got.push(e.seq),
      onInvalid: (raw) => invalid.push(raw),
      sleep: async () => {},
    });
    await until(() => got.length === 1);
    expect(got).toEqual([2]);
    expect(invalid).toHaveLength(1);
    conn.close();
  });

  it("stops reconnecting after close and reports closed", async () => {
    const { fetch, calls } = fakeFetch([
      (signal) => new Response(body([], { hang: true, signal })),
    ]);
    const statuses: ConnectionStatus[] = [];
    const conn = connectEvents({
      url: "/api/events",
      token: TOKEN,
      fetch,
      onEvent: () => {},
      onStatus: (s) => statuses.push(s),
      sleep: async () => {},
    });
    await until(() => statuses.includes("connected"));
    conn.close();
    await new Promise((r) => setTimeout(r, 5));
    expect(calls).toHaveLength(1);
    expect(statuses.at(-1)).toBe("closed");
  });
});
