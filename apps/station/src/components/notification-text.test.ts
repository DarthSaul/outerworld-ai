import type { Notification } from "@darthsaul/outerworld-ai-core";
import { describe, expect, it } from "vitest";
import { notificationText } from "./notification-text.js";

const at = "2026-11-22T10:00:00.000Z";
const text = (n: Notification) =>
  notificationText(
    n,
    (id) => id,
    (id) => `${id} connector`,
  );

describe("notificationText", () => {
  it("names each budget scope in words, the per-request cap included (ADR-0024)", () => {
    const budget = (subject: string): Notification => ({
      seq: 1,
      at,
      kind: "budget_blocked",
      level: "alert",
      subject,
      detail: "$15.00 of $15.00",
    });
    expect(text(budget("tree"))).toBe("The per-request budget stopped a run: $15.00 of $15.00.");
    expect(text(budget("agent"))).toBe(
      "The crew member's daily budget stopped a run: $15.00 of $15.00.",
    );
    expect(text({ ...budget("station"), kind: "budget_warning", level: "info" })).toBe(
      "Spend is near the station's daily budget: $15.00 of $15.00.",
    );
  });

  it("still names a connector by its name", () => {
    expect(
      text({ seq: 1, at, kind: "connector", level: "alert", subject: "notion", reason: "error" }),
    ).toContain("notion connector");
  });
});
