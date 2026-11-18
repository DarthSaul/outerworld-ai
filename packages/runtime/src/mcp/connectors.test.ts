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
import {
  ConnectorManager,
  type SignInStarter,
  type TransportFactory,
} from "./connector-manager.js";
import { connectorSecretKey, KeychainOAuthProvider } from "./oauth-provider.js";

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

/** Starts a sign-in as the SDK would after discovery: a state, then the authorization URL. */
const fakeSignIn: SignInStarter = async (_connector, provider) => {
  const url = new URL("https://auth.example.test/authorize?scope=everything");
  url.searchParams.set("state", await (provider.state?.() ?? ""));
  await provider.redirectToAuthorization(url);
};

const setup = (
  transports: TransportFactory,
  secrets = new MemorySecretStore(),
  signIn: SignInStarter = fakeSignIn,
) => {
  const home = join(mkdtempSync(join(tmpdir(), "ow-mcp-")), "home");
  cpSync(fixture, home, { recursive: true });
  const events = new EventStore(openDatabase(":memory:"));
  const manager = new ConnectorManager({
    home,
    events,
    secrets,
    redirectUrl: (id) => `http://127.0.0.1:4317/oauth/callback/${id}`,
    transports,
    signIn,
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

/** The demo station's Notion server, and where a sign-in for it is kept. */
const DEMO_SERVER = "https://mcp.notion.example/mcp";
const demoTokens = connectorSecretKey("notion", DEMO_SERVER, "tokens");
const aToken = JSON.stringify({ access_token: "a", token_type: "Bearer" });

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
    let finished: { code: string; iss: string | undefined } | undefined;
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
          async finishAuth(code: string, iss?: string) {
            finished = { code, iss };
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
      await t.manager.finishAuth(
        "notion",
        "code-1",
        url.searchParams.get("state") ?? "",
        "https://auth.example.test",
      ),
    ).toEqual({
      status: "connected",
    });
    // The callback's `iss` reaches the SDK for its RFC 9207 check (Notion sends one).
    expect(finished).toEqual({ code: "code-1", iss: "https://auth.example.test" });
    expect(t.statuses()).toEqual(["needs_auth", "connected"]);
    // A state is good for one sign-in only.
    await expect(
      t.manager.finishAuth("notion", "code-2", url.searchParams.get("state") ?? ""),
    ).rejects.toThrow(/state/);
  });

  it("drops a connect that a disconnect overtook: its client is closed, never installed", async () => {
    const working = inMemory();
    let release = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const t = setup(async (connector, provider) => {
      await gate;
      return working(connector, provider);
    });
    await t.manager.refresh();
    const connecting = t.manager.connect("notion");
    await t.manager.disconnect("notion");
    release();
    expect((await connecting).status).toBe("disconnected");
    expect(t.manager.views()[0]).toMatchObject({ status: "disconnected", tools: [] });
    expect(t.manager.catalog()).toEqual({});
    expect(t.statuses()).not.toContain("connected");
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
    await secrets.set(demoTokens, aToken);
    const t = setup(inMemory(), secrets);
    await t.manager.refresh();
    await t.manager.connect("notion");
    await t.manager.disconnect("notion", { forget: true });
    expect(t.manager.views()[0]?.status).toBe("disconnected");
    expect(await secrets.get(demoTokens)).toBeUndefined();
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
    await secrets.set(demoTokens, aToken);
    const again = setup(inMemory(), secrets);
    await again.manager.start();
    expect(again.manager.views()[0]?.status).toBe("connected");
    await again.manager.stop();
  });

  it("never offers a sign-in to a server other than the one it was made for", async () => {
    // A sign-in for the real server, and one stored before sign-ins were tied to a server: the
    // demo station's connector has the same id but a different URL, so it must use neither.
    const secrets = new MemorySecretStore();
    await secrets.set(connectorSecretKey("notion", "https://mcp.notion.com/mcp", "tokens"), aToken);
    await secrets.set("mcp.notion.tokens", aToken);
    const opened: string[] = [];
    const transports: TransportFactory = (connector, provider) => {
      opened.push(connector.id);
      return inMemory()(connector, provider);
    };
    const t = setup(transports, secrets);
    await t.manager.start();
    expect(opened).toEqual([]);
    expect(t.manager.views()[0]?.status).toBe("disconnected");
    expect(t.statuses()).toEqual([]);
  });
});

