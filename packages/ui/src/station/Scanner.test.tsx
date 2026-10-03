import type { DashboardRun } from "@darthsaul/outerworld-ai-core";
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { demoDashboard } from "../test/dashboard.js";
import { CrewRoster } from "./CrewRoster.js";
import { Scanner } from "./Scanner.js";

const run = (
  id: string,
  agentId: string,
  state: DashboardRun["state"],
  steps = 2,
): DashboardRun => ({
  id,
  agentId,
  sessionId: `s-${id}`,
  state,
  createdAt: `2026-10-01T10:00:0${id}Z`,
  steps,
  title: `Mission ${id}`,
});

const busy = () =>
  demoDashboard({
    activity: {
      quill: { state: "running", runs: 1 },
      wren: { state: "awaiting_consent", runs: 1 },
    },
    runs: [
      run("1", "quill", "running", 4),
      run("2", "wren", "awaiting_consent"),
      run("3", "quill", "completed"),
    ],
  });

describe("CrewRoster", () => {
  it("lists crew but the Overseer, with room and status, and selects one", async () => {
    const onSelectAgent = vi.fn();
    render(<CrewRoster dashboard={busy()} onSelectAgent={onSelectAgent} />);
    expect(screen.getByRole("region", { name: "Crew roster" })).toHaveTextContent("2 + OV");
    const rows = screen.getAllByRole("button");
    expect(rows.map((r) => r.textContent)).toEqual([
      "QUQuill OperationsActive",
      "WRWren ResearchBlocked",
    ]);
    await userEvent.click(rows[1] as HTMLElement);
    expect(onSelectAgent).toHaveBeenCalledWith("wren");
  });
});

describe("Scanner", () => {
  it("scans a room: crew, placed objects, hallways, and its missions", async () => {
    const onSelect = vi.fn();
    render(
      <Scanner
        dashboard={busy()}
        selection={{ type: "room", id: "operations" }}
        onSelect={onSelect}
      />,
    );
    const panel = screen.getByRole("region", { name: "Scanner" });
    expect(panel).toHaveTextContent("Room");
    expect(panel).toHaveTextContent("Keeps projects moving");
    expect(within(panel).getByText("Archive cabinet")).toBeInTheDocument();
    expect(panel).toHaveTextContent("Notion · write");
    expect(panel).toHaveTextContent("Mission 1");
    expect(panel).toHaveTextContent("Step 4");
    expect(panel).not.toHaveTextContent("Mission 2");
    await userEvent.click(screen.getByRole("button", { name: /L-01/ }));
    expect(onSelect).toHaveBeenCalledWith({ type: "lane", id: "operations-to-command" });
    await userEvent.click(screen.getByRole("button", { name: /Mission 3/ }));
    expect(onSelect).toHaveBeenCalledWith({ type: "agent", id: "quill" });
  });

  it("scans the Bridge: the Overseer and the most urgent missions station-wide", () => {
    render(
      <Scanner dashboard={busy()} selection={{ type: "room", id: "command" }} onSelect={vi.fn()} />,
    );
    const panel = screen.getByRole("region", { name: "Scanner" });
    expect(panel).toHaveTextContent("Most urgent missions");
    const titles = [...panel.querySelectorAll("li")]
      .map((li) => li.textContent)
      .filter((t) => t?.startsWith("Mission"));
    expect(titles.map((t) => t?.slice(0, 9))).toEqual(["Mission 2", "Mission 1", "Mission 3"]);
  });

  it("scans a crew member: task log, room grants, stop run, and back to the room", async () => {
    const onStopRun = vi.fn();
    const onSelect = vi.fn();
    render(
      <Scanner
        dashboard={busy()}
        selection={{ type: "agent", id: "quill" }}
        onSelect={onSelect}
        onStopRun={onStopRun}
      />,
    );
    expect(screen.getByRole("region", { name: "Scanner" })).toHaveTextContent(
      "Crew member · Operations",
    );
    await userEvent.click(screen.getByRole("button", { name: "Stop run" }));
    expect(onStopRun).toHaveBeenCalledWith("quill");
    await userEvent.click(screen.getByRole("button", { name: "◀ Operations" }));
    expect(onSelect).toHaveBeenCalledWith({ type: "room", id: "operations" });
  });

  it("disables stop run for an idle crew member", () => {
    render(
      <Scanner
        dashboard={demoDashboard()}
        selection={{ type: "agent", id: "wren" }}
        onSelect={vi.fn()}
        onStopRun={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Stop run" })).toBeDisabled();
  });

  it("scans a hallway: its ends, what it carries, traffic, and demolish", async () => {
    const onDemolish = vi.fn();
    const onSelect = vi.fn();
    render(
      <Scanner
        dashboard={demoDashboard({ dispatches: [{ workerAgentId: "wren" }] })}
        selection={{ type: "lane", id: "research-to-command" }}
        onSelect={onSelect}
        onDemolish={onDemolish}
      />,
    );
    const panel = screen.getByRole("region", { name: "Scanner" });
    expect(panel).toHaveTextContent("L-02");
    expect(panel).toHaveTextContent("1 dispatch running");
    await userEvent.click(screen.getByRole("button", { name: "Research" }));
    expect(onSelect).toHaveBeenCalledWith({ type: "room", id: "research" });
    await userEvent.click(screen.getByRole("button", { name: "Demolish" }));
    expect(onDemolish).toHaveBeenCalledWith("research-to-command");
  });

  it("shows nothing for a hallway that no longer exists", () => {
    render(
      <Scanner
        dashboard={demoDashboard()}
        selection={{ type: "lane", id: "gone" }}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole("region", { name: "Scanner" })).toHaveTextContent("Hallway");
  });

  it("has no axe violations in each view", async () => {
    for (const selection of [
      { type: "room", id: "operations" },
      { type: "agent", id: "wren" },
      { type: "lane", id: "operations-to-command" },
    ] as const) {
      const { container, unmount } = render(
        <Scanner
          dashboard={busy()}
          selection={selection}
          onSelect={vi.fn()}
          onStopRun={vi.fn()}
          onDemolish={vi.fn()}
        />,
      );
      expect(await axe(container)).toHaveNoViolations();
      unmount();
    }
  });
});
