import { SCHEMA_VERSION } from "@darthsaul/outerworld-ai-core";
import { describe, expect, it } from "vitest";
import { GENERATOR_SCHEMA_VERSION, sortEmitted } from "./index.js";

describe("generator skeleton", () => {
  it("emits for the core schema version", () => {
    expect(GENERATOR_SCHEMA_VERSION).toBe(SCHEMA_VERSION);
  });

  it("sorts emitted files by path without mutating input", () => {
    const input = [
      { path: "routines/team.prompt.md", contents: "" },
      { path: "CLAUDE.md", contents: "" },
      { path: "agents/a.md", contents: "" },
    ];
    const sorted = sortEmitted(input);
    expect(sorted.map((f) => f.path)).toEqual([
      "CLAUDE.md",
      "agents/a.md",
      "routines/team.prompt.md",
    ]);
    expect(input[0]?.path).toBe("routines/team.prompt.md");
  });

  it("keeps equal paths stable", () => {
    const dup = [
      { path: "x", contents: "1" },
      { path: "x", contents: "2" },
    ];
    expect(sortEmitted(dup).map((f) => f.contents)).toEqual(["1", "2"]);
  });
});