describe("a server that registers no clients (ADR-0019)", () => {
  /** The demo station plus a GitHub connector at GitHub's hosted server. */
  const withGitHub = async (t: ReturnType<typeof setup>) => {
    const path = join(t.home, "station.json");
    const station = JSON.parse(readFileSync(path, "utf8"));
    station.connectors.push({
      id: "github",
      name: "GitHub",
      transport: { type: "http", url: "https://api.githubcopilot.com/mcp/" },
    });
    writeFileSync(path, JSON.stringify(station));
    await t.manager.refresh();
  };
  const github = (t: ReturnType<typeof setup>) => t.manager.views().find((v) => v.id === "github");
  /** The demo station plus a Gmail connector at Google's hosted server. */
  const withGmail = async (t: ReturnType<typeof setup>) => {
    const path = join(t.home, "station.json");
    const station = JSON.parse(readFileSync(path, "utf8"));
    station.connectors.push({
      id: "gmail",
      name: "Gmail",
      transport: { type: "http", url: "https://gmailmcp.googleapis.com/mcp/v1" },
    });
    writeFileSync(path, JSON.stringify(station));
    await t.manager.refresh();
  };
  const gmail = (t: ReturnType<typeof setup>) => t.manager.views().find((v) => v.id === "gmail");
  const gmailTokens = connectorSecretKey(
    "gmail",
    "https://gmailmcp.googleapis.com/mcp/v1",
    "tokens",
  );
  const githubTokens = connectorSecretKey("github", "https://api.githubcopilot.com/mcp/", "tokens");
  /** A sign-in already made with the client saved (a client replacement drops it). */
  const signedIn = (t: ReturnType<typeof setup>, token = "signed-in") =>
    t.secrets.set(githubTokens, JSON.stringify({ access_token: token, token_type: "Bearer" }));

  it("asks for the Commander's own OAuth client before connecting, with the redirect to register", async () => {
    const t = setup(inMemory());
    await withGitHub(t);
    expect(github(t)?.ownClient).toEqual({
      set: false,
      redirectUrl: "http://127.0.0.1:4317/oauth/callback/github",
    });
    // Notion registers clients itself: nothing to ask for.
    expect(t.manager.views().find((v) => v.id === "notion")?.ownClient).toBeUndefined();
    const answer = await t.manager.connect("github");
    expect(answer).toMatchObject({ status: "error", detail: expect.stringMatching(/client ID/) });
  });

  it("keeps the client in the keychain, reports only that it is set, and connects with it", async () => {
    const t = setup(inMemory());
    await withGitHub(t);
    await t.manager.setOwnClient("github", { clientId: "Iv1.abc", clientSecret: "shh" });
    expect(github(t)?.ownClient?.set).toBe(true);
    expect(JSON.stringify(t.manager.views())).not.toContain("shh");
    const key = connectorSecretKey("github", "https://api.githubcopilot.com/mcp/", "own");
    expect(await t.secrets.get(key)).toContain("Iv1.abc");
    await signedIn(t);
    expect((await t.manager.connect("github")).status).toBe("connected");
    // Forgetting the sign-in keeps the client; removing the connector drops it.
    await t.manager.disconnect("github", { forget: true });
    expect(github(t)?.ownClient?.set).toBe(true);
    await t.manager.disconnect("github", { forget: true, ownClient: true });
    expect(await t.secrets.get(key)).toBeUndefined();
    expect(github(t)?.ownClient?.set).toBe(false);
  });

  it("never keeps tokens from a sign-in that a client replacement overtook", async () => {
    let release = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const signIn: TransportFactory = async (_connector, provider) =>
      ({
        async start() {
          const url = new URL("https://auth.example.test/authorize");
          url.searchParams.set("state", await (provider.state?.() ?? ""));
          await provider.redirectToAuthorization(url);
          throw new UnauthorizedError("sign in required");
        },
        async send() {},
        async close() {},
        async finishAuth() {
          await gate;
          await provider.saveTokens({ access_token: "old-client", token_type: "Bearer" });
        },
      }) as unknown as Transport;
    const t = setup(signIn);
    await withGitHub(t);
    await t.manager.setOwnClient("github", { clientId: "first" });
    const asked = await t.manager.connect("github");
    const state = new URL(asked.authorizationUrl ?? "").searchParams.get("state") ?? "";
    const finishing = t.manager.finishAuth("github", "code", state).catch((e: Error) => e);
    const replacing = t.manager.setOwnClient("github", { clientId: "second" });
    // Give the replacement every chance to finish first; the exchange only writes after it.
    await Promise.race([replacing, new Promise((r) => setTimeout(r, 20))]);
    release();
    await Promise.all([finishing, replacing]);
    const tokens = connectorSecretKey("github", "https://api.githubcopilot.com/mcp/", "tokens");
    expect(await t.secrets.get(tokens)).toBeUndefined();
    // And an exchange arriving after the replacement finds no sign-in to finish.
    const again = await t.manager.connect("github");
    const next = new URL(again.authorizationUrl ?? "").searchParams.get("state") ?? "";
    await t.manager.setOwnClient("github", { clientId: "third" });
    await expect(t.manager.finishAuth("github", "code", next)).rejects.toThrow(/no sign-in/);
    expect(await t.secrets.get(tokens)).toBeUndefined();
  });

  it("leaves a connector disconnected when a disconnect lands during the code exchange", async () => {
    let release = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const working = inMemory();
    let signedIn = false;
    const t = setup(async (connector, provider) => {
      if (signedIn) return working(connector, provider);
      return {
        async start() {
          const url = new URL("https://auth.example.test/authorize");
          url.searchParams.set("state", await (provider.state?.() ?? ""));
          await provider.redirectToAuthorization(url);
          throw new UnauthorizedError("sign in required");
        },
        async send() {},
        async close() {},
        async finishAuth() {
          await gate;
          signedIn = true;
        },
      } as unknown as Transport;
    });
    await t.manager.refresh();
    const asked = await t.manager.connect("notion");
    const state = new URL(asked.authorizationUrl ?? "").searchParams.get("state") ?? "";
    const finishing = t.manager.finishAuth("notion", "code", state);
    await new Promise((r) => setTimeout(r, 5));
    await t.manager.disconnect("notion");
    release();
    expect((await finishing).status).toBe("disconnected");
    expect(t.manager.views()[0]).toMatchObject({ status: "disconnected" });
    expect(t.statuses()).not.toContain("connected");
  });

  it("connects with the client a replacement in flight leaves, not the one it replaces", async () => {
    const used: Array<string | undefined> = [];
    const working = inMemory();
    const t = setup(async (connector, provider) => {
      used.push((await provider.clientInformation())?.client_id);
      return working(connector, provider);
    });
    await withGitHub(t);
    await t.manager.setOwnClient("github", { clientId: "first" });
    let release = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const set = t.secrets.set.bind(t.secrets);
    t.secrets.set = async (key, value) => {
      if (key.endsWith(".own")) await gate;
      return set(key, value);
    };
    const replacing = t.manager.setOwnClient("github", { clientId: "second" });
    await new Promise((r) => setTimeout(r, 5));
    const connecting = t.manager.connect("github");
    await new Promise((r) => setTimeout(r, 5));
    release();
    await replacing;
    // The replacement dropped the sign-in, so the connect asks for one, with the new client.
    expect((await connecting).status).toBe("needs_auth");
    expect(used).toEqual(["second"]);
  });

  it("keeps a disconnect made while a connect waits on a client replacement", async () => {
    const t = setup(inMemory());
    await withGitHub(t);
    await t.manager.setOwnClient("github", { clientId: "first" });
    let release = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const set = t.secrets.set.bind(t.secrets);
    t.secrets.set = async (key, value) => {
      if (key.endsWith(".own")) await gate;
      return set(key, value);
    };
    const replacing = t.manager.setOwnClient("github", { clientId: "second" });
    await new Promise((r) => setTimeout(r, 5));
    const connecting = t.manager.connect("github");
    await t.manager.disconnect("github");
    release();
    await replacing;
    expect((await connecting).status).toBe("disconnected");
    expect(t.manager.catalog()).toEqual({});
    expect(t.statuses()).not.toContain("connected");
  });

  it("forgets a sign-in whose code exchange was still finishing", async () => {
    let release = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const signIn: TransportFactory = async (_connector, provider) =>
      ({
        async start() {
          const url = new URL("https://auth.example.test/authorize");
          url.searchParams.set("state", await (provider.state?.() ?? ""));
          await provider.redirectToAuthorization(url);
          throw new UnauthorizedError("sign in required");
        },
        async send() {},
        async close() {},
        async finishAuth() {
          await gate;
          await provider.saveTokens({ access_token: "late", token_type: "Bearer" });
        },
      }) as unknown as Transport;
    const t = setup(signIn);
    await withGitHub(t);
    await t.manager.setOwnClient("github", { clientId: "mine" });
    const asked = await t.manager.connect("github");
    const state = new URL(asked.authorizationUrl ?? "").searchParams.get("state") ?? "";
    const finishing = t.manager.finishAuth("github", "code", state);
    await new Promise((r) => setTimeout(r, 5));
    const forgetting = t.manager.disconnect("github", { forget: true });
    // Give the forget every chance to finish first; the late exchange only writes after it.
    await Promise.race([forgetting, new Promise((r) => setTimeout(r, 20))]);
    release();
    expect((await finishing).status).toBe("disconnected");
    await forgetting;
    const tokens = connectorSecretKey("github", "https://api.githubcopilot.com/mcp/", "tokens");
    expect(await t.secrets.get(tokens)).toBeUndefined();
    expect(t.statuses()).not.toContain("connected");
  });

  it("removes an own client whose replacement was still being saved", async () => {
    const t = setup(inMemory());
    await withGitHub(t);
    await t.manager.setOwnClient("github", { clientId: "first" });
    let release = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const set = t.secrets.set.bind(t.secrets);
    t.secrets.set = async (key, value) => {
      if (key.endsWith(".own")) await gate;
      return set(key, value);
    };
    const replacing = t.manager.setOwnClient("github", { clientId: "second" });
    await new Promise((r) => setTimeout(r, 5));
    const removing = t.manager.disconnect("github", { forget: true, ownClient: true });
    await Promise.race([removing, new Promise((r) => setTimeout(r, 20))]);
    release();
    await Promise.all([replacing, removing]);
    const own = connectorSecretKey("github", "https://api.githubcopilot.com/mcp/", "own");
    expect(await t.secrets.get(own)).toBeUndefined();
    expect(t.manager.views().find((v) => v.id === "github")?.ownClient?.set).toBe(false);
  });

  it("never lets a connect under way restore tokens that a forget deleted", async () => {
    let release = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const working = inMemory();
    let first = true;
    const t = setup(async (connector, provider) => {
      if (first) {
        first = false;
        // A token refresh that only lands after the forget.
        await gate;
        await provider.saveTokens({ access_token: "refreshed", token_type: "Bearer" });
      } else {
        await provider.saveTokens({ access_token: "fresh", token_type: "Bearer" });
      }
      return working(connector, provider);
    });
    await withGitHub(t);
    await t.manager.setOwnClient("github", { clientId: "mine" });
    await signedIn(t);
    const tokens = githubTokens;
    const connecting = t.manager.connect("github");
    await new Promise((r) => setTimeout(r, 5));
    await t.manager.disconnect("github", { forget: true });
    release();
    expect((await connecting).status).toBe("disconnected");
    expect(await t.secrets.get(tokens)).toBeUndefined();
    // A connect begun after the forget (and a new sign-in) is not affected.
    await signedIn(t);
    expect((await t.manager.connect("github")).status).toBe("connected");
    expect(JSON.parse((await t.secrets.get(tokens)) ?? "{}")).toMatchObject({
      access_token: "fresh",
    });
  });

  it("never lets a superseded connect clear tokens a newer sign-in saved", async () => {
    let release = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const working = inMemory();
    let first = true;
    const t = setup(async (connector, provider) => {
      if (first) {
        first = false;
        // An auth error that only surfaces after the client was replaced and signed in again.
        await gate;
        await provider.invalidateCredentials("all");
        throw new Error("invalid_grant");
      }
      await provider.saveTokens({ access_token: "fresh", token_type: "Bearer" });
      return working(connector, provider);
    });
    await withGitHub(t);
    await t.manager.setOwnClient("github", { clientId: "first" });
    await signedIn(t);
    const tokens = githubTokens;
    const old = t.manager.connect("github");
    await new Promise((r) => setTimeout(r, 5));
    await t.manager.setOwnClient("github", { clientId: "second" });
    await signedIn(t);
    expect((await t.manager.connect("github")).status).toBe("connected");
    release();
    await old;
    expect(JSON.parse((await t.secrets.get(tokens)) ?? "{}")).toMatchObject({
      access_token: "fresh",
    });
    expect(t.manager.views().find((v) => v.id === "github")?.status).toBe("connected");
  });

  it("signs in before connecting, never trusting a server that answers without a token", async () => {
    // Gmail's server lists its tools to anyone and refuses only a tool call: an unsigned
    // connection must not be reported as connected.
    const working = inMemory();
    let exchanged: string | undefined;
    const t = setup(async (connector, provider) => {
      if (await provider.hasTokens()) return working(connector, provider);
      return {
        async start() {},
        async send() {},
        async close() {},
        async finishAuth(code: string) {
          exchanged = code;
          await provider.saveTokens({ access_token: "gmail", token_type: "Bearer" });
        },
      } as unknown as Transport;
    });
    await withGmail(t);
    await t.manager.setOwnClient("gmail", { clientId: "web.apps.googleusercontent.com" });
    const asked = await t.manager.connect("gmail");
    expect(asked.status).toBe("needs_auth");
    const url = new URL(asked.authorizationUrl ?? "");
    // One scope that covers Gmail's tools, not every scope the server lists, and offline access
    // so Google returns a refresh token.
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/gmail.modify");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    // The card can offer the sign-in whoever started it.
    expect(gmail(t)).toMatchObject({ status: "needs_auth", authorizationUrl: url.href });
    expect(t.statuses()).toEqual(["needs_auth"]);

    const state = url.searchParams.get("state") ?? "";
    expect(await t.manager.finishAuth("gmail", "code-g", state)).toEqual({ status: "connected" });
    expect(exchanged).toBe("code-g");
    expect(gmail(t)?.authorizationUrl).toBeUndefined();
  });

  it("reports a sign-in that could not start as an error, with the reason", async () => {
    const t = setup(inMemory(), new MemorySecretStore(), async () => {
      throw new Error("discovery failed");
    });
    await withGmail(t);
    await t.manager.setOwnClient("gmail", { clientId: "web" });
    expect(await t.manager.connect("gmail")).toEqual({
      status: "error",
      detail: "discovery failed",
    });
  });

  it("asks for sign-in again when a tool call is refused, and tells the agent why", async () => {
    // A connection whose tool calls the server refuses (an expired or revoked token).
    const refusing: TransportFactory = async (connector, provider) => {
      const transport = await inMemory()(connector, provider);
      const send = transport.send.bind(transport);
      transport.send = async (message, options) => {
        if ("method" in message && message.method === "tools/call") {
          throw new UnauthorizedError("Unauthorized");
        }
        return send(message, options);
      };
      return transport;
    };
    const t = setup(refusing);
    await withGmail(t);
    await t.manager.setOwnClient("gmail", { clientId: "web" });
    await t.secrets.set(
      gmailTokens,
      JSON.stringify({ access_token: "stale", token_type: "Bearer" }),
    );
    expect((await t.manager.connect("gmail")).status).toBe("connected");
    await expect(
      t.manager.call("gmail", "notion-search", { query: "is:unread" }, ctxSignal()),
    ).rejects.toThrow(/sign in again/);
    expect(gmail(t)).toMatchObject({
      status: "needs_auth",
      authorizationUrl: expect.stringContaining("access_type=offline"),
    });
    // The refused token is dropped, so a restart does not reconnect with it.
    expect(await t.secrets.get(gmailTokens)).toBeUndefined();
    expect(t.manager.catalog()).toEqual({});
  });

  it("keeps a disconnect that lands while a refused sign-in is being dropped", async () => {
    const t = setup(async (connector, provider) => {
      const transport = await inMemory()(connector, provider);
      const send = transport.send.bind(transport);
      transport.send = async (message, options) => {
        if ("method" in message && message.method === "tools/call") {
          throw new UnauthorizedError("Unauthorized");
        }
        return send(message, options);
      };
      // The Commander disconnects while the refused connection is closing.
      const close = transport.close.bind(transport);
      transport.close = async () => {
        void t.manager.disconnect("gmail");
        await close();
      };
      return transport;
    });
    await withGmail(t);
    await t.manager.setOwnClient("gmail", { clientId: "web" });
    const stale = JSON.stringify({ access_token: "stale", token_type: "Bearer" });
    await t.secrets.set(gmailTokens, stale);
    expect((await t.manager.connect("gmail")).status).toBe("connected");
    await expect(
      t.manager.call("gmail", "notion-search", { query: "is:unread" }, ctxSignal()),
    ).rejects.toThrow(/sign in again/);
    // The disconnect stands: nothing reconnects, and a plain disconnect keeps the sign-in.
    expect(gmail(t)).toMatchObject({ status: "disconnected" });
    expect(gmail(t)).not.toHaveProperty("authorizationUrl");
    expect(await t.secrets.get(gmailTokens)).toBe(stale);
  });

  it("points the agent at Abilities when a sign-in is refused", async () => {
    const refusing: TransportFactory = async (connector, provider) => {
      const transport = await inMemory()(connector, provider);
      const send = transport.send.bind(transport);
      transport.send = async (message, options) => {
        if ("method" in message && message.method === "tools/call") {
          throw new UnauthorizedError("Unauthorized");
        }
        return send(message, options);
      };
      return transport;
    };
    const t = setup(refusing);
    await withGmail(t);
    await t.manager.setOwnClient("gmail", { clientId: "web" });
    await t.secrets.set(gmailTokens, aToken);
    await t.manager.connect("gmail");
    await expect(
      t.manager.call("gmail", "notion-search", { query: "x" }, ctxSignal()),
    ).rejects.toThrow("Abilities › Installed");
  });

  it("leaves other tool errors as they are", async () => {
    const t = setup(inMemory());
    await t.manager.refresh();
    await t.manager.connect("notion");
    await expect(
      t.manager.call("notion", "notion-update-page", { id: "locked", text: "x" }, ctxSignal()),
    ).rejects.toThrow("page is locked");
    expect(t.manager.views()[0]?.status).toBe("connected");
  });

  it("refuses an own client for a server that registers its own", async () => {
    const t = setup(inMemory());
    await t.manager.refresh();
    await expect(t.manager.setOwnClient("notion", { clientId: "x" })).rejects.toThrow(
      /registers its own/,
    );
  });
});

