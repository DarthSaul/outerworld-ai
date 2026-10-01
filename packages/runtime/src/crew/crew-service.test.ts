import { cpSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDatabase } from "../storage/database.js";
import { EventStore } from "../storage/event-store.js";
import { stationPaths } from "../storage/station-dir.js";
import { ConflictError, CrewService, NotFoundError } from "./crew-service.js";

const fixture = join(import.meta.dirname, "..", "..", "..", "..", "fixtures", "demo-station");

const setup = (seed = true) => {
  const home = join(mkdtempSync(join(tmpdir(), "ow-crew-")), "home");
  if (seed) cpSync(fixture, home, { recursive: true });
  const events = new EventStore(openDatabase(":memory:"));
  const crew = new CrewService({ home, events });
  const types = () => events.since(0).map((e) => `${e.type}${e.agentId ? `:${e.agentId}` : ""}`);
  return { home, events, crew, types };
};

describe("CrewService: reading", () => {
  it("returns the station and its crew with no issues", async () => {
    const view = await setup().crew.view();
    expect(view.station?.name).toBe("Demo Station");
    expect(view.agents.map((a) => a.id)).toEqual(["quill", "vesper", "wren"]);
    expect(view.issues).toEqual([]);
  });

  it("returns one agent with its documents and effective tools", async () => {
    const agent = await setup().crew.agent("vesper");
    expect(agent?.documents.identity).toMatch(/Vesper/);
    expect(agent?.tools.map((t) => t.name)).toEqual([
      "dispatch",
      "read_session",
      "web_fetch",
      "remember",
    ]);
  });

  it("returns undefined for an unknown agent", async () => {
    expect(await setup().crew.agent("nobody")).toBeUndefined();
  });

  it("sees hand edits made while the daemon runs, because it reads from disk", async () => {
    const { crew, home } = setup();
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(home, "agents", "quill", "purpose.md"), "Edited by hand.\n");
    expect((await crew.agent("quill"))?.documents.purpose).toBe("Edited by hand.\n");
  });
});

