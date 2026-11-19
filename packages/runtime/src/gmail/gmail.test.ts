import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fromBase64, GMAIL_PRESET, toBase64Url } from "@darthsaul/outerworld-ai-core";
import { describe, expect, it } from "vitest";
import { ConnectorManager } from "../mcp/connector-manager.js";
import { connectorSecretKey, KeychainOAuthProvider } from "../mcp/oauth-provider.js";
import { MemorySecretStore } from "../secrets/store.js";
import { openDatabase } from "../storage/database.js";
import { EventStore } from "../storage/event-store.js";
import { GmailApi } from "./gmail-api.js";
import {
  finishGoogleSignIn,
  GOOGLE_TOKEN_URL,
  googleAccessToken,
  SignInRequiredError,
  startGoogleSignIn,
} from "./google-oauth.js";
import { migrateLegacyGmailConnector } from "./migrate.js";

const fixture = join(import.meta.dirname, "..", "..", "..", "..", "fixtures", "demo-station");
const REDIRECT = "http://127.0.0.1:4317/oauth/callback/gmail";
const SERVER = JSON.stringify(GMAIL_PRESET.transport);
const key = (kind: "own" | "tokens" | "client", server = SERVER) =>
  connectorSecretKey("gmail", server, kind);
const NOW = 1_800_000_000_000;

interface Seen {
  readonly method: string;
  readonly url: URL;
  readonly auth?: string | null;
  readonly body?: string;
}

/**
 * A fake Google: the token endpoint and Gmail's REST API. `routes` answers a request by method
 * and path (the part after `users/me/`); every request is recorded.
 */
const fakeGoogle = (
  routes: Record<string, (req: Seen) => { status?: number; json: unknown }> = {},
  token: (form: URLSearchParams) => { status?: number; json: unknown } = () => ({
    json: { access_token: "fresh", expires_in: 3599, token_type: "Bearer" },
  }),
) => {
  const seen: Seen[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const body = init?.body === undefined ? undefined : String(init.body);
    const headers = new Headers(init?.headers);
    const req: Seen = {
      method: init?.method ?? "GET",
      url,
      auth: headers.get("authorization"),
      ...(body !== undefined ? { body } : {}),
    };
    seen.push(req);
    const reply = (r: { status?: number; json: unknown }) =>
      new Response(JSON.stringify(r.json), {
        status: r.status ?? 200,
        headers: { "content-type": "application/json" },
      });
    if (url.href === GOOGLE_TOKEN_URL) return reply(token(new URLSearchParams(body)));
    const path = url.pathname.replace("/gmail/v1/users/me/", "");
    const route = routes[`${req.method} ${path}`];
    if (!route) return reply({ status: 404, json: { error: { message: `no route ${path}` } } });
    return reply(route(req));
  }) as typeof fetch;
  return { fetch: fetchFn, seen };
};

const provider = (secrets = new MemorySecretStore()) => {
  let authorizationUrl: string | undefined;
  const p = new KeychainOAuthProvider({
    connectorId: "gmail",
    server: SERVER,
    secrets,
    redirectUrl: REDIRECT,
    onAuthorizationUrl: (u) => {
      authorizationUrl = u;
    },
    authorization: {
      scope: "https://www.googleapis.com/auth/gmail.modify",
      params: { access_type: "offline", prompt: "consent" },
    },
  });
  return { p, secrets, url: () => authorizationUrl };
};

