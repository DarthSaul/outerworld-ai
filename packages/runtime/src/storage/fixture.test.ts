import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadStationDir } from "./station-dir.js";

/** fixtures/demo-station is the one v1 station every dev run and screenshot uses. Keep it valid. */
const fixture = join(import.meta.dirname, "..", "..", "..", "..", "fixtures", "demo-station");

describe("fixtures/demo-station", () => {
  it("loads with no issues: one overseer and two crew, three rooms, all documents present", async () => {
    const loaded = await loadStationDir(fixture);
    expect(loaded.issues).toEqual([]);
    expect(loaded.station?.name).toBe("Demo Station");
    expect(loaded.agents.map((a) => [a.id, a.config.role, a.config.roomId])).toEqual([
      ["quill", "crew", "operations"],
      ["vesper", "overseer", "command"],
      ["wren", "crew", "research"],
    ]);
    expect(loaded.station?.rooms.map((r) => r.id)).toEqual(["command", "operations", "research"]);
    expect(loaded.station?.lanes.map((l) => l.to)).toEqual(["command", "command"]);
    for (const agent of loaded.agents) {
      for (const text of Object.values(agent.documents)) expect(text.length).toBeGreaterThan(0);
    }
  });
});