describe("CrewService: agents", () => {
  it("creates an agent with an id from its name, defaults, and an identity heading", async () => {
    const { crew, types } = setup();
    const created = await crew.createAgent({ name: "Scout Two", roomId: "operations" });
    expect(created.id).toBe("scout-two");
    expect(created.config).toMatchObject({
      name: "Scout Two",
      roomId: "operations",
      role: "crew",
      model: "anthropic/claude-sonnet-5.5",
      approvalMode: "ask",
      connectorGrants: [],
    });
    expect(created.documents).toEqual({
      identity: "# Scout Two\n",
      purpose: "",
      "standing-orders": "",
      context: "",
    });
    expect(types()).toEqual(["agent.updated:scout-two"]);
  });

  it("gives a second agent with the same name a free id", async () => {
    const { crew } = setup();
    expect((await crew.createAgent({ name: "Quill", roomId: "operations" })).id).toBe("quill-2");
  });

  it("refuses an agent in an unknown room, and a second overseer, writing nothing", async () => {
    const { crew, home, types } = setup();
    await expect(crew.createAgent({ name: "Lost", roomId: "attic" })).rejects.toBeInstanceOf(
      ConflictError,
    );
    await expect(
      crew.createAgent({ name: "Rival", roomId: "command", role: "overseer" }),
    ).rejects.toThrow(/overseer/);
    expect(existsSync(join(home, "agents", "lost"))).toBe(false);
    expect(existsSync(join(home, "agents", "rival"))).toBe(false);
    expect(types()).toEqual([]);
  });

  it("updates config fields and reports the change as an event", async () => {
    const { crew, types } = setup();
    const updated = await crew.updateAgent("quill", { approvalMode: "full", name: "Quill Prime" });
    expect(updated.config).toMatchObject({ approvalMode: "full", name: "Quill Prime" });
    expect(updated.id).toBe("quill");
    expect(types()).toEqual(["agent.updated:quill"]);
  });

  it("ignores fields given as undefined instead of erasing them", async () => {
    const { crew } = setup();
    const updated = await crew.updateAgent("quill", { name: undefined, approvalMode: "full" });
    expect(updated.config.name).toBe("Quill");
  });

  it("recomputes the effective tools after a move to another room", async () => {
    const { crew } = setup();
    const moved = await crew.updateAgent("quill", { roomId: "command" });
    expect(moved.tools.map((t) => t.name)).toEqual(["web_fetch", "remember"]);
  });

  it("refuses a grant for a connector the station does not have", async () => {
    const { crew } = setup();
    await expect(crew.updateAgent("quill", { connectorGrants: ["slack"] })).rejects.toThrow(
      /slack/,
    );
  });

  it("lets the overseer role move: demote the old one, then promote another", async () => {
    const { crew } = setup();
    await expect(crew.updateAgent("quill", { role: "overseer" })).rejects.toThrow(/overseer/);
    await crew.updateAgent("vesper", { role: "crew" });
    expect((await crew.updateAgent("quill", { role: "overseer" })).config.role).toBe("overseer");
  });

  it("does not block edits because of a problem that was already there", async () => {
    const { crew, home } = setup();
    const { writeFileSync } = await import("node:fs");
    const path = join(home, "agents", "quill", "agent.json");
    const config = JSON.parse(readFileSync(path, "utf8"));
    writeFileSync(path, JSON.stringify({ ...config, roomId: "attic" }));
    const updated = await crew.updateAgent("vesper", { approvalMode: "full" });
    expect(updated.config.approvalMode).toBe("full");
  });

  it("writes a document and reports it", async () => {
    const { crew, home, types } = setup();
    await crew.putDocument("quill", "standing-orders", "- Be brief.\n");
    expect(readFileSync(join(home, "agents", "quill", "standing-orders.md"), "utf8")).toBe(
      "- Be brief.\n",
    );
    expect(types()).toEqual(["agent.updated:quill"]);
  });

  it("deletes an agent's directory but keeps its workspace files", async () => {
    const { crew, home, types } = setup();
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(join(home, "workspaces", "quill"), { recursive: true });
    writeFileSync(join(home, "workspaces", "quill", "notes.md"), "keep me");
    await crew.deleteAgent("quill");
    expect(existsSync(join(home, "agents", "quill"))).toBe(false);
    expect(existsSync(join(home, "workspaces", "quill", "notes.md"))).toBe(true);
    expect(types()).toEqual(["agent.updated:quill"]);
    expect(await crew.agent("quill")).toBeUndefined();
  });

  it("reports an unknown agent as not found on update, document, and delete", async () => {
    const { crew } = setup();
    await expect(crew.updateAgent("nobody", { name: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(crew.putDocument("nobody", "identity", "x")).rejects.toBeInstanceOf(NotFoundError);
    await expect(crew.deleteAgent("nobody")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("serializes concurrent creates so ids never collide", async () => {
    const { crew } = setup();
    const made = await Promise.all(
      [1, 2, 3].map(() => crew.createAgent({ name: "Twin", roomId: "operations" })),
    );
    expect(made.map((a) => a.id).sort()).toEqual(["twin", "twin-2", "twin-3"]);
  });
});

describe("CrewService: rooms", () => {
  it("creates a room with an id from its name and reports a station change", async () => {
    const { crew, types } = setup();
    const room = await crew.createRoom({ name: "Research Bay", props: [{ kind: "web" }] });
    expect(room).toEqual({ id: "research-bay", name: "Research Bay", props: [{ kind: "web" }] });
    expect((await crew.view()).station?.rooms.map((r) => r.id)).toContain("research-bay");
    expect(types()).toEqual(["station.updated"]);
  });

  it("places and removes props, which changes the crew's tools", async () => {
    const { crew } = setup();
    await crew.updateRoom("operations", { props: [{ kind: "web" }] });
    expect((await crew.agent("quill"))?.tools.map((t) => t.name)).toEqual(["web_fetch"]);
  });

  it("refuses the same prop twice in a room", async () => {
    const { crew } = setup();
    await expect(
      crew.updateRoom("operations", { props: [{ kind: "web" }, { kind: "web" }] }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses to delete a room that still has crew or hallways, and deletes an empty one", async () => {
    const { crew, types } = setup();
    await expect(crew.deleteRoom("operations")).rejects.toThrow(/crew|hallway/);
    const room = await crew.createRoom({ name: "Spare" });
    await crew.deleteRoom(room.id);
    expect((await crew.view()).station?.rooms.map((r) => r.id)).not.toContain("spare");
    expect(types()).toEqual(["station.updated", "station.updated"]);
  });

  it("reports an unknown room as not found", async () => {
    const { crew } = setup();
    await expect(crew.updateRoom("attic", { name: "x" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(crew.deleteRoom("attic")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("CrewService: connectors", () => {
  it("adds a connector, changes its URL, and reports station changes", async () => {
    const { crew, types } = setup();
    await crew.removeConnectorGrants("notion");
    await crew.removeConnector("notion");
    const added = await crew.addConnector({
      id: "notion",
      name: "Notion",
      transport: { type: "http", url: "https://mcp.notion.example/mcp" },
    });
    expect(added.id).toBe("notion");
    const changed = await crew.updateConnector("notion", { url: "https://mcp.example.test/v2" });
    expect(changed.transport).toEqual({ type: "http", url: "https://mcp.example.test/v2" });
    expect(types().filter((x) => x === "station.updated")).toHaveLength(3);
  });

  it("refuses a duplicate connector, a non-http URL, and removing one that crew still use", async () => {
    const { crew } = setup();
    await expect(
      crew.addConnector({
        id: "notion",
        name: "N",
        transport: { type: "http", url: "https://a.test" },
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(crew.updateConnector("notion", { url: "ftp://x" })).rejects.toBeInstanceOf(
      ConflictError,
    );
    await expect(crew.removeConnector("notion")).rejects.toThrow(/quill/);
    await expect(crew.updateConnector("ghost", { url: "https://a.test" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("removes a connector's grants from every crew member", async () => {
    const { crew } = setup();
    await crew.removeConnectorGrants("notion");
    expect((await crew.agent("quill"))?.config.connectorGrants).toEqual([]);
  });
});

describe("CrewService: before onboarding", () => {
  it("reports that there is no station yet instead of creating one implicitly", async () => {
    const { crew } = setup(false);
    const view = await crew.view();
    expect(view.station).toBeUndefined();
    await expect(crew.createAgent({ name: "A", roomId: "command" })).rejects.toThrow(
      /station\.json/,
    );
    await expect(crew.createRoom({ name: "Command" })).rejects.toThrow(/station\.json/);
    expect(existsSync(stationPaths(join(tmpdir(), "x")).stationJson)).toBe(false);
  });
});

describe("CrewService: schedules", () => {
  it("adds a schedule with an id from its prompt, defaults, and no time zone unless given", async () => {
    const { crew, types } = setup();
    const added = await crew.addSchedule("vesper", {
      cron: "0 9 * * 1-5",
      prompt: "Summarize the week so far for me.",
    });
    expect(added).toEqual({
      id: "summarize-the-week-so",
      cron: "0 9 * * 1-5",
      prompt: "Summarize the week so far for me.",
      catchUp: false,
      enabled: true,
    });
    expect((await crew.agent("vesper"))?.config.schedules).toEqual([added]);
    expect(types()).toEqual(["agent.updated:vesper"]);
    const again = await crew.addSchedule("vesper", {
      cron: "0 9 * * *",
      prompt: "Summarize the week so far again.",
    });
    expect(again.id).toBe("summarize-the-week-so-2");
  });

  it("updates part of a schedule, and a null time zone clears it", async () => {
    const { crew } = setup();
    const updated = await crew.updateSchedule("quill", "daily-briefing", {
      enabled: true,
      timezone: null,
    });
    expect(updated).toEqual({
      id: "daily-briefing",
      cron: "0 8 * * 1-5",
      prompt: "Write today's project briefing from the project hub.",
      catchUp: false,
      enabled: true,
    });
    const zoned = await crew.updateSchedule("quill", "daily-briefing", {
      timezone: "Europe/Stockholm",
    });
    expect(zoned.timezone).toBe("Europe/Stockholm");
  });

  it("refuses a cron croner cannot run, naming the field", async () => {
    const { crew } = setup();
    const error = await crew
      .addSchedule("quill", { cron: "61 * * * *", prompt: "Never." })
      .catch((e) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.issues).toEqual([
      expect.objectContaining({
        path: "schedules.1.cron",
        message: expect.stringMatching(/minute/),
      }),
    ]);
    expect((await crew.agent("quill"))?.config.schedules).toHaveLength(1);
  });

  it("removes a schedule; an unknown one is not found", async () => {
    const { crew } = setup();
    await crew.removeSchedule("quill", "daily-briefing");
    expect((await crew.agent("quill"))?.config.schedules).toEqual([]);
    await expect(crew.removeSchedule("quill", "daily-briefing")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(crew.updateSchedule("nobody", "x", { enabled: false })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("CrewService: budgets", () => {
  it("sets and clears caps in station.json, keeping the ones not given", async () => {
    const { crew, types } = setup();
    expect(await crew.updateBudgets({ perRunUsd: 2, stationDailyUsd: null })).toEqual({
      perRunUsd: 2,
      perAgentDailyUsd: 25,
    });
    expect((await crew.view()).station?.budgets).toEqual({ perRunUsd: 2, perAgentDailyUsd: 25 });
    expect(types()).toEqual(["station.updated"]);
  });
});

describe("CrewService: onboarding and templates", () => {
  it("sets up an empty station with the Command room, default budgets, and the Overseer", async () => {
    const { crew, types, home } = setup(false);
    const overseer = await crew.onboard({ overseerName: "Lodestar", tone: "warm" });
    expect(overseer.id).toBe("lodestar");
    expect(overseer.config).toMatchObject({
      role: "overseer",
      roomId: "command",
      approvalMode: "ask",
      model: "anthropic/claude-sonnet-5.5",
    });
    expect(overseer.documents.identity).toMatch(/You are Lodestar, the Overseer.*warm/s);
    expect(overseer.tools.map((t) => t.name)).toEqual([
      "dispatch",
      "read_session",
      "web_fetch",
      "remember",
    ]);
    const view = await crew.view();
    expect(view.station).toMatchObject({
      name: "My Station",
      rooms: [expect.objectContaining({ id: "command" })],
      budgets: { perRunUsd: 5, perAgentDailyUsd: 25, stationDailyUsd: 50 },
    });
    expect(view.issues).toEqual([]);
    expect(types()).toEqual(["station.updated", "agent.updated:lodestar"]);
    expect(existsSync(join(home, "agents", "lodestar", "context.md"))).toBe(false);
    await expect(crew.onboard({ overseerName: "Again", tone: "calm" })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("adds a Project Manager with Operations, a hallway, Notion, and a disabled briefing", async () => {
    const { crew } = setup(false);
    await crew.onboard({ overseerName: "Lodestar", tone: "calm", stationName: "Home Base" });
    const pm = await crew.addFromTemplate("project-manager", {});
    expect(pm.id).toBe("project-manager");
    expect(pm.config).toMatchObject({
      name: "Project Manager",
      roomId: "operations",
      connectorGrants: ["notion"],
      schedules: [{ id: "daily-briefing", cron: "0 8 * * 1-5", enabled: false, catchUp: false }],
    });
    expect(pm.config.schedules[0]?.timezone).toBeUndefined();
    expect(pm.tools.map((t) => t.name).sort()).toEqual([
      "list_files",
      "read_file",
      "remember",
      "web_fetch",
      "write_file",
    ]);
    const station = (await crew.view()).station;
    expect(station?.name).toBe("Home Base");
    expect(station?.rooms.map((r) => r.id)).toEqual(["command", "operations"]);
    expect(station?.lanes).toEqual([
      { id: "operations-to-command", from: "operations", to: "command" },
    ]);
    expect(station?.connectors.map((c) => c.id)).toEqual(["notion"]);
    const second = await crew.addFromTemplate("project-manager", { name: "Ledger" });
    expect(second.id).toBe("ledger");
    expect((await crew.view()).station?.lanes).toHaveLength(1);
  });

  it("needs a station before a template, and knows only its templates", async () => {
    await expect(setup(false).crew.addFromTemplate("project-manager", {})).rejects.toBeInstanceOf(
      ConflictError,
    );
    await expect(
      setup().crew.addFromTemplate("pilot" as "project-manager", {}),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