describe("Google sign-in", () => {
  it("builds the authorization URL: own client, loopback redirect, PKCE S256, gmail.modify, offline", async () => {
    const t = provider();
    await t.p.setOwnClient({ clientId: "web.apps.googleusercontent.com", clientSecret: "shh" });
    await startGoogleSignIn(t.p);
    const url = new URL(t.url() ?? "");
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "web.apps.googleusercontent.com",
      redirect_uri: REDIRECT,
      response_type: "code",
      code_challenge_method: "S256",
      scope: "https://www.googleapis.com/auth/gmail.modify",
      access_type: "offline",
      prompt: "consent",
    });
    // The challenge is the verifier's SHA-256; the secret never goes in the URL.
    const challenge = createHash("sha256").update(t.p.codeVerifier()).digest("base64url");
    expect(url.searchParams.get("code_challenge")).toBe(challenge);
    expect(t.p.consumeState(url.searchParams.get("state") ?? "")).toBe(true);
    expect(url.href).not.toContain("shh");
  });

  it("refuses to start without the Commander's own client", async () => {
    await expect(startGoogleSignIn(provider().p)).rejects.toThrow(/client ID/);
  });

  it("exchanges the code with the verifier and secret, and stores when the token expires", async () => {
    const t = provider();
    await t.p.setOwnClient({ clientId: "cid", clientSecret: "shh" });
    await startGoogleSignIn(t.p);
    const verifier = t.p.codeVerifier();
    const g = fakeGoogle({}, () => ({
      json: { access_token: "at", refresh_token: "rt", expires_in: 3600, token_type: "Bearer" },
    }));
    await finishGoogleSignIn(t.p, "the-code", g.fetch, () => NOW);
    const form = new URLSearchParams(g.seen[0]?.body);
    expect(Object.fromEntries(form)).toEqual({
      grant_type: "authorization_code",
      code: "the-code",
      code_verifier: verifier,
      redirect_uri: REDIRECT,
      client_id: "cid",
      client_secret: "shh",
    });
    expect(await t.p.tokens()).toMatchObject({
      access_token: "at",
      refresh_token: "rt",
      expires_at: NOW + 3_600_000,
    });
    // The verifier is spent.
    expect(t.p.codeVerifier()).toBe("");
  });

  it("reports Google's refusal by its error code only", async () => {
    const t = provider();
    await t.p.setOwnClient({ clientId: "cid" });
    await startGoogleSignIn(t.p);
    const g = fakeGoogle({}, () => ({
      status: 400,
      json: { error: "invalid_grant", error_description: "secret detail" },
    }));
    await expect(finishGoogleSignIn(t.p, "c", g.fetch)).rejects.toThrow(
      "Google refused the sign-in (invalid_grant)",
    );
    expect(await t.p.hasTokens()).toBe(false);
  });
});

