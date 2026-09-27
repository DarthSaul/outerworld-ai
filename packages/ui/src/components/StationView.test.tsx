import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { loadFixture } from "../test/fixture.js";
import { StationView } from "./StationView.js";

const { station, state } = loadFixture();

describe("StationView", () => {
  it("renders the map and the panel side by side on desktop", () => {
    render(<StationView station={station} state={state} desktop />);
    expect(document.querySelector("[data-map-viewport]")).not.toBeNull();
    expect(screen.getByRole("complementary")).toBeInTheDocument();
    expect(document.querySelector("[data-station-view]")).toHaveAttribute("data-layout", "split");
  });

  it("stacks the map and shows the panel as a sheet only when something is selected on mobile", async () => {
    render(<StationView station={station} state={state} desktop={false} />);
    expect(document.querySelector("[data-map-stacked]")).not.toBeNull();
    expect(document.querySelector("[data-station-view]")).toHaveAttribute("data-layout", "stacked");
    expect(screen.queryByRole("complementary")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Scribe/ }));
    expect(screen.getByRole("complementary")).toHaveAttribute("data-sheet", "true");
  });

  it("owns the selection: clicking selects, the panel follows, Escape clears", async () => {
    render(<StationView station={station} state={state} desktop />);
    await userEvent.click(screen.getByRole("button", { name: /Meridian/ }));
    expect(
      within(screen.getByRole("complementary")).getByRole("heading", { level: 2 }),
    ).toHaveTextContent("Meridian");
    await userEvent.keyboard("{Escape}");
    expect(within(screen.getByRole("complementary")).getByRole("status")).toBeInTheDocument();
  });

  it("navigates from the panel: selecting an agent in the team panel updates both", async () => {
    render(<StationView station={station} state={state} desktop />);
    await userEvent.click(
      within(screen.getByRole("group", { name: "Strength App" })).getByRole("button", {
        name: /Strength App/,
      }),
    );
    const panel = screen.getByRole("complementary");
    await userEvent.click(within(panel).getByRole("button", { name: /Builder/ }));
    expect(within(panel).getByRole("heading", { level: 2 })).toHaveTextContent("Builder");
    expect(screen.getByRole("button", { name: /Builder/, pressed: true })).toBeInTheDocument();
  });

  it("accepts a controlled selection", () => {
    render(
      <StationView
        station={station}
        state={state}
        desktop
        selection={{ kind: "team", id: "strength-app" }}
        onSelectionChange={() => {}}
      />,
    );
    expect(
      within(screen.getByRole("complementary")).getByRole("heading", { level: 2 }),
    ).toHaveTextContent("Strength App");
  });

  it("has no axe violations in both layouts", async () => {
    const a = render(<StationView station={station} state={state} desktop />);
    expect(await axe(a.container)).toHaveNoViolations();
    a.unmount();
    const b = render(<StationView station={station} state={state} desktop={false} />);
    expect(await axe(b.container)).toHaveNoViolations();
  });
});
