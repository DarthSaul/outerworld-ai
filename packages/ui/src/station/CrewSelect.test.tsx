import { ART_CHARACTERS, CHARACTER_COUNT } from "@darthsaul/outerworld-ai-core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { stVar } from "../tokens/tokens.js";
import { CrewSelect, type CrewSelectAgent } from "./CrewSelect.js";

const agents: CrewSelectAgent[] = [
  {
    id: "vesper",
    name: "Vesper",
    role: "Overseer",
    roomName: "Command",
    color: stVar("cyan"),
    look: 3,
  },
  {
    id: "quill",
    name: "Quill",
    role: "Crew member",
    roomName: "Operations",
    color: stVar("room-0"),
    look: 21,
  },
  {
    id: "wren",
    name: "Wren",
    role: "Crew member",
    roomName: "Research",
    color: stVar("room-1"),
    look: 3,
  },
];

function Harness({
  who = "quill",
  onSave = vi.fn(),
}: {
  readonly who?: string;
  readonly onSave?: (id: string, look: number) => void;
}) {
  const agent = agents.find((a) => a.id === who) ?? (agents[1] as CrewSelectAgent);
  const [cursor, setCursor] = useState(agent.look);
  return (
    <CrewSelect
      agent={agent}
      others={agents}
      cursor={cursor}
      onCursor={setCursor}
      onSave={() => onSave(agent.id, cursor)}
    />
  );
}

const grid = (name = "Quill") => screen.getByRole("list", { name: `Choose how ${name} appears` });
// A direct lookup: computing every tile's accessible name on each call is slow under load.
const cursorName = (name?: string) =>
  grid(name).querySelector('button[aria-pressed="true"]')?.getAttribute("aria-label");
const save = () => screen.getByRole("button", { name: "Save" });

describe("CrewSelect", () => {
  it("shows the crew member's look on the stage as equipped, with Save in the title strip", () => {
    render(<Harness />);
    const panel = screen.getByRole("region", { name: "Appearance" });
    const title = within(panel).getByRole("heading", { name: "Appearance" });
    expect(title.parentElement?.parentElement).toBe(save().parentElement);
    expect(panel).not.toHaveTextContent("Operations");
    expect(screen.getByRole("img", { name: "QUILL" })).toBeInTheDocument();
    expect(screen.getByText("Equipped on Quill")).toBeInTheDocument();
    expect(cursorName()).toBe("QUILL, Scribe");
    expect(screen.queryByRole("button", { name: "Random" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Assign" })).toBeNull();
  });

  it("enables Save only when another character is picked, and saves it", () => {
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);
    expect(save()).toBeDisabled();
    fireEvent.click(within(grid()).getByRole("button", { name: "NOVA, Pilot" }));
    expect(save()).toBeEnabled();
    fireEvent.click(save());
    expect(onSave).toHaveBeenCalledWith("quill", 0);
    fireEvent.click(within(grid()).getByRole("button", { name: "QUILL, Scribe" }));
    expect(save()).toBeDisabled();
  });

  it("lays every character, drawn and painted, in two rows that scroll sideways", () => {
    render(<Harness />);
    expect(within(grid()).getAllByRole("listitem")).toHaveLength(CHARACTER_COUNT);
    expect(grid().className).toMatch(/overflow-x-auto/);
    expect(grid().style.gridTemplateColumns).toBe(
      `repeat(${Math.ceil(CHARACTER_COUNT / 2)}, max-content)`,
    );
    const painted = ART_CHARACTERS[0];
    const tile = within(grid()).getByRole("button", {
      name: `${painted?.name}, ${painted?.role}`,
    });
    expect(tile.querySelector("img")?.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
  });

  it("moves with the arrow keys (wrapping across, rows up and down) and saves on Enter", () => {
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);
    fireEvent.keyDown(grid(), { key: "Enter" });
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.keyDown(grid(), { key: "ArrowRight" });
    expect(cursorName()).toBe("ATLAS, Heavy Lifter");
    expect(within(grid()).getByRole("button", { name: "ATLAS, Heavy Lifter" })).toHaveFocus();
    fireEvent.keyDown(grid(), { key: "Home" });
    expect(cursorName()).toBe("NOVA, Pilot");
    fireEvent.keyDown(grid(), { key: "ArrowDown" });
    expect(cursorName()).not.toBe("NOVA, Pilot");
    fireEvent.keyDown(grid(), { key: "ArrowUp" });
    expect(cursorName()).toBe("NOVA, Pilot");
    fireEvent.keyDown(grid(), { key: "ArrowUp" });
    expect(cursorName()).toBe("NOVA, Pilot");
    fireEvent.keyDown(grid(), { key: "ArrowLeft" });
    const last = ART_CHARACTERS[ART_CHARACTERS.length - 1];
    expect(cursorName()).toBe(`${last?.name}, ${last?.role}`);
    fireEvent.keyDown(grid(), { key: "ArrowRight" });
    expect(cursorName()).toBe("NOVA, Pilot");
    fireEvent.keyDown(grid(), { key: "Enter" });
    expect(onSave).toHaveBeenCalledWith("quill", 0);
  });

  it("leaves the arrow keys alone outside the grid", () => {
    render(<Harness />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(cursorName()).toBe("QUILL, Scribe");
  });

  it("says who else wears a look, and badges those tiles", () => {
    render(<Harness who="wren" />);
    expect(screen.getByText("Equipped on Wren")).toBeInTheDocument();
    expect(
      within(grid("Wren")).getByRole("button", { name: "KESTREL, Commander" }),
    ).toHaveTextContent("VE");
    fireEvent.click(within(grid("Wren")).getByRole("button", { name: "QUILL, Scribe" }));
    expect(screen.getByText("Also worn by Quill")).toBeInTheDocument();
    fireEvent.click(within(grid("Wren")).getByRole("button", { name: "NOVA, Pilot" }));
    expect(screen.getByText("Available")).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = render(<Harness />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
