import { describe, expect, it } from "vitest";
import { ApiError, createApi, readToken } from "./api.js";

describe("readToken", () => {
  it("reads the token the daemon (or the dev plugin) injected into the page", () => {
    document.head.innerHTML = `<meta name="outerworld-token" content="${"f".repeat(64)}">`;
    expect(readToken(document)).toBe("f".repeat(64));
  });

  it("returns undefined when the page was not served by the daemon", () => {
    document.head.innerHTML = "";
    expect(readToken(document)).toBeUndefined();
  });
});

describe("createApi", () => {
  const calls: Array<{
    url: string;
    headers: Record<string, string>;
    method?: string;
    body?: unknown;
  }> = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    calls.push({
      url,
      headers: init?.headers as Record<string, string>,
      ...(init?.method && init.method !== "GET" ? { method: init.method } : {}),
      ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}),
    });
    if (url.endsWith("/missing")) return new Response('{"error":"not found"}', { status: 404 });
    if (url.endsWith("/conflict")) {
      return new Response(
        '{"error":"second overseer","issues":[{"path":"agents.b.role","message":"taken"}]}',
        {
          status: 409,
        },
      );
    }
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    return new Response('{"ok":true}', { headers: { "content-type": "application/json" } });
  }) as unknown as typeof globalThis.fetch;

  it("GETs JSON under /api with the bearer token", async () => {
    const api = createApi({ token: "tok", fetch });
    expect(await api.get("/health")).toEqual({ ok: true });
    expect(calls.at(-1)).toEqual({ url: "/api/health", headers: { authorization: "Bearer tok" } });
  });

  it("sends JSON bodies with the token and returns undefined for 204", async () => {
    const api = createApi({ token: "tok", fetch });
    expect(await api.send("PATCH", "/agents/quill", { approvalMode: "full" })).toEqual({
      ok: true,
    });
    expect(calls.at(-1)).toEqual({
      url: "/api/agents/quill",
      method: "PATCH",
      headers: { authorization: "Bearer tok", "content-type": "application/json" },
      body: { approvalMode: "full" },
    });
    expect(await api.send("DELETE", "/agents/quill")).toBeUndefined();
  });

  it("carries the server's issues on a conflict", async () => {
    const api = createApi({ token: "tok", fetch });
    const error = await api.send("POST", "/conflict", {}).catch((e: unknown) => e);
    expect(error).toMatchObject({
      status: 409,
      issues: [{ path: "agents.b.role", message: "taken" }],
    });
  });

  it("throws an ApiError carrying the status and the server's message", async () => {
    const api = createApi({ token: "tok", fetch });
    const error = await api.get("/missing").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, message: "not found" });
  });
});
