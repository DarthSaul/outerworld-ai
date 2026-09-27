import { describe, expect, it } from "vitest";
import { parseStation } from "./station.js";

/** A minimal valid Station. Tests copy and mutate it (DAMP over DRY). */
const valid = () => ({
  schemaVersion: 1,
  id: "demo",
  name: "Demo",
  teams: [
    {
      id: "alpha",
      name: "Alpha",
      mission: "Do alpha things",
      category: "build",
      emblem: { hue: 230, mark: "spire" },
      scope: { repos: ["example/alpha"] },
      schedule: { kind: "interval", everyMinutes: 360 },
    },
    {
      id: "beta",
      name: "Beta",
      mission: "Do beta things",
      category: "records",
      emblem: { hue: 55, mark: "archive" },
      scope: { repos: [] },
      schedule: { kind: "cron", expression: "0 9 * * 1-5", timezone: "UTC" },
    },
  ],
  grants: [
    { id: "alpha-notion-read", teamId: "alpha", tool: "notion", mode: "read", kind: "connector" },
    { id: "alpha-ledger-write", teamId: "alpha", tool: "ledger", mode: "write", kind: "skill" },
  ],
  agents: [
    {
      id: "one",
      teamId: "alpha",
      persona: {
        name: "One",
        mandate: "Keep things moving",
        tone: "brisk",
        allowlist: ["alpha-notion-read"],
        rig: { tintHue: 200, trimHue: 210, head: "dome", trace: "core" },
      },
    },
  ],
  handoffs: [{ id: "alpha-to-beta", from: "alpha", to: "beta" }],
  overseer: {
    persona: { name: "Meridian", mandate: "Read every ledger", tone: "measured" },
    schedule: { kind: "interval", everyMinutes: 720 },
    outward: { kind: "discord-webhook" },
  },
});

const issueAt = (result: ReturnType<typeof parseStation>, path: string) =>
  result.issues.find((i) => i.path === path);

describe("parseStation", () => {
  it("accepts a valid station and returns it typed", () => {
    const result = parseStation(valid());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.teams[0]?.id).toBe("alpha");
    expect(result.issues).toEqual([]);
  });

  it("keeps unknown fields at every level (additive changes are free)", () => {
    const doc = valid() as Record<string, unknown>;
    doc.future = { anything: true };
    (doc.teams as Record<string, unknown>[])[0]!.extra = "kept";
    const result = parseStation(doc);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.value as Record<string, unknown>).future).toEqual({ anything: true });
    expect((result.value.teams[0] as Record<string, unknown>).extra).toBe("kept");
  });

  it("rejects a document that is not an object", () => {
    expect(parseStation(null).ok).toBe(false);
    expect(parseStation("station").ok).toBe(false);
  });

  it("reports missing required fields with a path", () => {
    const doc = valid();
    (doc.teams[0] as Record<string, unknown>).mission = undefined;
    const result = parseStation(doc);
    expect(result.ok).toBe(false);
    expect(issueAt(result, "teams.0.mission")?.level).toBe("error");
  });

  it("rejects ids that are not lowercase kebab", () => {
    const doc = valid();
    doc.teams[0]!.id = "Alpha Team";
    const result = parseStation(doc);
    expect(result.ok).toBe(false);
    expect(issueAt(result, "teams.0.id")).toBeDefined();
  });

  it("reads a newer schema version best-effort with a warning", () => {
    const doc = valid();
    doc.schemaVersion = 2;
    const result = parseStation(doc);
    expect(result.ok).toBe(true);
    expect(issueAt(result, "schemaVersion")?.level).toBe("warn");
  });

  it("rejects a schema version that is not a positive integer", () => {
    const doc = valid() as Record<string, unknown>;
    doc.schemaVersion = "1";
    expect(parseStation(doc).ok).toBe(false);
    doc.schemaVersion = 0;
    expect(parseStation(doc).ok).toBe(false);
  });

  describe("cross-field rules", () => {
    it("requires every agent, grant, and handoff to reference an existing team", () => {
      const doc = valid();
      doc.agents[0]!.teamId = "nope";
      doc.grants[0]!.teamId = "nope";
      doc.handoffs[0]!.to = "nope";
      const result = parseStation(doc);
      expect(result.ok).toBe(false);
      expect(issueAt(result, "agents.0.teamId")?.message).toMatch(/unknown team/);
      expect(issueAt(result, "grants.0.teamId")?.message).toMatch(/unknown team/);
      expect(issueAt(result, "handoffs.0.to")?.message).toMatch(/unknown team/);
    });

    it("requires an agent's allowlist to be a subset of its team's grants", () => {
      const doc = valid();
      doc.agents[0]!.persona.allowlist = ["alpha-notion-read", "beta-secret"];
      const result = parseStation(doc);
      expect(result.ok).toBe(false);
      expect(issueAt(result, "agents.0.persona.allowlist.1")?.message).toMatch(
        /not a grant of team/,
      );
    });

    it("rejects a handoff from a team to itself", () => {
      const doc = valid();
      doc.handoffs[0]!.to = "alpha";
      const result = parseStation(doc);
      expect(result.ok).toBe(false);
      expect(issueAt(result, "handoffs.0")?.message).toMatch(/itself/);
    });

    it("rejects duplicate handoffs in the same direction but allows the reverse", () => {
      const doc = valid();
      doc.handoffs.push({ id: "again", from: "alpha", to: "beta" });
      doc.handoffs.push({ id: "reverse", from: "beta", to: "alpha" });
      const result = parseStation(doc);
      expect(result.ok).toBe(false);
      expect(issueAt(result, "handoffs.1")?.message).toMatch(/duplicate/);
      expect(issueAt(result, "handoffs.2")).toBeUndefined();
    });

    it("rejects duplicate ids within a collection", () => {
      const doc = valid();
      doc.grants.push({ ...doc.grants[0]! });
      const result = parseStation(doc);
      expect(result.ok).toBe(false);
      expect(issueAt(result, "grants.2.id")?.message).toMatch(/duplicate id/);
    });

    it("reserves the crest head and frame trace for the overseer", () => {
      const doc = valid();
      doc.agents[0]!.persona.rig.head = "crest";
      doc.agents[0]!.persona.rig.trace = "frame";
      const result = parseStation(doc);
      expect(result.ok).toBe(false);
      expect(issueAt(result, "agents.0.persona.rig.head")?.message).toMatch(/reserved/);
      expect(issueAt(result, "agents.0.persona.rig.trace")?.message).toMatch(/reserved/);
    });

    it("enforces the Routines minimum interval of 60 minutes", () => {
      const doc = valid();
      doc.teams[0]!.schedule = { kind: "interval", everyMinutes: 30 };
      const result = parseStation(doc);
      expect(result.ok).toBe(false);
      expect(issueAt(result, "teams.0.schedule.everyMinutes")).toBeDefined();
    });

    it("requires hues within 0..360", () => {
      const doc = valid();
      doc.teams[0]!.emblem.hue = 400;
      const result = parseStation(doc);
      expect(result.ok).toBe(false);
      expect(issueAt(result, "teams.0.emblem.hue")).toBeDefined();
    });
  });
});
