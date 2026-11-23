import { render, screen, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { demoDashboard, demoInput } from "../test/dashboard.js";
import { DashboardMap, grantName, MAP_STYLES, walkPhase } from "./DashboardMap.js";

describe("DashboardMap", () => {
  it("draws the Bridge with the Overseer and each room with its sector, crew and placed objects", () => {
    const { container } = render(<DashboardMap dashboard={demoDashboard()} />);
    expect(screen.getByRole("button", { name: "HQ · Bridge Command" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vesper, Overseer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "A-1 Operations" })).toBeInTheDocument();
    const ops = container.querySelector('[data-room="operations"]') as HTMLElement;
    expect(within(ops).getByRole("button", { name: "Quill, Idle" })).toBeInTheDocument();
    expect(within(ops).getByText("Notion")).toBeInTheDocument();
    expect(within(ops).getByTitle("Archive cabinet")).toHaveTextContent("Files");
  });

  it("shows each crew member as their own character, not initials", () => {
    const dashboard = demoDashboard();
    render(<DashboardMap dashboard={dashboard} />);
    for (const member of dashboard.crew) {
      const name = member.overseer ? `${member.name}, Overseer` : new RegExp(`^${member.name},`);
      const chip = screen.getByRole("button", { name });
      const avatar = chip.querySelector("[data-look]");
      expect(avatar).toHaveAttribute("data-look", String(member.look));
      expect(avatar?.querySelector("svg rect")).not.toBeNull();
      expect(avatar).not.toHaveTextContent(member.name.slice(0, 2).toUpperCase());
    }
  });

  it("draws a room's crew as a character over its name, unframed, each strolling its own slot", () => {
    const dashboard = demoDashboard();
    const { container } = render(<DashboardMap dashboard={dashboard} />);
    const roomCrew = dashboard.rooms.filter((r) => !r.bridge).flatMap((r) => r.crew);
    expect(roomCrew.length).toBeGreaterThan(0);
    const phases = new Set<string>();
    for (const member of roomCrew) {
      const chip = container.querySelector(`[data-crew="${member.id}"]`);
      const [figure, name] = Array.from(chip?.children ?? []);
      expect(figure).toHaveAttribute("data-look", String(member.look));
      expect(figure?.className).not.toMatch(/\bborder\b/);
      expect(name).toHaveTextContent(member.name);
      const walker = chip?.closest(".st-walker") as HTMLElement | null;
      expect(walker?.parentElement).toHaveClass("st-walk-slot");
      phases.add(walker?.style.getPropertyValue("--st-walk-phase") ?? "");
    }
    expect(phases.size).toBe(roomCrew.length);
  });

  it("gives every crew member a steady stroll phase between 0 and 1", () => {
    for (const id of ["quill", "wren", "vesper"]) {
      expect(walkPhase(id)).toBe(walkPhase(id));
      expect(walkPhase(id)).toBeGreaterThanOrEqual(0);
      expect(walkPhase(id)).toBeLessThan(1);
    }
    expect(walkPhase("quill")).not.toBe(walkPhase("wren"));
  });

  it("labels every hallway and selects a room, a crew member, or a hallway", async () => {
    const onSelectRoom = vi.fn();
    const onSelectAgent = vi.fn();
    const onSelectLane = vi.fn();
    render(
      <DashboardMap
        dashboard={demoDashboard()}
        onSelectRoom={onSelectRoom}
        onSelectAgent={onSelectAgent}
        onSelectLane={onSelectLane}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Hallway L-01: Operations → Command" }),
    );
    expect(onSelectLane).toHaveBeenCalledWith("operations-to-command");
    await userEvent.click(screen.getByRole("button", { name: "Quill, Idle" }));
    expect(onSelectAgent).toHaveBeenCalledWith("quill");
    expect(onSelectRoom).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "B-1 Research" }));
    expect(onSelectRoom).toHaveBeenCalledWith("research");
  });

  it("points two subtle chevrons along each hallway in the way it runs (ADR-0024)", () => {
    const { container } = render(<DashboardMap dashboard={demoDashboard()} />);
    const lane = container.querySelector('[data-lane="operations-to-research"]');
    const arrows = lane?.querySelectorAll("[data-lane-arrow]") ?? [];
    expect(arrows).toHaveLength(2);
    for (const a of arrows) {
      expect(a).toHaveAttribute("aria-hidden", "true");
      expect(["e", "w", "n", "s"]).toContain(a.getAttribute("data-lane-arrow"));
    }
    // A one-way hallway sits on its route: nothing is shifted by the lane gap.
    expect(lane).not.toHaveAttribute("data-paired");
    expect(lane?.innerHTML).not.toContain("--st-map-lane-gap");
  });

  it("runs a two-way pair side by side, each lane shifted by the lane gap", () => {
    const input = demoInput();
    const station = {
      ...input.station,
      lanes: [
        ...input.station.lanes,
        { id: "research-to-operations", from: "research", to: "operations" },
      ],
    };
    const { container } = render(<DashboardMap dashboard={demoDashboard({ station })} />);
    for (const id of ["operations-to-research", "research-to-operations"]) {
      const lane = container.querySelector(`[data-lane="${id}"]`);
      expect(lane).toHaveAttribute("data-paired", "true");
      const segments = [...(lane?.querySelectorAll(".st-lane") ?? [])] as HTMLElement[];
      expect(segments.length).toBeGreaterThan(0);
      expect(segments.every((s) => s.getAttribute("style")?.includes("--st-map-lane-gap"))).toBe(
        true,
      );
    }
    expect(
      screen.getByRole("button", { name: "Hallway L-04: Research → Operations" }),
    ).toBeInTheDocument();
  });

  it("marks the selected room (and a selected crew member's room)", () => {
    const { container, rerender } = render(
      <DashboardMap dashboard={demoDashboard()} selection={{ type: "room", id: "research" }} />,
    );
    expect(container.querySelector('[data-room="research"]')).toHaveAttribute("data-selected");
    rerender(
      <DashboardMap dashboard={demoDashboard()} selection={{ type: "agent", id: "quill" }} />,
    );
    expect(container.querySelector('[data-room="operations"]')).toHaveAttribute("data-selected");
    expect(screen.getByRole("button", { name: "Quill, Idle" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("flags a room with a blocked crew member", () => {
    const d = demoDashboard({ activity: { quill: { state: "awaiting_consent", runs: 1 } } });
    const { container } = render(<DashboardMap dashboard={d} />);
    const ops = container.querySelector('[data-room="operations"]') as HTMLElement;
    expect(ops).toHaveAttribute("data-alert");
    expect(within(ops).getByText("! Alert")).toBeInTheDocument();
  });

  it("guides drawing a hallway and ignores crew clicks while drawing", async () => {
    const onSelectAgent = vi.fn();
    const { container, rerender } = render(
      <DashboardMap dashboard={demoDashboard()} drawFrom={null} onSelectAgent={onSelectAgent} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Select first room");
    await userEvent.click(screen.getByRole("button", { name: "Quill, Idle" }));
    expect(onSelectAgent).not.toHaveBeenCalled();
    rerender(<DashboardMap dashboard={demoDashboard()} drawFrom="research" />);
    expect(screen.getByRole("status")).toHaveTextContent("Hallway from Research to…");
    expect(container.querySelector('[data-room="research"]')).toHaveAttribute("data-linking");
  });

  it("covers the map while the station is stopped", () => {
    render(<DashboardMap dashboard={demoDashboard()} paused />);
    expect(screen.getByText("Stopped")).toBeInTheDocument();
  });

  it("puts packets only on a hallway with a running dispatch, two at most", () => {
    const quiet = render(<DashboardMap dashboard={demoDashboard()} />);
    expect(quiet.container.querySelectorAll("[data-packet]")).toHaveLength(0);
    quiet.unmount();
    const busy = render(
      <DashboardMap
        dashboard={demoDashboard({
          dispatches: [
            { workerAgentId: "wren" },
            { workerAgentId: "wren" },
            { workerAgentId: "wren" },
          ],
        })}
      />,
    );
    const packets = busy.container.querySelectorAll("[data-packet]");
    expect(packets).toHaveLength(2);
    expect([...packets].every((p) => p.getAttribute("data-packet") === "research-to-command")).toBe(
      true,
    );
  });

  it.each(MAP_STYLES)("renders the %s style", (style) => {
    const { container } = render(<DashboardMap dashboard={demoDashboard()} mapStyle={style} />);
    expect(container.querySelector(`[data-map-style="${style}"]`)).not.toBeNull();
  });

  it("names a prop's real capability and a connector by its own name", () => {
    const ops = demoDashboard().rooms.find((r) => r.id === "operations");
    expect(ops?.grants.map(grantName)).toEqual(["Web", "Files", "Memory", "Notion"]);
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <DashboardMap
        dashboard={demoDashboard({ activity: { wren: { state: "running", runs: 1 } } })}
        selection={{ type: "lane", id: "research-to-command" }}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
