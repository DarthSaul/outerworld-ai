import { describe, expect, it } from "vitest";
import { type AgentConfig, parseAgentConfig } from "./agent-config.js";

const valid = (): Record<string, unknown> => ({
  schemaVersion: 1,
  name: "Project Manager",
  roomId: "operations",
  role: "crew",
  model: "anthropic/claude-sonnet-5.5",
  approvalMode: "ask",
  connectorGrants: ["notion"],
  schedules: [
    {
      id: "daily-briefing",
      cron: "0 8 * * 1-5",
      timezone: "America/New_York",
      prompt: "Write today's briefing.",
      catchUp: true,
      enabled: false,
    },
  ],
  rig: { tintHue: 230, trimHue: 40, head: "dome", trace: "bar" },
});

const paths = (input: unknown) => parseAgentConfig(input).issues.map((i) => `${i.level} ${i.path}`);

describe("parseAgentConfig", () => {
  it("accepts a full valid agent.json with no issues", () => {
    const r = parseAgentConfig(valid());
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("defaults to crew, Ask first, no grants, no schedules; a schedule defaults to enabled without catch-up", () => {
    const r = parseAgentConfig({
      schemaVersion: 1,
      name: "Scout",
      roomId: "command",
      model: "anthropic/claude-sonnet-5.5",
      schedules: [{ id: "s", cron: "0 9 * * *", timezone: "UTC", prompt: "Go." }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a: AgentConfig = r.value;
    expect(a.role).toBe("crew");
    expect(a.approvalMode).toBe("ask");
    expect(a.connectorGrants).toEqual([]);
    expect(a.schedules[0]).toMatchObject({ enabled: true, catchUp: false });
  });

  it("round-trips through JSON unchanged and keeps unknown fields", () => {
    const r = parseAgentConfig({ ...valid(), later: true });
    if (!r.ok) throw new Error("expected ok");
    const again = parseAgentConfig(JSON.parse(JSON.stringify(r.value)));
    expect(again.ok && again.value).toEqual(r.value);
    expect((r.value as Record<string, unknown>).later).toBe(true);
  });

  it("only knows the overseer and crew roles, and the two approval modes", () => {
    expect(paths({ ...valid(), role: "admin" })).toContain("error role");
    expect(paths({ ...valid(), approvalMode: "yolo" })).toContain("error approvalMode");
    expect(parseAgentConfig({ ...valid(), role: "overseer", approvalMode: "full" }).ok).toBe(true);
  });

  it("requires a model id", () => {
    expect(paths({ ...valid(), model: "" })).toContain("error model");
  });

  it("rejects a duplicate connector grant and a duplicate schedule id", () => {
    const input = valid();
    input.connectorGrants = ["notion", "notion"];
    input.schedules = [
      { id: "s", cron: "0 9 * * *", timezone: "UTC", prompt: "a" },
      { id: "s", cron: "0 10 * * *", timezone: "UTC", prompt: "b" },
    ];
    const p = paths(input);
    expect(p).toContain("error connectorGrants.1");
    expect(p).toContain("error schedules.1.id");
  });

  it("rejects an unknown time zone and a cron without five or six fields", () => {
    const input = valid();
    input.schedules = [
      { id: "a", cron: "0 9 * * *", timezone: "Mars/Olympus", prompt: "x" },
      { id: "b", cron: "every morning", timezone: "UTC", prompt: "x" },
      { id: "c", cron: "0 0 9 * * *", timezone: "UTC", prompt: "x" },
    ];
    const p = paths(input);
    expect(p).toContain("error schedules.0.timezone");
    expect(p).toContain("error schedules.1.cron");
    expect(p).not.toContain("error schedules.2.cron");
  });

  it("lets a schedule leave out its time zone (the machine's zone is used)", () => {
    const input = valid();
    input.schedules = [{ id: "a", cron: "0 9 * * *", prompt: "x" }];
    expect(paths(input)).toEqual([]);
  });

  it("reserves the overseer's rig parts (crest head, frame trace) for the overseer", () => {
    const input = { ...valid(), rig: { tintHue: 1, trimHue: 2, head: "crest", trace: "frame" } };
    const p = paths(input);
    expect(p).toContain("error rig.head");
    expect(p).toContain("error rig.trace");
    expect(parseAgentConfig({ ...input, role: "overseer" }).ok).toBe(true);
  });

  it("never throws on garbage", () => {
    for (const bad of [null, 1, "x", [], { name: 3 }]) expect(parseAgentConfig(bad).ok).toBe(false);
  });
});
