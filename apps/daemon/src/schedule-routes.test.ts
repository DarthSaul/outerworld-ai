import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventStore, openDatabase } from "@darthsaul/outerworld-ai-runtime";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { testServices } from "./test/services.js";

const TOKEN = "d".repeat(64);
const fixture = join(import.meta.dirname, "..", "..", "..", "fixtures", "demo-station");

const setup = () => {
  const home = join(mkdtempSync(join(tmpdir(), "ow-sched-")), "home");
  cpSync(fixture, home, { recursive: true });
  const events = new EventStore(openDatabase(":memory:"));
  const services = testServices(home, events);
  const app = createApp({
    token: TOKEN,
    allowedOrigins: ["http://127.0.0.1:4317"],
    allowedHosts: ["127.0.0.1:4317"],
    events,
    ...services,
    version: "test",
  });
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(`http://127.0.0.1:4317/api${path}`, {
      method,
      headers: {
        authorization: `Bearer ${TOKEN}`,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : undefined };
  };
  return { call, services, events };
};

describe("schedule routes", () => {
  it("lists a crew member's schedules with the zone it runs in and its history", async () => {
    const { call } = setup();
    const list = (await call("GET", "/agents/quill/schedules")).json;
    expect(list).toEqual([
      expect.objectContaining({
        id: "daily-briefing",
        cron: "0 8 * * 1-5",
        timezone: "UTC",
        timezoneSet: true,
        enabled: false,
        history: [],
      }),
    ]);
    expect(list[0].nextRunAt).toBeUndefined();
    expect((await call("GET", "/agents/nobody/schedules")).status).toBe(404);
  });

  it("adds, edits, and removes a schedule; a cron croner refuses is 409 with the reason", async () => {
    const { call } = setup();
    const added = await call("POST", "/agents/vesper/schedules", {
      cron: "0 9 * * *",
      prompt: "Morning check-in.",
    });
    expect(added.status).toBe(201);
    expect(added.json.id).toBe("morning-check-in");
    const [listed] = (await call("GET", "/agents/vesper/schedules")).json;
    expect(listed.nextRunAt).toEqual(expect.any(String));
    expect(listed.timezoneSet).toBe(false);
    const edited = await call("PATCH", "/agents/vesper/schedules/morning-check-in", {
      catchUp: true,
    });
    expect(edited.json.catchUp).toBe(true);
    const bad = await call("PATCH", "/agents/vesper/schedules/morning-check-in", {
      cron: "0 25 * * *",
    });
    expect(bad.status).toBe(409);
    expect(bad.json.issues[0].path).toBe("schedules.0.cron");
    expect(
      (await call("POST", "/agents/vesper/schedules", { cron: "x", prompt: "y" })).status,
    ).toBe(400);
    expect((await call("DELETE", "/agents/vesper/schedules/morning-check-in")).status).toBe(204);
    expect((await call("DELETE", "/agents/vesper/schedules/morning-check-in")).status).toBe(404);
  });

  it("runs a schedule now, into its own Scheduled session", async () => {
    const { call, services } = setup();
    const res = await call("POST", "/agents/quill/schedules/daily-briefing/run");
    expect(res.status).toBe(202);
    expect(res.json).toMatchObject({ outcome: "fired", manual: true });
    const run = await services.runs.settled(res.json.runId);
    expect(run.trigger).toBe("schedule");
    const [view] = (await call("GET", "/agents/quill/schedules")).json;
    expect(view.sessionId).toBe(res.json.sessionId);
    expect(view.history[0]).toMatchObject({ outcome: "fired", runState: "completed" });
  });
});
