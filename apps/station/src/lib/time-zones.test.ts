import { describe, expect, it } from "vitest";
import { zoneGroups, zoneLabel } from "./time-zones.js";

const at = new Date("2026-07-01T12:00:00Z");

describe("time zones", () => {
  it("labels a zone by its place and its offset at that moment", () => {
    expect(zoneLabel("Europe/Stockholm", at)).toBe("Stockholm (GMT+2)");
    expect(zoneLabel("America/Argentina/Buenos_Aires", at)).toBe(
      "Argentina / Buenos Aires (GMT-3)",
    );
    expect(zoneLabel("Asia/Kolkata", at)).toBe("Kolkata (GMT+5:30)");
    expect(zoneLabel("UTC", at)).toBe("UTC");
  });

  it("groups zones by region, with UTC first and an unlisted current zone kept", () => {
    const groups = zoneGroups(at, "US/Eastern");
    expect(groups[0]).toEqual({ region: "UTC", zones: [{ id: "UTC", label: "UTC" }] });
    const europe = groups.find((g) => g.region === "Europe");
    expect(europe?.zones).toContainEqual({ id: "Europe/Stockholm", label: "Stockholm (GMT+2)" });
    expect(groups.flatMap((g) => g.zones).filter((z) => z.id === "US/Eastern")).toHaveLength(1);
    const regions = groups.map((g) => g.region);
    expect(regions).toContain("America");
    expect(regions).toContain("Asia");
  });
});