describe("googleAccessToken", () => {
  const signedIn = async (tokens: Record<string, unknown>) => {
    const t = provider();
    await t.p.setOwnClient({ clientId: "cid", clientSecret: "shh" });
    await t.p.saveTokens({ token_type: "Bearer", access_token: "old", ...tokens });
    return t;
  };

  it("uses the stored token while it has more than a minute left", async () => {
    const t = await signedIn({ refresh_token: "rt", expires_at: NOW + 120_000 });
    const g = fakeGoogle();
    expect(await googleAccessToken(t.p, g.fetch, { now: () => NOW })).toBe("old");
    expect(g.seen).toEqual([]);
  });

  it("renews a token about to expire, keeping the refresh token Google does not resend", async () => {
    const t = await signedIn({ refresh_token: "rt", expires_at: NOW + 30_000 });
    const g = fakeGoogle();
    expect(await googleAccessToken(t.p, g.fetch, { now: () => NOW })).toBe("fresh");
    expect(Object.fromEntries(new URLSearchParams(g.seen[0]?.body))).toEqual({
      grant_type: "refresh_token",
      refresh_token: "rt",
      client_id: "cid",
      client_secret: "shh",
    });
    expect(await t.p.tokens()).toMatchObject({
      access_token: "fresh",
      refresh_token: "rt",
      expires_at: NOW + 3_599_000,
    });
  });

  it("renews on demand after Gmail refused a token that looked current", async () => {
    const t = await signedIn({ refresh_token: "rt", expires_at: NOW + 3_000_000 });
    const g = fakeGoogle();
    expect(await googleAccessToken(t.p, g.fetch, { force: true, now: () => NOW })).toBe("fresh");
  });

  it("drops a sign-in Google refuses to renew (revoked, or Testing's seven days are up)", async () => {
    const t = await signedIn({ refresh_token: "rt", expires_at: NOW - 1 });
    const g = fakeGoogle({}, () => ({ status: 400, json: { error: "invalid_grant" } }));
    await expect(googleAccessToken(t.p, g.fetch, { now: () => NOW })).rejects.toBeInstanceOf(
      SignInRequiredError,
    );
    expect(await t.p.hasTokens()).toBe(false);
  });

  it("keeps the sign-in when Google refuses the client rather than the grant", async () => {
    const t = await signedIn({ refresh_token: "rt", expires_at: NOW - 1 });
    const g = fakeGoogle({}, () => ({ status: 401, json: { error: "invalid_client" } }));
    const err = await googleAccessToken(t.p, g.fetch, { now: () => NOW }).catch((e) => e);
    expect(err).not.toBeInstanceOf(SignInRequiredError);
    expect(String(err)).toMatch(/invalid_client/);
    expect(await t.p.hasTokens()).toBe(true);
  });

  it("leaves a sign-in that replaced the refused grant meanwhile", async () => {
    const t = await signedIn({ refresh_token: "rt", expires_at: NOW - 1 });
    // While the refresh is in flight, a new sign-in stores another grant.
    const g = fakeGoogle({}, () => ({ status: 400, json: { error: "invalid_grant" } }));
    const racing = (async (input: string | URL | Request, init?: RequestInit) => {
      await t.p.saveTokens({ token_type: "Bearer", access_token: "new", refresh_token: "rt2" });
      return g.fetch(input, init);
    }) as typeof fetch;
    await expect(googleAccessToken(t.p, racing, { now: () => NOW })).rejects.toBeInstanceOf(
      SignInRequiredError,
    );
    expect(await t.p.tokens()).toMatchObject({ refresh_token: "rt2" });
  });

  it("keeps the sign-in through a passing failure at Google", async () => {
    const t = await signedIn({ refresh_token: "rt", expires_at: NOW - 1 });
    const g = fakeGoogle({}, () => ({ status: 503, json: {} }));
    await expect(googleAccessToken(t.p, g.fetch, { now: () => NOW })).rejects.toThrow(
      /could not renew/,
    );
    expect(await t.p.hasTokens()).toBe(true);
  });

  it("asks for a sign-in when there is none, or no way to renew it", async () => {
    await expect(googleAccessToken(provider().p, fakeGoogle().fetch)).rejects.toBeInstanceOf(
      SignInRequiredError,
    );
    const t = await signedIn({ expires_at: NOW - 1 });
    await expect(
      googleAccessToken(t.p, fakeGoogle().fetch, { now: () => NOW }),
    ).rejects.toBeInstanceOf(SignInRequiredError);
    expect(await t.p.hasTokens()).toBe(false);
  });
});

/** Gmail's metadata thread for a search result, and its full form for reading. */
const header = (name: string, value: string) => ({ name, value });
const thread = (id: string, subject: string) => ({
  id,
  messages: [
    {
      id: `${id}-1`,
      labelIds: ["INBOX", "UNREAD"],
      snippet: "Can we meet?",
      payload: {
        mimeType: "text/plain",
        headers: [
          header("Subject", subject),
          header("From", "Ada <ada@example.test>"),
          header("Date", "Tue, 17 Nov 2026 09:00:00 +0000"),
          header("Message-ID", `<${id}-1@example.test>`),
          header("References", "<root@example.test>"),
        ],
        body: { data: toBase64Url(new TextEncoder().encode("Can we meet on Friday?")) },
      },
    },
  ],
});

