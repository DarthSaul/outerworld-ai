import type { DashboardRun } from "@darthsaul/outerworld-ai-core";
import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { demoDashboard } from "../test/dashboard.js";
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

describe("Scanner", () => {
  it("picks crew from a list grouped by room, with the crew count and each status", async () => {
    const onSelect = vi.fn();
    const { container } = render(
      <Scanner
        dashboard={busy()}
        selection={{ type: "room", id: "operations" }}
        onSelect={onSelect}
      />,
    );
    const picker = screen.getByRole("button", { name: "Crew · 3 Pick a crew member" });
    await userEvent.click(picker);
    expect(screen.getAllByRole("option").map((o) => o.getAttribute("aria-label"))).toEqual([
      "Vesper (Overseer) · Idle, Command",
      "Quill · Active, Operations",
      "Wren · Blocked, Research",
    ]);
    // Each crew member is drawn as their own character (no frame), the name underlined in their
    // color: the room's, white for the Overseer.
    for (const option of screen.getAllByRole("option")) {
      expect(option.querySelector("[data-look] svg rect")).not.toBeNull();
      expect(option.querySelector("[data-look]")?.className).not.toMatch(/border/);
    }
    const underline = (name: RegExp) =>
      (screen.getByRole("option", { name }).querySelector("[data-crew-color]") as HTMLElement).style
        .textDecorationColor;
    expect(underline(/^Vesper/)).toBe("var(--st-white)");
    expect(underline(/^Quill/)).toMatch(/^var\(--st-/);
    expect(underline(/^Quill/)).not.toBe(underline(/^Wren/));
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.click(screen.getByRole("option", { name: /^Wren/ }));
    expect(onSelect).toHaveBeenCalledWith({ type: "agent", id: "wren" });
  });

  it("toggles Crew (first, the default) and Rooms, showing only that list's picker", async () => {
    const onSelect = vi.fn();
    const { container } = render(
      <Scanner dashboard={busy()} selection={{ type: "agent", id: "quill" }} onSelect={onSelect} />,
    );
    const view = screen.getByRole("group", { name: "Scan" });
    const [crewTab, roomsTab] = within(view).getAllByRole("button");
    expect(crewTab).toHaveTextContent("Crew");
    expect(roomsTab).toHaveTextContent("Rooms");
    expect(crewTab).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^Crew · 3/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Rooms · 3/ })).toBeNull();
    await userEvent.click(roomsTab as HTMLElement);
    expect(roomsTab).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /^Crew · 3/ })).toBeNull();
    const rooms = screen.getByRole("button", { name: "Rooms · 3 Pick a room" });
    await userEvent.click(rooms);
    expect(screen.getAllByRole("option").map((o) => o.getAttribute("aria-label"))).toEqual([
      "Command · HQ · 1 crew",
      "Operations · A-1 · 1 crew",
      "Research · B-1 · 1 crew",
    ]);
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.click(screen.getByRole("option", { name: /^Research/ }));
    expect(onSelect).toHaveBeenCalledWith({ type: "room", id: "research" });
  });

  it("shows the scanned room in the rooms picker, and follows a new selection to its list", async () => {
    const { rerender } = render(
      <Scanner
        dashboard={busy()}
        selection={{ type: "room", id: "operations" }}
        onSelect={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Rooms" }));
    expect(
      screen.getByRole("button", { name: "Rooms · 3 Operations · A-1 · 1 crew" }),
    ).toBeInTheDocument();
    // A crew member picked on the map turns the toggle to Crew, and a room back to Rooms.
    rerender(
      <Scanner dashboard={busy()} selection={{ type: "agent", id: "quill" }} onSelect={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Crew · 3 Quill · Active" })).toBeInTheDocument();
    rerender(
      <Scanner
        dashboard={busy()}
        selection={{ type: "room", id: "research" }}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /^Rooms · 3 Research/ })).toBeInTheDocument();
    // Toggled to Crew by hand, then another room picked on the map: back to Rooms.
    await userEvent.click(screen.getByRole("button", { name: "Crew" }));
    rerender(
      <Scanner dashboard={busy()} selection={{ type: "room", id: "command" }} onSelect={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /^Rooms · 3 Command/ })).toBeInTheDocument();
  });

  it("draws crew as their characters, not lettered badges", () => {
    const dashboard = busy();
    const { container } = render(
      <Scanner
        dashboard={dashboard}
        selection={{ type: "agent", id: "quill" }}
        onSelect={vi.fn()}
      />,
    );
    const quill = dashboard.crew.find((c) => c.id === "quill");
    const figure = container.querySelector("[data-scanner-body] [data-look]");
    expect(figure).toHaveAttribute("data-look", String(quill?.look));
    expect(figure?.querySelector("svg rect")).not.toBeNull();
    expect(figure).not.toHaveTextContent("QU");
  });

  it("shows the scanned crew member in the picker", () => {
    render(
      <Scanner dashboard={busy()} selection={{ type: "agent", id: "quill" }} onSelect={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Crew · 3 Quill · Active" })).toBeInTheDocument();
  });

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
    const panel = screen.getByRole("region", { name: "Scanner" });
    expect(panel.querySelector("[data-scanner-body]")).toBeEmptyDOMElement();
  });

  it("folds to its title strip with a caret, hiding the toggle, picker, and body", async () => {
    function Harness() {
      const [collapsed, setCollapsed] = useState(false);
      return (
        <Scanner
          dashboard={busy()}
          selection={{ type: "room", id: "operations" }}
          onSelect={vi.fn()}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((c) => !c)}
        />
      );
    }
    render(<Harness />);
    const panel = screen.getByRole("region", { name: "Scanner" });
    const caret = within(panel).getByRole("button", { name: "Hide the scanner" });
    expect(caret).toHaveAttribute("aria-expanded", "true");
    // The caret sits beside the title, not in the title's name.
    expect(within(panel).getByRole("heading", { name: "Scanner" }).nextElementSibling).toBe(caret);
    // A drawn caret in a square button, not a text glyph: down while open, right while folded.
    expect(caret).toHaveClass("size-6");
    expect(caret.querySelector("svg")?.getAttribute("class")).not.toMatch(/rotate/);
    await userEvent.click(caret);
    expect(caret.querySelector("svg")?.getAttribute("class")).toMatch(/-rotate-90/);
    expect(caret).toHaveAttribute("aria-expanded", "false");
    expect(caret).toHaveAccessibleName("Show the scanner");
    expect(within(panel).queryByRole("group", { name: "Scan" })).toBeNull();
    expect(within(panel).queryByRole("button", { name: /^Crew · 3/ })).toBeNull();
    expect(panel.querySelector("[data-scanner-body]")).not.toBeVisible();
    await userEvent.click(caret);
    expect(within(panel).getByRole("group", { name: "Scan" })).toBeInTheDocument();
    expect(panel.querySelector("[data-scanner-body]")).toBeVisible();
  });

  it("puts the Crew / Rooms toggle in the title strip, beside SCANNER", () => {
    render(
      <Scanner
        dashboard={busy()}
        selection={{ type: "room", id: "operations" }}
        onSelect={vi.fn()}
      />,
    );
    const panel = screen.getByRole("region", { name: "Scanner" });
    const title = within(panel).getByRole("heading", { name: "Scanner" });
    const toggle = within(panel).getByRole("group", { name: "Scan" });
    // Same title strip: the title (with its caret) on the left, the toggle on the right.
    expect(title.parentElement?.parentElement).toBe(toggle.parentElement);
    expect(title.parentElement?.textContent).not.toMatch(/Room$/);
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
