import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentView, SkillListItem } from "@darthsaul/outerworld-ai-core";
import { EventStore, loadSkillLibrary, openDatabase } from "@darthsaul/outerworld-ai-runtime";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { testServices } from "./test/services.js";

const TOKEN = "d".repeat(64);
const fixtures = join(import.meta.dirname, "..", "..", "..", "fixtures");

const setup = async () => {
  const home = join(mkdtempSync(join(tmpdir(), "ow-skills-")), "home");
  cpSync(join(fixtures, "demo-station"), home, { recursive: true });
  const { skills } = await loadSkillLibrary(join(fixtures, "skills"));
  const events = new EventStore(openDatabase(":memory:"));
  const app = createApp({
    token: TOKEN,
    allowedOrigins: ["http://127.0.0.1:4317"],
    allowedHosts: ["127.0.0.1:4317"],
    events,
    ...testServices(home, events, undefined, { skills }),
    version: "test",
  });
  const call = (method: string, path: string, body?: unknown) =>
    app.request(`http://127.0.0.1:4317/api${path}`, {
      method,
      headers: {
        authorization: `Bearer ${TOKEN}`,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  return { call, events };
};

describe("skill routes", () => {
  it("GET /skills lists the library with each skill's state and no bodies", async () => {
    const { call } = await setup();
    const res = await call("GET", "/skills");
    expect(res.status).toBe(200);
    const rows = (await res.json()) as SkillListItem[];
    expect(rows.map((r) => [r.category, r.id, r.globallyEnabled, r.offeredTo])).toEqual([
      ["Engineering", "log-dig", true, []],
      ["Research", "source-check", false, []],
      ["Writing", "field-notes", true, ["quill"]],
      ["Writing", "tidy-summary", false, []],
    ]);
    expect(rows[0]?.missing).toEqual(["shell"]);
    expect(JSON.stringify(rows)).not.toContain("## Method");
  });

  it("PUT /skills/:id turns a skill on, off, and back to its default; emits station.updated", async () => {
    const { call, events } = await setup();
    const on = await call("PUT", "/skills/source-check", { enabled: true });
    expect(on.status).toBe(200);
    expect(await on.json()).toMatchObject({
      override: true,
      globallyEnabled: true,
      offeredTo: ["quill", "vesper", "wren"],
    });
    expect(
      await (await call("PUT", "/skills/source-check", { enabled: null })).json(),
    ).toMatchObject({ override: null, globallyEnabled: false });
    expect(events.since(0).filter((e) => e.type === "station.updated")).toHaveLength(2);
  });

  it("refuses an unknown skill with 404 and a bad body with 400", async () => {
    const { call } = await setup();
    expect((await call("PUT", "/skills/ghost", { enabled: true })).status).toBe(404);
    expect((await call("PUT", "/skills/tidy-summary", { enabled: "yes" })).status).toBe(400);
    expect((await call("PUT", "/skills/tidy-summary", {})).status).toBe(400);
  });

  it("PATCH /agents/:id adds skills to one crew member, shown with what it is offered", async () => {
    const { call } = await setup();
    const res = await call("PATCH", "/agents/wren", { skills: ["tidy-summary", "log-dig"] });
    expect(res.status).toBe(200);
    const wren = (await res.json()) as AgentView;
    expect(wren.config.skills).toEqual(["tidy-summary", "log-dig"]);
    expect(wren.skills.offered.map((s) => s.id)).toEqual(["tidy-summary"]);
    expect(wren.skills.unavailable.map((s) => s.id)).toEqual(["log-dig", "field-notes"]);
    expect(wren.tools.map((t) => t.name)).toContain("skill_view");
    expect((await call("PATCH", "/agents/wren", { skills: ["Bad Id"] })).status).toBe(400);
  });
});