const api = (routes: Parameters<typeof fakeGoogle>[0]) => {
  const g = fakeGoogle(routes);
  let forced = 0;
  const gmail = new GmailApi({
    fetch: g.fetch,
    token: async (o) => {
      if (o?.force) forced++;
      return o?.force ? "renewed" : "current";
    },
  });
  return { gmail, seen: g.seen, forced: () => forced };
};

describe("GmailApi", () => {
  it("searches with Gmail's syntax and summarizes each thread from its metadata", async () => {
    const t = api({
      "GET threads": () => ({
        json: { threads: [{ id: "t1" }, { id: "t2" }], nextPageToken: "p2" },
      }),
      "GET threads/t1": () => ({ json: thread("t1", "Friday") }),
      "GET threads/t2": () => ({ json: thread("t2", "Lunch") }),
    });
    const found = await t.gmail.searchThreads({ query: "is:unread", maxResults: 50 });
    expect(found.nextPageToken).toBe("p2");
    expect(found.threads.map((x) => [x.id, x.subject, x.unread])).toEqual([
      ["t1", "Friday", true],
      ["t2", "Lunch", true],
    ]);
    const list = t.seen[0]?.url;
    expect(list?.searchParams.get("q")).toBe("is:unread");
    expect(list?.searchParams.get("maxResults")).toBe("20");
    expect(t.seen[1]?.url.searchParams.get("format")).toBe("metadata");
    expect(t.seen[1]?.url.searchParams.getAll("metadataHeaders")).toEqual([
      "Subject",
      "From",
      "Date",
    ]);
    expect(t.seen.every((s) => s.auth === "Bearer current")).toBe(true);
  });

  it("reads a whole thread as text", async () => {
    const t = api({ "GET threads/t1": () => ({ json: thread("t1", "Friday") }) });
    const read = await t.gmail.getThread("t1");
    expect(read.messages[0]).toMatchObject({ subject: "Friday", body: "Can we meet on Friday?" });
    expect(t.seen[0]?.url.searchParams.get("format")).toBe("full");
  });

  it("loads a text body Gmail sent as an attachment id, and never a real attachment", async () => {
    const t = api({
      "GET threads/t9": () => ({
        json: {
          id: "t9",
          messages: [
            {
              id: "m1",
              payload: {
                mimeType: "multipart/mixed",
                parts: [
                  { mimeType: "text/plain", body: { attachmentId: "big", size: 900_000 } },
                  { mimeType: "image/png", body: { attachmentId: "img" } },
                  { mimeType: "text/plain", filename: "a.txt", body: { attachmentId: "file" } },
                ],
              },
            },
          ],
        },
      }),
      "GET messages/m1/attachments/big": () => ({
        json: { data: toBase64Url(new TextEncoder().encode("The long body.")) },
      }),
    });
    const read = await t.gmail.getThread("t9");
    expect(read.messages[0]?.body).toBe("The long body.");
    expect(read.messages[0]?.attachments).toEqual(["a.txt"]);
    expect(t.seen.map((s) => s.url.pathname.split("/users/me/")[1])).toEqual([
      "threads/t9",
      "messages/m1/attachments/big",
    ]);
  });

  it("drafts a reply inside the thread, with its subject and threading headers; nothing is sent", async () => {
    let posted: { message: { raw: string; threadId?: string } } | undefined;
    const t = api({
      "GET threads/t1": () => ({ json: thread("t1", "Friday") }),
      "POST drafts": (req) => {
        posted = JSON.parse(req.body ?? "{}");
        return { json: { id: "d1", message: { id: "m9", threadId: "t1" } } };
      },
    });
    const draft = await t.gmail.createDraft({
      to: ["ada@example.test"],
      body: "Friday works.",
      threadId: "t1",
    });
    expect(draft).toEqual({ draftId: "d1", messageId: "m9", threadId: "t1" });
    expect(posted?.message.threadId).toBe("t1");
    const raw = new TextDecoder().decode(fromBase64(posted?.message.raw ?? ""));
    expect(raw).toContain("Subject: Re: Friday\r\n");
    expect(raw).toContain("In-Reply-To: <t1-1@example.test>\r\n");
    expect(raw).toContain("References: <root@example.test> <t1-1@example.test>\r\n");
    expect(t.seen.map((s) => `${s.method} ${s.url.pathname}`)).not.toContainEqual(
      expect.stringContaining("send"),
    );
  });

  it("needs a subject for a new draft", async () => {
    const t = api({});
    await expect(t.gmail.createDraft({ to: ["a@x.test"], body: "hi" })).rejects.toThrow(/subject/);
  });

  it("changes labels on a thread and moves one to the trash", async () => {
    let body: unknown;
    const t = api({
      "POST threads/t1/modify": (req) => {
        body = JSON.parse(req.body ?? "{}");
        return { json: { id: "t1", messages: [{ id: "m", labelIds: ["STARRED"] }] } };
      },
      "POST threads/t1/trash": () => ({ json: { id: "t1" } }),
    });
    expect(
      await t.gmail.modifyThreadLabels({ threadId: "t1", add: ["STARRED"], remove: ["INBOX"] }),
    ).toEqual({ id: "t1", labels: ["STARRED"] });
    expect(body).toEqual({ addLabelIds: ["STARRED"], removeLabelIds: ["INBOX"] });
    expect(await t.gmail.trashThread("t1")).toEqual({ id: "t1", trashed: true });
  });

  it("lists labels with their ids", async () => {
    const t = api({
      "GET labels": () => ({
        json: { labels: [{ id: "INBOX", name: "INBOX", type: "system", color: {} }] },
      }),
    });
    expect(await t.gmail.listLabels()).toEqual([{ id: "INBOX", name: "INBOX", type: "system" }]);
  });

  it("retries once with a renewed token when Gmail refuses one, then asks for a sign-in", async () => {
    let calls = 0;
    const t = api({
      "GET labels": () => (++calls === 1 ? { status: 401, json: {} } : { json: { labels: [] } }),
    });
    expect(await t.gmail.listLabels()).toEqual([]);
    expect(t.forced()).toBe(1);
    expect(t.seen.map((s) => s.auth)).toEqual(["Bearer current", "Bearer renewed"]);

    const refused = api({ "GET labels": () => ({ status: 401, json: {} }) });
    await expect(refused.gmail.listLabels()).rejects.toBeInstanceOf(SignInRequiredError);
  });

  it("passes Gmail's own error message on, and keeps ids out of the path's structure", async () => {
    const t = api({
      "GET threads/a%2F..%2Fb": () => ({ status: 404, json: { error: { message: "Not Found" } } }),
    });
    await expect(t.gmail.getThread("a/../b")).rejects.toThrow("Gmail: Not Found");
  });
});

