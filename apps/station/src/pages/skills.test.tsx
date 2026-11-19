import { term, termWith } from "@darthsaul/outerworld-ai-core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { fakeApi, renderApp } from "../test/fake-daemon.js";

/** The fake library: Tidy Summary (no tools), Source Check (web), Log Dig (shell, default on). */
describe("Abilities › Skills", () => {
  it("lists the library by category, with defaults, needs, and who is offered each", async () => {
    const { container } = renderApp("/system/abilities/skills");
    const section = await screen.findByRole("region", { name: term("abilities.skills") });
    const groups = await within(section).findAllByRole("heading", { level: 3 });
    expect(groups.map((g) => g.textContent)).toEqual(["Engineering", "Research", "Writing"]);

    const logDig = container.querySelector('[data-skill="log-dig"]') as HTMLElement;
    expect(logDig.dataset.enabled).toBe("true");
    expect(within(logDig).getByText(term("skill.default"))).toBeInTheDocument();
    expect(within(logDig).getByText(termWith("skill.needs", { what: "a shell" }))).toBeVisible();
    expect(within(logDig).getByText(term("skill.offeredToNone"))).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("turns a skill on for all crew with an explicit override", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/system/abilities/skills");
    const box = await screen.findByRole("checkbox", {
      name: termWith("skill.onForAllName", { name: "Source Check" }),
    });
    expect(box).not.toBeChecked();
    await user.click(box);
    expect(calls).toContainEqual({
      method: "PUT",
      path: "/skills/source-check",
      body: { enabled: true },
    });
  });

  it("clears the override, not stores a copy of the default, when turned back", async () => {
    const user = userEvent.setup();
    const fake = fakeApi();
    fake.state.station = { ...fake.state.station, skills: { enabled: [], disabled: ["log-dig"] } };
    const { calls, container } = renderApp("/system/abilities/skills", fake);
    const box = await screen.findByRole("checkbox", {
      name: termWith("skill.onForAllName", { name: "Log Dig" }),
    });
    expect(box).not.toBeChecked();
    const row = container.querySelector('[data-skill="log-dig"]') as HTMLElement;
    expect(within(row).getByText(term("skill.changed"))).toBeInTheDocument();
    await user.click(box);
    expect(calls.at(-1)).toEqual({
      method: "PUT",
      path: "/skills/log-dig",
      body: { enabled: null },
    });
  });

  it("is a section of Abilities with its own entry in the section nav", async () => {
    renderApp("/system/abilities/skills");
    const nav = await screen.findByRole("navigation", { name: term("abilities.nav") });
    expect(within(nav).getByRole("link", { name: term("abilities.skills") })).toHaveAttribute(
      "href",
      "/system/abilities/skills",
    );
  });
});

describe("Skills on a crew member's page", () => {
  it("adds a skill to one crew member from Config, saved at once", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/crew/quill?tab=config");
    const panel = await screen.findByRole("region", { name: term("skills") });
    const writing = within(panel).getByText(/^Writing/);
    await user.click(writing);
    await user.click(
      within(panel).getByRole("checkbox", {
        name: termWith("agentSkills.addName", { name: "Tidy Summary" }),
      }),
    );
    expect(calls.at(-1)).toEqual({
      method: "PATCH",
      path: "/agents/quill",
      body: { skills: ["tidy-summary"] },
    });
  });

  it("shows a skill on for all crew as on and fixed, and one it lacks the tools for as held", async () => {
    const fake = fakeApi();
    const quill = fake.state.agents.get("quill");
    if (quill) quill.config = { ...quill.config, skills: ["source-check"] };
    const { container } = renderApp("/crew/quill?tab=config", fake);
    await screen.findByRole("region", { name: term("skills") });
    const logDig = await waitFor(() => {
      const row = container.querySelector('[data-skill-grant="log-dig"]');
      if (!row) throw new Error("no row yet");
      return row as HTMLElement;
    });
    const fixed = within(logDig).getByRole("checkbox");
    expect(fixed).toBeChecked();
    expect(fixed).toBeDisabled();
    expect(within(logDig).getByText(term("agentSkills.forAll"))).toBeInTheDocument();
    // Quill's room has no web prop, so its own Source Check is listed but held back.
    const source = container.querySelector('[data-skill-grant="source-check"]') as HTMLElement;
    expect(within(source).getByText(termWith("skill.needs", { what: "web" }))).toBeInTheDocument();
  });

  it("lists the skills a crew member is offered on Brief, with Read skills among its tools", async () => {
    const fake = fakeApi();
    const vesper = fake.state.agents.get("vesper");
    if (vesper) vesper.config = { ...vesper.config, skills: ["source-check", "tidy-summary"] };
    const { container } = renderApp("/crew/vesper", fake);
    const offered = await waitFor(() => {
      const line = container.querySelector("[data-skills-offered]");
      if (!line) throw new Error("not yet");
      return line;
    });
    expect(offered.textContent).toContain("Source Check, Tidy Summary");
    expect(screen.getByText(term("item.skill_view"))).toBeInTheDocument();
  });
});
