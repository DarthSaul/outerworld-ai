import { chmodSync, cpSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { callTool, reply, scripted, setup } from "../test/loop.js";
import { loadSkillLibrary } from "./library.js";
import { createSkillViewTool } from "./skill-view.js";

const fixtures = join(import.meta.dirname, "..", "..", "..", "..", "fixtures", "skills");
/** A tool call's context; `skills` is what the run offered at setup (every fixture skill by default). */
const ctx = (
  agentId: string,
  skills: readonly string[] = ["field-notes", "log-dig", "source-check", "tidy-summary"],
) => ({
  agentId,
  sessionId: "s",
  runId: "r",
  depth: 0,
  signal: new AbortController().signal,
  skills,
});

/** Edits one fixture agent's agent.json in a test home. */
const editAgent = (home: string, id: string, change: Record<string, unknown>) => {
  const path = join(home, "agents", id, "agent.json");
  const config = JSON.parse(readFileSync(path, "utf8"));
  writeFileSync(path, JSON.stringify({ ...config, ...change }));
};
const editStation = (home: string, change: Record<string, unknown>) => {
  const path = join(home, "station.json");
  writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, "utf8")), ...change }));
};

describe("loadSkillLibrary", () => {
  it("parses every valid skill and skips bad files with a warning, never throwing", async () => {
    const { skills, issues } = await loadSkillLibrary(fixtures);
    expect(skills.map((s) => s.id)).toEqual([
      "field-notes",
      "log-dig",
      "source-check",
      "tidy-summary",
    ]);
    expect(issues.map((i) => i.path)).toEqual(["malformed.md", "misnamed.md"]);
    expect(issues.every((i) => i.level === "error")).toBe(true);
  });

  it("treats a missing folder as an empty library", async () => {
    const { skills, issues } = await loadSkillLibrary(join(tmpdir(), "ow-no-such-skills"));
    expect(skills).toEqual([]);
    expect(issues[0]?.message).toBe("no skills library");
  });

  it("skips symlinks and oversized files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ow-skills-"));
    cpSync(join(fixtures, "tidy-summary.md"), join(dir, "tidy-summary.md"));
    symlinkSync(join(fixtures, "field-notes.md"), join(dir, "field-notes.md"));
    writeFileSync(join(dir, "huge.md"), "x".repeat(65 * 1024));
    const { skills, issues } = await loadSkillLibrary(dir);
    expect(skills.map((s) => s.id)).toEqual(["tidy-summary"]);
    expect(issues.map((i) => [i.path, i.message])).toEqual([
      ["field-notes.md", "not a regular file; skipped"],
      ["huge.md", "longer than 65536 bytes; skipped"],
    ]);
  });

  it("skips a file it cannot read and keeps loading the rest", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ow-skills-"));
    cpSync(join(fixtures, "field-notes.md"), join(dir, "field-notes.md"));
    cpSync(join(fixtures, "tidy-summary.md"), join(dir, "locked.md"));
    cpSync(join(fixtures, "tidy-summary.md"), join(dir, "tidy-summary.md"));
    chmodSync(join(dir, "locked.md"), 0o000);
    try {
      const { skills, issues } = await loadSkillLibrary(dir);
      expect(skills.map((s) => s.id)).toEqual(["field-notes", "tidy-summary"]);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({ level: "warn", path: "locked.md" });
      expect(issues[0]?.message).toMatch(/^could not read: /);
    } finally {
      chmodSync(join(dir, "locked.md"), 0o644);
    }
  });
});