describe("the Gmail service as a connector", () => {
  const setup = (
    routes: Parameters<typeof fakeGoogle>[0] = {},
    token?: Parameters<typeof fakeGoogle>[1],
  ) => {
    const home = join(mkdtempSync(join(tmpdir(), "ow-gmail-")), "home");
    cpSync(fixture, home, { recursive: true });
    const path = join(home, "station.json");
    const station = JSON.parse(readFileSync(path, "utf8"));
    station.connectors.push(GMAIL_PRESET);
    writeFileSync(path, JSON.stringify(station));
    const secrets = new MemorySecretStore();
    const events = new EventStore(openDatabase(":memory:"));
    const g = fakeGoogle(routes, token);
    const manager = new ConnectorManager({
      home,
      events,
      secrets,
      redirectUrl: (id) => `http://127.0.0.1:4317/oauth/callback/${id}`,
      fetch: g.fetch,
      reconnect: { baseMs: 1, maxMs: 5 },
    });
    const view = () => manager.views().find((v) => v.id === "gmail");
    return { manager, secrets, view, seen: g.seen };
  };
  const signal = () => new AbortController().signal;

  it("needs the Commander's own client, then signs in with Google before it connects", async () => {
    const t = setup({ "GET labels": () => ({ json: { labels: [] } }) });
    await t.manager.refresh();
    expect(t.view()).toMatchObject({
      service: "gmail",
      status: "disconnected",
      ownClient: { set: false, redirectUrl: REDIRECT },
    });
    expect(t.view()?.url).toBeUndefined();
    expect((await t.manager.connect("gmail")).status).toBe("error");

    await t.manager.setOwnClient("gmail", { clientId: "cid", clientSecret: "shh" });
    const asked = await t.manager.connect("gmail");
    expect(asked.status).toBe("needs_auth");
    const url = new URL(asked.authorizationUrl ?? "");
    expect(url.hostname).toBe("accounts.google.com");
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/gmail.modify");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(t.view()?.authorizationUrl).toBe(url.href);

    const state = url.searchParams.get("state") ?? "";
    expect(await t.manager.finishAuth("gmail", "the-code", state)).toEqual({ status: "connected" });
    expect(t.view()?.tools.map((x) => [x.name, x.class])).toEqual([
      ["search_threads", "read"],
      ["get_thread", "read"],
      ["list_labels", "read"],
      ["create_draft", "write"],
      ["modify_thread_labels", "write"],
      ["trash_thread", "write"],
    ]);
    expect(await t.secrets.get(key("tokens"))).toContain("fresh");

    // A tool call goes to Gmail with the stored token and comes back as text for the model.
    const out = await t.manager.call("gmail", "list_labels", {}, signal());
    expect(out).toBe("[]");
    expect(t.seen.at(-1)?.auth).toBe("Bearer fresh");
  });

  it("asks the Commander to sign in again when Google refuses to renew the sign-in", async () => {
    const t = setup({ "GET labels": () => ({ status: 401, json: {} }) }, (form) =>
      form.get("grant_type") === "refresh_token"
        ? { status: 400, json: { error: "invalid_grant" } }
        : { json: { access_token: "at", refresh_token: "rt", expires_in: 3600 } },
    );
    await t.manager.refresh();
    await t.manager.setOwnClient("gmail", { clientId: "cid" });
    const asked = await t.manager.connect("gmail");
    const state = new URL(asked.authorizationUrl ?? "").searchParams.get("state") ?? "";
    await t.manager.finishAuth("gmail", "c", state);
    expect(t.view()?.status).toBe("connected");

    await expect(t.manager.call("gmail", "list_labels", {}, signal())).rejects.toThrow(
      /sign in again/,
    );
    expect(t.view()?.status).toBe("needs_auth");
    expect(t.view()?.authorizationUrl).toContain("accounts.google.com");
    expect(await t.secrets.get(key("tokens"))).toBeUndefined();
  });

  it("reports a tool's own failure without dropping the sign-in", async () => {
    const t = setup({
      "GET threads/missing": () => ({ status: 404, json: { error: { message: "Not Found" } } }),
    });
    await t.manager.refresh();
    await t.manager.setOwnClient("gmail", { clientId: "cid" });
    const asked = await t.manager.connect("gmail");
    const state = new URL(asked.authorizationUrl ?? "").searchParams.get("state") ?? "";
    await t.manager.finishAuth("gmail", "c", state);
    await expect(
      t.manager.call("gmail", "get_thread", { threadId: "missing" }, signal()),
    ).rejects.toThrow("Gmail: Not Found");
    expect(t.view()?.status).toBe("connected");
  });
});

