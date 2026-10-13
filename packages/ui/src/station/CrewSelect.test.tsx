import { fireEvent, render, screen } from "@testing-library/react";
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
  onAssign = vi.fn(),
}: {
  readonly onAssign?: (id: string, look: number) => void;
}) {
  const [configuring, setConfiguring] = useState("quill");
  const [cursor, setCursor] = useState(21);
  return (
    <>
      <input aria-label="elsewhere" />
      <CrewSelect
        agents={agents}
        configuring={configuring}
        cursor={cursor}
        onConfigure={(id) => {
          setConfiguring(id);
          setCursor(agents.find((a) => a.id === id)?.look ?? 0);
        }}
        onCursor={setCursor}
        onAssign={() => onAssign(configuring, cursor)}
        onRandom={() => setCursor(0)}
      />
    </>
  );
}

const cursorName = () =>
  screen
    .getAllByRole("button", { pressed: true })
    .find((b) => b.closest("li") && b.textContent?.includes("P1"))
    ?.getAttribute("aria-label");

describe("CrewSelect", () => {
  it("shows the configured agent's look on the stage as equipped", () => {
    render(<Harness />);
    expect(screen.getByRole("region", { name: "Appearance" })).toHaveTextContent("Operations");
    expect(screen.getByRole("img", { name: "QUILL" })).toBeInTheDocument();
    expect(screen.getByText("Equipped on Quill")).toBeInTheDocument();
    expect(cursorName()).toBe("QUILL, Scribe");
  });

  it("moves the cursor with the arrow keys (wrapping by row) and assigns on Enter", () => {
    const onAssign = vi.fn();
    render(<Harness onAssign={onAssign} />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(cursorName()).toBe("ATLAS, Heavy Lifter");
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(cursorName()).toBe("DR. ISO, Scientist");
    fireEvent.keyDown(window, { key: "ArrowUp" });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(cursorName()).toBe("QUILL, Scribe");
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onAssign).toHaveBeenCalledWith("quill", 21);
  });

  it("ignores keys while typing in a field", () => {
    render(<Harness />);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "elsewhere" }), { key: "ArrowRight" });
    expect(cursorName()).toBe("QUILL, Scribe");
  });

  it("says who else wears a look, and badges those tiles", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Wren" }));
    expect(screen.getByText("Equipped on Wren")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Quill" }));
    fireEvent.click(screen.getByRole("button", { name: "KESTREL, Commander" }));
    expect(screen.getByText("Also worn by Vesper, Wren")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "KESTREL, Commander" })).toHaveTextContent("VE WR");
    fireEvent.click(screen.getByRole("button", { name: "NOVA, Pilot" }));
    expect(screen.getByText("Available")).toBeInTheDocument();
  });

  it("assigns with (A) and picks at random with (B)", () => {
    const onAssign = vi.fn();
    render(<Harness onAssign={onAssign} />);
    fireEvent.click(screen.getByRole("button", { name: "Random" }));
    expect(cursorName()).toBe("NOVA, Pilot");
    fireEvent.click(screen.getByRole("button", { name: "Assign" }));
    expect(onAssign).toHaveBeenCalledWith("quill", 0);
  });

  it("has no axe violations", async () => {
    const { container } = render(<Harness />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