describe("skill_view", () => {
  it("returns an offered skill's recipe and refuses one that was not offered", async () => {
    const { skills } = await loadSkillLibrary(fixtures);
    const t = setup(scripted([]));
    editAgent(t.home, "quill", { skills: ["tidy-summary"] });
    const view = createSkillViewTool({ home: t.home, skills });
    expect(view.class).toBe("read");

    // Quill's room has files and memory: the default Field Notes is offered, as is its own skill.
    await expect(view.execute({ id: "tidy-summary" }, ctx("quill"))).resolves.toMatchObject({
      id: "tidy-summary",
      name: "Tidy Summary",
      body: expect.stringContaining("five bullets"),
    });
    await expect(view.execute({ id: "field-notes" }, ctx("quill"))).resolves.toMatchObject({
      id: "field-notes",
    });
    // Enabled but needs a shell; not enabled; not in the library.
    for (const id of ["log-dig", "source-check", "ghost"]) {
      await expect(view.execute({ id }, ctx("quill"))).rejects.toThrow(
        /not one of your installed skills \(yours: tidy-summary, field-notes\)/,
      );
    }
    await expect(view.execute({}, ctx("quill"))).rejects.toThrow(/invalid input/);
    await expect(view.execute({ id: "tidy-summary" }, ctx("nobody"))).rejects.toThrow(
      /no station config/,
    );
  });

  it("refuses a skill the Commander turned off since the prompt was built", async () => {
    const { skills } = await loadSkillLibrary(fixtures);
    const t = setup(scripted([]));
    editStation(t.home, { skills: { disabled: ["field-notes"] } });
    const view = createSkillViewTool({ home: t.home, skills });
    await expect(view.execute({ id: "field-notes" }, ctx("quill"))).rejects.toThrow(/yours: none/);
  });

  it("refuses a skill offered now that the calling run was not offered at setup", async () => {
    const { skills } = await loadSkillLibrary(fixtures);
    const t = setup(scripted([]));
    editAgent(t.home, "quill", { skills: ["tidy-summary"] });
    const view = createSkillViewTool({ home: t.home, skills });
    // The run started before tidy-summary was added: only field-notes was in its list.
    await expect(
      view.execute({ id: "tidy-summary" }, ctx("quill", ["field-notes"])),
    ).rejects.toThrow(/yours: field-notes\)/);
    await expect(view.execute({ id: "tidy-summary" }, ctx("quill", []))).rejects.toThrow(
      /yours: none/,
    );
  });
});

describe("skills in the loop", () => {
  it("lists the index, offers skill_view, and runs it for a matching task", async () => {
    const { skills } = await loadSkillLibrary(fixtures);
    const t = setup(
      scripted([callTool("skill_view", { id: "tidy-summary" }), reply("Five bullets.")]),
      { skills },
    );
    editAgent(t.home, "quill", { skills: ["tidy-summary"] });
    t.service.registerTool("skill_view", createSkillViewTool({ home: t.home, skills }));
    const s = t.service.createSession("quill");
    const run = await t.service.settled((await t.service.send(s.id, "Summarise this")).runId);
    expect(run.state).toBe("completed");

    const call = t.model.doStreamCalls[0];
    const system = String(call?.prompt.find((m) => m.role === "system")?.content);
    expect(system).toContain("# Installed skills");
    expect(system).toContain(
      "- Tidy Summary (id: tidy-summary): Summarise a long thread into five plain bullet points.",
    );
    expect(system).not.toContain("Read the whole thread before writing anything.");
    // The test runtime registers no file or memory tools, so Field Notes is held back.
    expect(system).not.toContain("field-notes");
    expect((call?.tools ?? []).map((x) => x.name)).toContain("skill_view");
    const result = t.sessions.messages(s.id).find((m) => m.message.role === "tool")?.message;
    expect(result).toMatchObject({ name: "skill_view", output: { id: "tidy-summary" } });
  });

  it("puts bodies inline when the run has no skill_view to call", async () => {
    const { skills } = await loadSkillLibrary(fixtures);
    const t = setup(scripted([reply("Done.")]), { skills });
    editAgent(t.home, "quill", { skills: ["tidy-summary"] });
    const s = t.service.createSession("quill");
    await t.service.settled((await t.service.send(s.id, "Summarise this")).runId);
    const call = t.model.doStreamCalls[0];
    const system = String(call?.prompt.find((m) => m.role === "system")?.content);
    expect(system).toContain("## Tidy Summary (id: tidy-summary)");
    expect(system).toContain("Read the whole thread before writing anything.");
    expect(system).not.toContain("skill_view");
    expect((call?.tools ?? []).map((x) => x.name)).not.toContain("skill_view");
  });

  it("leaves the prompt and tools as they were when no skill is offered", async () => {
    const { skills } = await loadSkillLibrary(fixtures);
    const withLibrary = setup(scripted([reply("Hi.")]), { skills });
    const without = setup(scripted([reply("Hi.")]));
    for (const t of [withLibrary, without]) {
      const s = t.service.createSession("wren");
      await t.service.settled((await t.service.send(s.id, "Hello")).runId);
    }
    const first = (t: typeof without) => t.model.doStreamCalls[0];
    expect(first(withLibrary)?.prompt[0]).toEqual(first(without)?.prompt[0]);
    expect(first(withLibrary)?.tools).toEqual(first(without)?.tools);
  });
});
