import { describe, expect, it } from "vitest";
import { termWith } from "../glossary.js";
import { chatterLines } from "./chatter.js";

const text = (s: Parameters<typeof chatterLines>[0]) =>
  chatterLines(s).map((l) => termWith(l.key, l.vars));

describe("chatterLines", () => {
  it("on a quiet station says only that it is quiet, plus tips", () => {
    expect(text({ live: [], waiting: [], spendUsd: 0 })).toEqual([
      "No missions running. Every crew member is standing by.",
      "Type an order below and I will route it to the right room.",
      "Pick a room, crew member, or hallway on the map to scan it.",
    ]);
  });

  it("reports what is live, who is waiting, what finished, and spend against the cap", () => {
    expect(
      text({
        live: [
          { agent: "Wren", room: "Research", title: "Compare note apps" },
          { agent: "Quill", room: "Operations", title: "Daily briefing" },
        ],
        waiting: ["Quill"],
        lastDone: { agent: "Vesper", title: "Plan the week" },
        spendUsd: 1.5,
        capUsd: 25,
      }).slice(0, 4),
    ).toEqual([
      "2 missions live. Wren is on “Compare note apps” in Research.",
      "Quill is waiting for your decision.",
      "Vesper finished “Plan the week”.",
      "Fuel today: $1.50 of $25.00.",
    ]);
  });

  it("uses the singular for one live mission and leaves out spend with no cap", () => {
    const lines = text({
      live: [{ agent: "Wren", room: "Research", title: "Compare" }],
      waiting: [],
      spendUsd: 3,
    });
    expect(lines[0]).toBe("1 mission live. Wren is on “Compare” in Research.");
    expect(lines.some((l) => l.startsWith("Fuel"))).toBe(false);
  });
});