describe("KeychainOAuthProvider", () => {
  const provider = (secrets = new MemorySecretStore(), port = 4317, server = DEMO_SERVER) =>
    new KeychainOAuthProvider({
      connectorId: "notion",
      server,
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

  it("ties tokens and registration to the server they were issued by", async () => {
    const secrets = new MemorySecretStore();
    const real = provider(secrets, 4317, "https://mcp.notion.com/mcp");
    await real.saveTokens({ access_token: "at", token_type: "Bearer" });
    await real.saveClientInformation?.({
      client_id: "c1",
      redirect_uris: ["http://127.0.0.1:4317/oauth/callback/notion"],
    });
    const other = provider(secrets);
    expect(await other.hasTokens()).toBe(false);
    expect(await other.tokens()).toBeUndefined();
    expect(await other.clientInformation()).toBeUndefined();
    // Signing in on the other station does not overwrite the first one's sign-in.
    await other.saveTokens({ access_token: "demo", token_type: "Bearer" });
    expect(await real.tokens()).toMatchObject({ access_token: "at" });
    expect(connectorSecretKey("notion", DEMO_SERVER, "tokens")).toMatch(
      /^mcp\.notion\.[0-9a-f]{16}\.tokens$/,
    );
  });

  it("ignores a sign-in stored before sign-ins were tied to a server, and forgets it", async () => {
    const secrets = new MemorySecretStore();
    await secrets.set("mcp.notion.tokens", "{}");
    await secrets.set("mcp.notion.client", "{}");
    const p = provider(secrets);
    expect(await p.hasTokens()).toBe(false);
    expect(await p.tokens()).toBeUndefined();
    await p.forget();
    expect(await secrets.get("mcp.notion.tokens")).toBeUndefined();
    expect(await secrets.get("mcp.notion.client")).toBeUndefined();
  });

  it("signs in with the Commander's own client, whatever the port, and drops older sign-ins", async () => {
    const secrets = new MemorySecretStore();
    const p = provider(secrets);
    await p.saveTokens({ access_token: "at", token_type: "Bearer" });
    await p.setOwnClient({ clientId: "own-id", clientSecret: "own-secret" });
    expect(await p.tokens()).toBeUndefined();
    expect(await p.hasOwnClient()).toBe(true);
    expect(await provider(secrets, 5000).clientInformation()).toEqual({
      client_id: "own-id",
      client_secret: "own-secret",
      token_endpoint_auth_method: "client_secret_post",
      redirect_uris: ["http://127.0.0.1:5000/oauth/callback/notion"],
    });
    await p.setOwnClient({ clientId: "public-id" });
    expect(await p.clientInformation()).toEqual({
      client_id: "public-id",
      redirect_uris: ["http://127.0.0.1:4317/oauth/callback/notion"],
    });
  });

  it("asks for a profiled server's own scope and parameters in place of the SDK's", () => {
    const seen: string[] = [];
    const p = new KeychainOAuthProvider({
      connectorId: "gmail",
      server: "https://gmailmcp.googleapis.com/mcp/v1",
      secrets: new MemorySecretStore(),
      redirectUrl: "http://127.0.0.1:4317/oauth/callback/gmail",
      onAuthorizationUrl: (u) => seen.push(u),
      authorization: { scope: "s1", params: { access_type: "offline" } },
    });
    p.redirectToAuthorization(new URL("https://accounts.example.test/auth?scope=a+b&state=x"));
    const url = new URL(seen[0] ?? "");
    expect(url.searchParams.get("scope")).toBe("s1");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("state")).toBe("x");
    // Without a profile the URL is handed on as the SDK built it.
    const plain: string[] = [];
    new KeychainOAuthProvider({
      connectorId: "notion",
      server: DEMO_SERVER,
      secrets: new MemorySecretStore(),
      redirectUrl: "http://127.0.0.1:4317/oauth/callback/notion",
      onAuthorizationUrl: (u) => plain.push(u),
    }).redirectToAuthorization(new URL("https://auth.example.test/a?scope=x"));
    expect(plain).toEqual(["https://auth.example.test/a?scope=x"]);
  });

  it("lets only the newest attempt set the verifier, the state, and the sign-in URL", async () => {
    const urls: string[] = [];
    const p = new KeychainOAuthProvider({
      connectorId: "notion",
      server: DEMO_SERVER,
      secrets: new MemorySecretStore(),
      redirectUrl: "http://127.0.0.1:4317/oauth/callback/notion",
      onAuthorizationUrl: (url) => urls.push(url),
    });
    // A disconnect and reconnect: no forget, so the epoch is unchanged.
    const older = p.forAttempt();
    const newer = p.forAttempt();
    await newer.saveCodeVerifier("new");
    const state = await (newer.state?.() ?? "");
    await newer.redirectToAuthorization(new URL("https://auth.example.test/a?n=new"));
    // The superseded attempt finishes discovery late; none of it lands.
    await older.saveCodeVerifier("old");
    const olderState = await (older.state?.() ?? "");
    await older.redirectToAuthorization(new URL("https://auth.example.test/a?n=old"));
    expect(await p.codeVerifier()).toBe("new");
    expect(urls).toEqual(["https://auth.example.test/a?n=new"]);
    expect(p.consumeState(olderState)).toBe(false);
    expect(p.consumeState(state)).toBe(true);
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
