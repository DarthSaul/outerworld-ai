import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadStationDir } from "./station-dir.js";

/** fixtures/demo-station is the one v1 station every dev run and screenshot uses. Keep it valid. */
const fixture = join(import.meta.dirname, "..", "..", "..", "..", "fixtures", "demo-station");

describe("fixtures/demo-station", () => {
  it("loads with no issues: one overseer and a crew member, all four documents present", async () => {
    const loaded = await loadStationDir(fixture);
    expect(loaded.issues).toEqual([]);
    expect(loaded.station?.name).toBe("Demo Station");
    expect(loaded.agents.map((a) => [a.id, a.config.role])).toEqual([
      ["quill", "crew"],
      ["vesper", "overseer"],
    ]);
    for (const agent of loaded.agents) {
      for (const text of Object.values(agent.documents)) expect(text.length).toBeGreaterThan(0);
    }
  });
});