describe("migrateLegacyGmailConnector", () => {
  const MCP = "https://gmailmcp.googleapis.com/mcp/v1";
  const station = (gmail?: unknown) => {
    const home = join(mkdtempSync(join(tmpdir(), "ow-gmail-mig-")), "home");
    cpSync(fixture, home, { recursive: true });
    const path = join(home, "station.json");
    const s = JSON.parse(readFileSync(path, "utf8"));
    if (gmail) s.connectors.push(gmail);
    writeFileSync(path, JSON.stringify(s));
    return { home, read: () => JSON.parse(readFileSync(path, "utf8")) };
  };

  it("moves a Gmail MCP connector onto the Gmail service, carrying the OAuth app over", async () => {
    const s = station({ id: "gmail", name: "Gmail", transport: { type: "http", url: MCP } });
    const secrets = new MemorySecretStore();
    await secrets.set(key("own", MCP), JSON.stringify({ clientId: "cid" }));
    await secrets.set(key("tokens", MCP), JSON.stringify({ access_token: "mcp" }));
    await secrets.set(key("client", MCP), "{}");

    expect(await migrateLegacyGmailConnector({ home: s.home, secrets })).toBe(true);
    const gmail = s.read().connectors.find((c: { id: string }) => c.id === "gmail");
    expect(gmail).toEqual(GMAIL_PRESET);
    expect(await secrets.get(key("own"))).toBe(JSON.stringify({ clientId: "cid" }));
    expect(await secrets.get(key("tokens"))).toBeUndefined();
    for (const kind of ["own", "tokens", "client"] as const) {
      expect(await secrets.get(key(kind, MCP))).toBeUndefined();
    }
    // Once only.
    expect(await migrateLegacyGmailConnector({ home: s.home, secrets })).toBe(false);
  });

  it("finishes on a later start a keychain cleanup that failed, under the exact old URL", async () => {
    // Spelled otherwise than usual: its sign-in is keyed by this spelling, not the usual one.
    const SPELLED = "https://gmailmcp.googleapis.com:443/mcp/v1/";
    const s = station({ id: "gmail", name: "Gmail", transport: { type: "http", url: SPELLED } });
    const store = new MemorySecretStore();
    await store.set(key("own", SPELLED), JSON.stringify({ clientId: "cid" }));
    await store.set(key("tokens", SPELLED), JSON.stringify({ access_token: "mcp" }));
    // The keychain refuses deletes on the first start.
    let failing = true;
    const flaky = {
      get: (n: string) => store.get(n),
      set: (n: string, v: string) => store.set(n, v),
      delete: async (n: string) => {
        if (failing) throw new Error("keychain locked");
        await store.delete(n);
      },
    };
    await expect(migrateLegacyGmailConnector({ home: s.home, secrets: flaky })).rejects.toThrow(
      /locked/,
    );
    // station.json moved, recording the exact old URL; the OAuth app was copied before the failure.
    const gmail = () => s.read().connectors.find((c: { id: string }) => c.id === "gmail");
    expect(gmail()).toEqual({ ...GMAIL_PRESET, migratedFrom: SPELLED });
    expect(await store.get(key("own"))).toBe(JSON.stringify({ clientId: "cid" }));

    failing = false;
    expect(await migrateLegacyGmailConnector({ home: s.home, secrets: flaky })).toBe(false);
    for (const kind of ["own", "tokens", "client"] as const) {
      expect(await store.get(key(kind, SPELLED))).toBeUndefined();
    }
    expect(await store.get(key("own"))).toBe(JSON.stringify({ clientId: "cid" }));
    // Done: the record goes.
    expect(gmail()).toEqual(GMAIL_PRESET);
  });

  it("cleans a station moved before the record existed under the usual URL", async () => {
    const s = station(GMAIL_PRESET);
    const secrets = new MemorySecretStore();
    await secrets.set(key("tokens", MCP), JSON.stringify({ access_token: "mcp" }));
    expect(await migrateLegacyGmailConnector({ home: s.home, secrets })).toBe(false);
    expect(await secrets.get(key("tokens", MCP))).toBeUndefined();
  });

  it("leaves a station without one untouched", async () => {
    const s = station();
    const before = s.read();
    expect(
      await migrateLegacyGmailConnector({ home: s.home, secrets: new MemorySecretStore() }),
    ).toBe(false);
    expect(s.read()).toEqual(before);
  });
});
