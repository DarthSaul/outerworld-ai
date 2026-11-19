import { isRequirement } from "@darthsaul/outerworld-ai-core";
import { describe, expect, it } from "vitest";
import { BUNDLED_SKILLS_DIR, loadSkillLibrary } from "./library.js";

/** The library shipped with the runtime (ADR-0023), ported to this station's tools. */
describe("the bundled skills library", () => {
  it("loads all 74 skills with no issues", async () => {
    const { skills, issues } = await loadSkillLibrary(BUNDLED_SKILLS_DIR);
    expect(issues).toEqual([]);
    expect(skills).toHaveLength(74);
  });

  it("declares only requirements this runtime knows", async () => {
    const { skills } = await loadSkillLibrary(BUNDLED_SKILLS_DIR);
    const unknown = skills.flatMap((s) => s.requires.filter((r) => !isRequirement(r)));
    expect(unknown).toEqual([]);
  });

  it("names only this station's tools: no search tool, no other runtime's tool names", async () => {
    const { skills } = await loadSkillLibrary(BUNDLED_SKILLS_DIR);
    const foreign = /\bweb_search\b|\bfs\.[a-z]+|\bnotebook\.[a-z]+|\bteam\.[a-z]+|starnet/i;
    expect(skills.filter((s) => foreign.test(s.body)).map((s) => s.id)).toEqual([]);
  });

  it("asks for each tool a body names, so a skill is never offered without its tools", async () => {
    const { skills } = await loadSkillLibrary(BUNDLED_SKILLS_DIR);
    const needs: [RegExp, string][] = [
      [/\bweb_fetch\b/, "web"],
      [/\b(write_file|read_file|list_files)\b/, "files"],
      [/\bshell\.exec\b/, "shell"],
      [/\bbrowser\.[a-z_]+/, "browser"],
    ];
    // Recipes that mention files only as an option ("if you can write files").
    const optional = new Set(["plan", "ascii-art", "humanizer"]);
    const missing = skills.flatMap((s) =>
      needs
        .filter(([pattern, req]) => pattern.test(s.body) && !s.requires.includes(req))
        .filter(() => !optional.has(s.id))
        .map(([, req]) => `${s.id} needs ${req}`),
    );
    expect(missing).toEqual([]);
  });

  it("turns five skills on by default, none of which needs a tool", async () => {
    const { skills } = await loadSkillLibrary(BUNDLED_SKILLS_DIR);
    const defaults = skills.filter((s) => s.default);
    expect(defaults.map((s) => s.id)).toEqual([
      "ascii-art",
      "creative-ideation",
      "decision-1-3-1",
      "humanizer",
      "plan",
    ]);
    expect(defaults.flatMap((s) => s.requires)).toEqual([]);
  });
});
