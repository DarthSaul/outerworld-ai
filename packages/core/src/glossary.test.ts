import { describe, expect, it } from "vitest";
import { GLOSSARY_KEYS, glossary, term } from "./glossary.js";

describe("glossary", () => {
  it("has a display string for every key, none empty", () => {
    for (const key of GLOSSARY_KEYS) {
      expect(glossary[key].length, key).toBeGreaterThan(0);
    }
  });

  it("returns the station runtime vocabulary for the core objects (brief §4)", () => {
    expect(term("room")).toBe("Room");
    expect(term("grant")).toBe("Prop");
    expect(term("lane")).toBe("Hallway");
    expect(term("agent")).toBe("Crew member");
    expect(term("agents")).toBe("Crew");
    expect(term("user")).toBe("Commander");
    expect(term("comms")).toBe("COMMS");
    expect(term("run")).toBe("Run");
    expect(term("overseer")).toBe("the Overseer");
    expect(term("overseer.role")).toBe("Overseer");
    expect(term("station")).toBe("Station");
    expect(term("approvalMode.ask")).toBe("Ask first");
    expect(term("approvalMode.full")).toBe("Full power");
    expect(term("memory.beliefs")).toBe("Stored beliefs");
    expect(term("memory.proposals")).toBe("Awaiting your decision");
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
    expect(term("room.plain")).toBe("team");
    expect(term("grant.plain")).toBe("capability grant");
    expect(term("lane.plain")).toBe("handoff lane");
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
