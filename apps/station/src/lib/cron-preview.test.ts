import { describe, expect, it } from "vitest";
import { previewCron } from "./cron-preview.js";

const from = new Date("2026-10-02T12:00:00Z"); // a Friday

describe("previewCron", () => {
  it("says a cron in plain English and lists its next runs in the zone", () => {
    const p = previewCron("0 9 * * 1-5", "Europe/Stockholm", from);
    expect(p).toEqual({
      ok: true,
      description: "At 9:00 AM, Monday through Friday",
      nextRuns: [
        new Date("2026-10-05T07:00:00Z"),
        new Date("2026-10-06T07:00:00Z"),
        new Date("2026-10-07T07:00:00Z"),
      ],
    });
  });

  it("describes common shapes", () => {
    const say = (c: string) => {
      const p = previewCron(c, "UTC", from);
      return p?.ok ? p.description : p?.error;
    };
    expect(say("* * * * *")).toBe("Every minute");
    expect(say("0 */2 * * *")).toBe("On the hour, every 2 hours");
    expect(say("0 17 * * 5")).toBe("At 5:00 PM, only on Friday");
  });

  it("explains a cron it cannot run, and says nothing for an empty field", () => {
    expect(previewCron("61 * * * *", "UTC", from)).toEqual({
      ok: false,
      error: expect.stringMatching(/minute/i),
    });
    expect(previewCron("every morning", "UTC", from)?.ok).toBe(false);
    expect(previewCron("  ", "UTC", from)).toBeUndefined();
  });
});
