import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemoryTransport, type Transport, UnauthorizedError } from "@modelcontextprotocol/client";
import { McpServer } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MemorySecretStore } from "../secrets/store.js";
import { openDatabase } from "../storage/database.js";
import { EventStore } from "../storage/event-store.js";
import { ConnectorManager, type TransportFactory } from "./connector-manager.js";
import { KeychainOAuthProvider } from "./oauth-provider.js";

const fixture = join(import.meta.dirname, "..", "..", "..", "..", "fixtures", "demo-station");

/** A fake Notion MCP server: two read tools, one write tool, one unknown tool with a read hint. */
const fakeNotion = () => {
  const calls: Array<{ name: string; args: unknown }> = [];
  const server = new McpServer({ name: "fake-notion", version: "1.0.0" });
  server.registerTool(
    "notion-search",
    {
      description: "Search pages",
      inputSchema: z.object({ query: z.string() }),
      annotations: { destructiveHint: true },
    },
    async (args) => {
      calls.push({ name: "notion-search", args });
      return { content: [{ type: "text", text: `Found: Project hub (${args.query})` }] };
    },
  );
  server.registerTool(
    "notion-update-page",
    {
      description: "Update a page",
      inputSchema: z.object({ id: z.string(), text: z.string() }),
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      calls.push({ name: "notion-update-page", args });
      if (args.id === "locked")
        return { content: [{ type: "text", text: "page is locked" }], isError: true };
      return { content: [{ type: "text", text: "updated" }] };
    },
  );
  server.registerTool(
    "notion-new-thing",
    {
      description: "A tool we have never heard of",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => ({ content: [{ type: "text", text: "ok" }] }),
  );
  return { server, calls };
};

/** Serves the fake server over an in-memory pair; every connect gets a fresh pair. */
const inMemory = (make = fakeNotion) => {
  let current = make();
  const factory: TransportFactory = async () => {
    current = make();
    const [client, server] = InMemoryTransport.createLinkedPair();
    await current.server.connect(server);
    return client as Transport;
  };
  return Object.assign(factory, { calls: () => current.calls });
};

const setup = (transports: TransportFactory, secrets = new MemorySecretStore()) => {
  const home = join(mkdtempSync(join(tmpdir(), "ow-mcp-")), "home");
  cpSync(fixture, home, { recursive: true });
  const events = new EventStore(openDatabase(":memory:"));
  const manager = new ConnectorManager({
    home,
    events,
    secrets,
    redirectUrl: (id) => `http://127.0.0.1:4317/oauth/callback/${id}`,
    transports,
    reconnect: { baseMs: 1, maxMs: 5 },
  });
  const statuses = () =>
    events
      .since(0)
      .filter((e) => e.type === "connector.status")
      .map((e) => (e.payload as { status: string }).status);
  return { home, events, manager, statuses, secrets };
};

const ctxSignal = () => new AbortController().signal;

describe("ConnectorManager", () => {
  it("lists the station's connectors as disconnected until connected", async () => {
    const t = setup(inMemory());
    await t.manager.refresh();
    expect(t.manager.views()).toEqual([
      expect.objectContaining({ id: "notion", name: "Notion", status: "disconnected", tools: [] }),
    ]);
  });

  it("connects, lists tools, and classifies them with our map, not the server's hints", async () => {
    const t = setup(inMemory());
    await t.manager.refresh();
    expect(await t.manager.connect("notion")).toEqual({ status: "connected" });
    const view = t.manager.views()[0];
    expect(view?.tools.map((x) => [x.name, x.class])).toEqual([
      ["notion-search", "read"],
      ["notion-update-page", "write"],
      ["notion-new-thing", "read"],
    ]);
    expect(t.manager.catalog()).toEqual({
      notion: [
        { name: "notion-search", class: "read" },
        { name: "notion-update-page", class: "write" },
        { name: "notion-new-thing", class: "read" },
      ],
    });
    expect(t.manager.describe("notion", "notion-search")).toMatchObject({
      description: "Search pages",
      inputSchema: expect.objectContaining({ required: ["query"] }),
    });
    expect(t.statuses()).toEqual(["connected"]);
  });

  it("calls a tool and returns its text; a tool error becomes a thrown error", async () => {
    const transports = inMemory();
    const t = setup(transports);
    await t.manager.refresh();
    await t.manager.connect("notion");
    expect(await t.manager.call("notion", "notion-search", { query: "hub" }, ctxSignal())).toBe(
      "Found: Project hub (hub)",
    );
    await expect(
      t.manager.call("notion", "notion-update-page", { id: "locked", text: "x" }, ctxSignal()),
    ).rejects.toThrow("page is locked");
    expect(transports.calls().map((c) => c.name)).toEqual(["notion-search", "notion-update-page"]);
  });

  it("refuses to call a connector that is not connected", async () => {
    const t = setup(inMemory());
    await t.manager.refresh();
    await expect(t.manager.call("notion", "notion-search", {}, ctxSignal())).rejects.toThrow(
      /not connected/,
    );
  });

  it("asks for sign-in when the server says so, and finishes it from the callback", async () => {
    const working = inMemory();
    let attempts = 0;
    let finished: string | undefined;
    const transports: TransportFactory = async (connector, provider) => {
      attempts++;
      if (attempts === 1) {
        return {
          async start() {
            const url = new URL("https://auth.example.test/authorize");
            url.searchParams.set("state", await (provider.state?.() ?? ""));
            await provider.redirectToAuthorization(url);
            throw new UnauthorizedError("sign in required");
          },
          async send() {},
          async close() {},
          async finishAuth(code: string) {
            finished = code;
          },
        } as unknown as Transport;
      }
      return working(connector, provider);
    };
    const t = setup(transports);
    await t.manager.refresh();
    const first = await t.manager.connect("notion");
    expect(first.status).toBe("needs_auth");
    const url = new URL(first.authorizationUrl ?? "");
    expect(url.origin).toBe("https://auth.example.test");
    expect(t.manager.views()[0]).toMatchObject({ status: "needs_auth" });

    await expect(t.manager.finishAuth("notion", "code-1", "wrong-state")).rejects.toThrow(/state/);
    expect(
      await t.manager.finishAuth("notion", "code-1", url.searchParams.get("state") ?? ""),
    ).toEqual({
      status: "connected",
    });
    expect(finished).toBe("code-1");
    expect(t.statuses()).toEqual(["needs_auth", "connected"]);
    // A state is good for one sign-in only.
    await expect(
      t.manager.finishAuth("notion", "code-2", url.searchParams.get("state") ?? ""),
    ).rejects.toThrow(/state/);
  });

  it("reports a server it cannot reach as an error, with the reason", async () => {
    const t = setup(async () => {
      throw new Error("connect ECONNREFUSED");
    });
    await t.manager.refresh();
    expect(await t.manager.connect("notion")).toEqual({
      status: "error",
      detail: "connect ECONNREFUSED",
    });
    expect(t.statuses()).toEqual(["error"]);
  });

  it("reconnects after the connection drops", async () => {
    const transports = inMemory();
    let transport: Transport | undefined;
    const t = setup(async (c, p) => {
      transport = await transports(c, p);
      return transport;
    });
    await t.manager.refresh();
    await t.manager.connect("notion");
    await transport?.close();
    for (let i = 0; i < 200 && t.statuses().at(-1) !== "connected"; i++) {
      await new Promise((r) => setTimeout(r, 2));
    }
    expect(t.statuses()).toEqual(["connected", "disconnected", "connected"]);
  });

  it("disconnects and, when asked, forgets the stored sign-in", async () => {
    const secrets = new MemorySecretStore();
    await secrets.set(
      "mcp.notion.tokens",
      JSON.stringify({ access_token: "a", token_type: "Bearer" }),
    );
    const t = setup(inMemory(), secrets);
    await t.manager.refresh();
    await t.manager.connect("notion");
    await t.manager.disconnect("notion", { forget: true });
    expect(t.manager.views()[0]?.status).toBe("disconnected");
    expect(await secrets.get("mcp.notion.tokens")).toBeUndefined();
  });

  it("follows station.json: a removed connector disappears, a changed URL reconnects fresh", async () => {
    const t = setup(inMemory());
    await t.manager.refresh();
    await t.manager.connect("notion");
    const path = join(t.home, "station.json");
    const station = JSON.parse(readFileSync(path, "utf8"));
    writeFileSync(path, JSON.stringify({ ...station, connectors: [] }));
    await t.manager.refresh();
    expect(t.manager.views()).toEqual([]);
    expect(t.manager.catalog()).toEqual({});
  });

  it("connects on startup only the connectors that already have a sign-in", async () => {
    const secrets = new MemorySecretStore();
    const t = setup(inMemory(), secrets);
    await t.manager.start();
    expect(t.manager.views()[0]?.status).toBe("disconnected");
    await secrets.set(
      "mcp.notion.tokens",
      JSON.stringify({ access_token: "a", token_type: "Bearer" }),
    );
    const again = setup(inMemory(), secrets);
    await again.manager.start();
    expect(again.manager.views()[0]?.status).toBe("connected");
    await again.manager.stop();
  });
});

describe("KeychainOAuthProvider", () => {
  const provider = (secrets = new MemorySecretStore(), port = 4317) =>
    new KeychainOAuthProvider({
      connectorId: "notion",
      secrets,
      redirectUrl: `http://127.0.0.1:${port}/oauth/callback/notion`,
      onAuthorizationUrl: () => {},
    });

  it("registers as a public loopback client of Outerworld AI", () => {
    expect(provider().clientMetadata).toMatchObject({
      client_name: "Outerworld AI",
      redirect_uris: ["http://127.0.0.1:4317/oauth/callback/notion"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
  });

  it("keeps tokens and client registration in the keychain, never in memory only", async () => {
    const secrets = new MemorySecretStore();
    const p = provider(secrets);
    await p.saveTokens({ access_token: "at", token_type: "Bearer", refresh_token: "rt" });
    await p.saveClientInformation?.({
      client_id: "c1",
      redirect_uris: ["http://127.0.0.1:4317/oauth/callback/notion"],
    });
    const fresh = provider(secrets);
    expect(await fresh.tokens()).toMatchObject({ access_token: "at", refresh_token: "rt" });
    expect(await fresh.clientInformation()).toMatchObject({ client_id: "c1" });
  });

  it("registers again when the daemon's port (and so the redirect) changed", async () => {
    const secrets = new MemorySecretStore();
    await provider(secrets).saveClientInformation?.({
      client_id: "c1",
      redirect_uris: ["http://127.0.0.1:4317/oauth/callback/notion"],
    });
    expect(await provider(secrets, 5000).clientInformation()).toBeUndefined();
  });

  it("keeps the PKCE verifier in memory and checks state once", async () => {
    const p = provider();
    await p.saveCodeVerifier("v1");
    expect(await p.codeVerifier()).toBe("v1");
    const state = await (p.state?.() ?? "");
    expect(state).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(p.consumeState("nope")).toBe(false);
    expect(p.consumeState(state)).toBe(true);
    expect(p.consumeState(state)).toBe(false);
  });
});
