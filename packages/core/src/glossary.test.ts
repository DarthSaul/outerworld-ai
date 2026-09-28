import { describe, expect, it } from "vitest";
import { GLOSSARY_KEYS, glossary, term } from "./glossary.js";

describe("glossary", () => {
  it("has a display string for every key, none empty", () => {
    for (const key of GLOSSARY_KEYS) {
      expect(glossary[key].length, key).toBeGreaterThan(0);
    }
  });

  it("returns the simplified display nouns for the core objects (reconciliation A20)", () => {
    expect(term("team")).toBe("Station");
    expect(term("grant")).toBe("Tool");
    expect(term("handoff")).toBe("Handoff");
    expect(term("agent")).toBe("Agent");
    expect(term("ledger")).toBe("Station Report");
    expect(term("system.report")).toBe("System Report");
    expect(term("run")).toBe("Routine run");
    expect(term("overseer")).toBe("the Overseer");
    expect(term("overseer.role")).toBe("Overseer");
    expect(term("station")).toBe("the Reach");
  });

  it("keeps health and run words plain, never themed", () => {
    expect(term("health.ok")).toBe("healthy");
    expect(term("health.attention")).toBe("needs attention");
    expect(term("health.stalled")).toBe("stalled");
    expect(term("run.idle")).toBe("idle");
    expect(term("run.working")).toBe("working");
    expect(term("run.done")).toBe("done");
    expect(term("run.failed")).toBe("failed");
    expect(term("grant.read")).toBe("read");
    expect(term("grant.write")).toBe("write");
  });

  it("carries the plain word for every themed noun so tooltips can show it", () => {
    expect(term("team.plain")).toBe("team");
    expect(term("grant.plain")).toBe("grant");
    expect(term("handoff.plain")).toBe("handoff");
    expect(term("agent.plain")).toBe("agent");
    expect(term("ledger.plain")).toBe("ledger");
    expect(term("run.plain")).toBe("run");
    expect(term("overseer.plain")).toBe("overseer");
  });

  it("never uses a franchise placeholder name", () => {
    const all = Object.values(glossary).join(" ").toLowerCase();
    expect(all).not.toMatch(/ultron/);
  });
});
