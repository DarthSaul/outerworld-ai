import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ApiKeyService,
  ConnectorManager,
  EventStore,
  MemorySecretStore,
  openDatabase,
  type TransportFactory,
} from "@darthsaul/outerworld-ai-runtime";
import { InMemoryTransport, type Transport, UnauthorizedError } from "@modelcontextprotocol/client";
import { McpServer } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createApp } from "./app.js";
import { testServices } from "./test/services.js";

const TOKEN = "e".repeat(64);
const fixture = join(import.meta.dirname, "..", "..", "..", "fixtures", "demo-station");

const fakeNotion: TransportFactory = async () => {
  const server = new McpServer({ name: "fake-notion", version: "1.0.0" });
  server.registerTool(
    "notion-search",
    { description: "Search", inputSchema: z.object({ q: z.string() }) },
    async () => ({
      content: [{ type: "text", text: "found" }],
    }),
  );
  server.registerTool(
    "notion-update-page",
    { description: "Update", inputSchema: z.object({}) },
    async () => ({
      content: [{ type: "text", text: "ok" }],
    }),
  );
  const [client, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  return client as Transport;
};

/** First connect asks for sign-in (like the real server), later connects work. */
const signInFirst = (): TransportFactory => {
  let attempts = 0;
  return async (connector, provider) => {
    attempts++;
    if (attempts > 1) return fakeNotion(connector, provider);
    return {
      async start() {
        const url = new URL("https://auth.example.test/authorize");
        url.searchParams.set("state", await (provider.state?.() ?? ""));
        await provider.redirectToAuthorization(url);
        throw new UnauthorizedError("sign in");
      },
      async send() {},
      async close() {},
      async finishAuth() {},
    } as unknown as Transport;
  };
};

const setup = (transports: TransportFactory = fakeNotion) => {
  const home = join(mkdtempSync(join(tmpdir(), "ow-conn-")), "home");
  cpSync(fixture, home, { recursive: true });
  const events = new EventStore(openDatabase(":memory:"));
  const secrets = new MemorySecretStore();
  const services = testServices(home, events, secrets);
  const connectors = new ConnectorManager({
    home,
    events,
    secrets,
    redirectUrl: (id) => `http://127.0.0.1:4317/oauth/callback/${id}`,
    transports,
  });
  const app = createApp({
    token: TOKEN,
    allowedOrigins: ["http://127.0.0.1:4317"],
    allowedHosts: ["127.0.0.1:4317"],
    events,
    ...services,
    connectors,
    apiKeys: new ApiKeyService({ store: secrets, env: {} }),
    version: "test",
  });
  const call = async (
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) => {
    const res = await app.request(`http://127.0.0.1:4317${path}`, {
      method,
      headers: {
        authorization: `Bearer ${TOKEN}`,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    return { status: res.status, text, json: json as Record<string, unknown> & unknown[] };
  };
  return { call, secrets, app };
};

describe("connector routes", () => {
  it("lists the station's connectors with status, tools, and who is granted", async () => {
    const { call } = setup();
    const list = (await call("GET", "/api/connectors")).json;
    expect(list).toEqual([
      expect.objectContaining({
        id: "notion",
        status: "disconnected",
        tools: [],
        grantedTo: ["quill"],
      }),
    ]);
  });

  it("connects and lists classified tools", async () => {
    const { call } = setup();
    expect((await call("POST", "/api/connectors/notion/connect")).json).toEqual({
      status: "connected",
    });
    const [notion] = (await call("GET", "/api/connectors")).json as unknown as Array<{
      status: string;
      tools: Array<{ name: string; class: string }>;
    }>;
    expect(notion?.status).toBe("connected");
    expect(notion?.tools.map((t) => [t.name, t.class])).toEqual([
      ["notion-search", "read"],
      ["notion-update-page", "write"],
    ]);
  });

  it("guards installs and removals: duplicate 409, bad URL 400, in-use 409", async () => {
    const { call } = setup();
    expect((await call("POST", "/api/connectors", { preset: "notion" })).status).toBe(409);
    expect((await call("PATCH", "/api/connectors/notion", { url: "ftp://x" })).status).toBe(400);
    const removal = await call("DELETE", "/api/connectors/notion");
    expect(removal.status).toBe(409);
    expect(removal.json.error).toMatch(/quill/);
    const patched = await call("PATCH", "/api/connectors/notion", {
      url: "https://mcp.notion.com/mcp",
    });
    expect(patched.json.transport).toEqual({ type: "http", url: "https://mcp.notion.com/mcp" });
  });

  it("disconnects and, when asked, forgets the stored sign-in", async () => {
    const { call, secrets } = setup();
    await secrets.set("mcp.notion.tokens", "{}");
    await call("POST", "/api/connectors/notion/connect");
    expect((await call("POST", "/api/connectors/notion/disconnect", { forget: true })).status).toBe(
      204,
    );
    expect(await secrets.get("mcp.notion.tokens")).toBeUndefined();
    expect(((await call("GET", "/api/connectors")).json[0] as { status: string }).status).toBe(
      "disconnected",
    );
  });
});

describe("OAuth sign-in", () => {
  it("answers connect with a sign-in URL, then finishes from Notion's redirect without the API token", async () => {
    const { call } = setup(signInFirst());
    const started = (await call("POST", "/api/connectors/notion/connect")).json as unknown as {
      status: string;
      authorizationUrl: string;
    };
    expect(started.status).toBe("needs_auth");
    const state = new URL(started.authorizationUrl).searchParams.get("state") ?? "";
    const back = await call("GET", `/oauth/callback/notion?code=abc&state=${state}`, undefined, {
      authorization: "",
      "sec-fetch-site": "cross-site",
    });
    expect(back.status).toBe(200);
    expect(back.text).toContain("Connected");
    expect(((await call("GET", "/api/connectors")).json[0] as { status: string }).status).toBe(
      "connected",
    );
  });

  it("refuses a callback with the wrong state, a missing code, or an error from the service", async () => {
    const { call } = setup(signInFirst());
    await call("POST", "/api/connectors/notion/connect");
    expect((await call("GET", "/oauth/callback/notion?code=abc&state=forged")).status).toBe(400);
    expect((await call("GET", "/oauth/callback/notion?state=x")).status).toBe(400);
    const denied = await call("GET", "/oauth/callback/notion?error=access_denied");
    expect(denied.status).toBe(400);
    expect(denied.text).toContain("access_denied");
  });

  it("escapes whatever the service puts in the error, and still guards /api with the token", async () => {
    const { call } = setup();
    const res = await call("GET", "/oauth/callback/notion?error=%3Cscript%3Ex%3C%2Fscript%3E");
    expect(res.text).not.toContain("<script>");
    expect(
      (
        await call("GET", "/api/connectors", undefined, {
          authorization: "",
          "sec-fetch-site": "cross-site",
        })
      ).status,
    ).toBe(403);
    expect((await call("GET", "/api/connectors", undefined, { authorization: "" })).status).toBe(
      401,
    );
  });
});
