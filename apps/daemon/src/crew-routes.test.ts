import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AgentView, type StationView, SUPPORTED_MODELS } from "@darthsaul/outerworld-ai-core";
import { EventStore, openDatabase } from "@darthsaul/outerworld-ai-runtime";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { testServices } from "./test/services.js";

const TOKEN = "c".repeat(64);
const fixture = join(import.meta.dirname, "..", "..", "..", "fixtures", "demo-station");

const setup = () => {
  const home = join(mkdtempSync(join(tmpdir(), "ow-routes-")), "home");
  cpSync(fixture, home, { recursive: true });
  const events = new EventStore(openDatabase(":memory:"));
  const app = createApp({
    token: TOKEN,
    allowedOrigins: ["http://127.0.0.1:4317"],
    allowedHosts: ["127.0.0.1:4317"],
    events,
    ...testServices(home, events),
    version: "test",
  });
  const call = (
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    app.request(`http://127.0.0.1:4317/api${path}`, {
      method,
      headers: {
        authorization: `Bearer ${TOKEN}`,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...headers,
      },
      ...(body !== undefined
        ? { body: typeof body === "string" ? body : JSON.stringify(body) }
        : {}),
    });
  return { call, events };
};

describe("crew and room routes", () => {
  it("GET /station returns the station, crew, and issues", async () => {
    const res = await setup().call("GET", "/station");
    const view = (await res.json()) as StationView;
    expect(res.status).toBe(200);
    expect(view.station?.name).toBe("Demo Station");
    expect(view.agents.map((a) => a.id)).toEqual(["quill", "vesper"]);
  });

  it("GET /models lists the supported models", async () => {
    expect(await (await setup().call("GET", "/models")).json()).toEqual(SUPPORTED_MODELS);
  });

  it("GET /agents/:id returns documents and effective tools; 404 when unknown", async () => {
    const { call } = setup();
    const agent = (await (await call("GET", "/agents/vesper")).json()) as AgentView;
    expect(agent.tools.map((t) => t.name)).toContain("dispatch");
    expect((await call("GET", "/agents/nobody")).status).toBe(404);
  });

  it("POST /agents creates (201), PATCH updates, DELETE removes (204), each logged", async () => {
    const { call, events } = setup();
    const created = await call("POST", "/agents", { name: "Scout", roomId: "operations" });
    expect(created.status).toBe(201);
    expect(((await created.json()) as AgentView).id).toBe("scout");
    const patched = await call("PATCH", "/agents/scout", { approvalMode: "full" });
    expect(((await patched.json()) as AgentView).config.approvalMode).toBe("full");
    expect((await call("DELETE", "/agents/scout")).status).toBe(204);
    expect(events.since(0).map((e) => e.payload)).toEqual([
      { change: "created" },
      { change: "updated" },
      { change: "deleted" },
    ]);
  });

  it("PUT /agents/:id/documents/:name writes a document; unknown names are 404", async () => {
    const { call } = setup();
    const res = await call("PUT", "/agents/quill/documents/context", { text: "New context.\n" });
    expect(res.status).toBe(204);
    const agent = (await (await call("GET", "/agents/quill")).json()) as AgentView;
    expect(agent.documents.context).toBe("New context.\n");
    expect((await call("PUT", "/agents/quill/documents/secrets", { text: "x" })).status).toBe(404);
  });

  it("answers 400 with issues for an invalid body, and for an unknown field", async () => {
    const { call } = setup();
    const res = await call("POST", "/agents", { name: "", roomId: "operations" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { issues: unknown[] }).issues.length).toBeGreaterThan(0);
    expect((await call("PATCH", "/agents/quill", { aproovalMode: "full" })).status).toBe(400);
    expect((await call("POST", "/agents", "{not json")).status).toBe(400);
  });

  it("answers 409 with issues when the change would break the station", async () => {
    const res = await setup().call("POST", "/agents", {
      name: "Rival",
      roomId: "command",
      role: "overseer",
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(/overseer/);
  });

  it("refuses a body that is not JSON (415), which also blocks simple cross-site form posts", async () => {
    const res = await setup().call("POST", "/rooms", "name=x", { "content-type": "text/plain" });
    expect(res.status).toBe(415);
  });

  it("refuses an oversized body (413)", async () => {
    const res = await setup().call("PUT", "/agents/quill/documents/context", {
      text: "x".repeat(2 * 1024 * 1024),
    });
    expect(res.status).toBe(413);
  });

  it("creates, updates, and deletes rooms", async () => {
    const { call } = setup();
    const created = await call("POST", "/rooms", { name: "Research", props: [{ kind: "web" }] });
    expect(created.status).toBe(201);
    const patched = await call("PATCH", "/rooms/research", { props: [] });
    expect(await patched.json()).toMatchObject({ id: "research", props: [] });
    expect((await call("DELETE", "/rooms/research")).status).toBe(204);
    expect((await call("DELETE", "/rooms/operations")).status).toBe(409);
    expect((await call("PATCH", "/rooms/attic", { name: "x" })).status).toBe(404);
  });

  it("still needs the token", async () => {
    const { call } = setup();
    expect((await call("GET", "/station", undefined, { authorization: "" })).status).toBe(401);
  });
});
