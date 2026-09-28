import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { loadFixture } from "../test/fixture.js";
import { StationMap } from "./StationMap.js";

const { station, state } = loadFixture();

describe("StationMap", () => {
  it("renders every team as a group, the overseer core, and every handoff as a path", () => {
    render(<StationMap station={station} state={state} onSelect={() => {}} />);
    expect(screen.getByRole("group", { name: "Project Management" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Strength App" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ultron/ })).toBeInTheDocument();
    expect(document.querySelectorAll("[data-handoff]")).toHaveLength(2);
  });

  it("shows each team's derived health and run state and each agent's state", () => {
    render(<StationMap station={station} state={state} onSelect={() => {}} />);
    expect(screen.getByRole("group", { name: "Strength App" })).toHaveAttribute(
      "data-health",
      "stalled",
    );
    expect(screen.getByRole("group", { name: "Project Management" })).toHaveAttribute(
      "data-run",
      "working",
    );
    expect(screen.getByRole("button", { name: /Builder/ })).toHaveAttribute("data-state", "failed");
    expect(screen.getByRole("button", { name: /Planner/ })).toHaveAttribute(
      "data-state",
      "working",
    );
  });

  it("derives the rig's shoulder and accessory from grants and handoffs", () => {
    render(<StationMap station={station} state={state} onSelect={() => {}} />);
    const builder = screen.getByRole("img", { name: "Builder, failed" });
    const hrefs = Array.from(builder.querySelectorAll("use")).map((u) => u.getAttribute("href"));
    // Builder writes the ledger (pauldron) and its team has repo access and reads an inbound handoff (plate)...
    expect(hrefs).toContain("#ow-shoulder-pauldron");
    // ...but failed shows the exclaim glyph in the accessory slot instead.
    expect(hrefs).toContain("#ow-glyph-exclaim");
  });

  it("marks carrying handoffs with a packet", () => {
    render(<StationMap station={station} state={state} onSelect={() => {}} />);
    expect(
      document.querySelector('[data-handoff="strength-app-to-project-management"]'),
    ).toHaveAttribute("data-state", "carrying");
    expect(document.querySelectorAll("[data-packet]")).toHaveLength(1);
  });

  it("dims unconnected teams and emphasizes connected handoffs when a team is selected", () => {
    render(
      <StationMap
        station={station}
        state={state}
        selection={{ kind: "team", id: "project-management" }}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole("group", { name: "Project Management" })).not.toHaveAttribute(
      "data-dimmed",
    );
    // Strength App is connected by a handoff, so it is not dimmed either; nothing else exists to dim.
    expect(screen.getByRole("group", { name: "Strength App" })).not.toHaveAttribute("data-dimmed");
    expect(
      document.querySelector('[data-handoff="project-management-to-strength-app"]'),
    ).toHaveAttribute("data-state", "emphasis");
  });

  it("dims a team that is not connected to the selected agent's team", () => {
    const lonely = { ...station, handoffs: [] };
    const lonelyState = { ...state, handoffs: {} };
    render(
      <StationMap
        station={lonely}
        state={lonelyState}
        selection={{ kind: "agent", id: "planner" }}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole("group", { name: "Strength App" })).toHaveAttribute(
      "data-dimmed",
      "true",
    );
    expect(screen.getByRole("group", { name: "Project Management" })).not.toHaveAttribute(
      "data-dimmed",
    );
  });

  it("forwards selections from teams, agents, grants, handoffs, and the overseer", async () => {
    const onSelect = vi.fn();
    render(<StationMap station={station} state={state} onSelect={onSelect} />);
    await userEvent.click(
      within(screen.getByRole("group", { name: "Strength App" })).getByRole("button", {
        name: /Strength App/,
      }),
    );
    expect(onSelect).toHaveBeenLastCalledWith({ kind: "team", id: "strength-app" });
    await userEvent.click(screen.getByRole("button", { name: /Scribe/ }));
    expect(onSelect).toHaveBeenLastCalledWith({ kind: "agent", id: "scribe" });
    await userEvent.click(screen.getByRole("button", { name: /Ultron/ }));
    expect(onSelect).toHaveBeenLastCalledWith({ kind: "overseer", id: "overseer" });
    await userEvent.click(
      screen.getByRole("button", { name: "Strength App to Project Management" }),
    );
    expect(onSelect).toHaveBeenLastCalledWith({
      kind: "handoff",
      id: "strength-app-to-project-management",
    });
  });

  it("positions teams from core's layout in the 1000-unit frame", () => {
    render(<StationMap station={station} state={state} onSelect={() => {}} />);
    const frame = document.querySelector("[data-map-frame]");
    expect(frame?.getAttribute("style")).toContain("--ow-map-units: 1000");
    const pm = screen.getByRole("group", { name: "Project Management" }).parentElement;
    expect(pm?.getAttribute("style")).toMatch(/--ow-box-x: \d/);
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <StationMap station={station} state={state} onSelect={() => {}} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
