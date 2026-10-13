import { CHARACTERS, characterGrid } from "@darthsaul/outerworld-ai-core";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { stVar } from "../tokens/tokens.js";
import { Avatar, overseerAvatarProps } from "./Avatar.js";
import { ChoiceButton, Diamond, OutlineButton, tabClass } from "./buttons.js";
import { Panel, PanelLabel } from "./Panel.js";
import { SegmentBar } from "./SegmentBar.js";
import { Sprite } from "./Sprite.js";
import { StatBox } from "./StatBox.js";
import { CREW_STATUS_TONE, lampBlink, RUN_STATUS_TONE, toneVar } from "./tone.js";

describe("Panel", () => {
  it("is a region named by its title strip, with meta on the right", () => {
    render(
      <Panel title="Crew roster" meta="3 + OV">
        <PanelLabel>Crew</PanelLabel>
      </Panel>,
    );
    expect(screen.getByRole("region", { name: "Crew roster" })).toBeInTheDocument();
    expect(screen.getByText("3 + OV")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Crew" })).toBeInTheDocument();
  });

  it("takes controls as meta", () => {
    render(<Panel title="Map" meta={<button type="button">A</button>} dense />);
    expect(screen.getByRole("button", { name: "A" })).toBeInTheDocument();
  });
});

describe("StatBox", () => {
  it("shows a label over a value, and blinks its border only on alert", () => {
    const { container, rerender } = render(<StatBox label="Alerts" value={2} tone="red" alert />);
    expect(screen.getByText("Alerts")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("st-blink-border");
    rerender(<StatBox label="Alerts" value={0} tone="red" />);
    expect(container.firstElementChild).not.toHaveClass("st-blink-border");
  });
});

describe("SegmentBar", () => {
  it("is a meter when the amount is proven", () => {
    render(<SegmentBar color={stVar("amber")} percent={42.4} size="lg" label="Fuel" />);
    const meter = screen.getByRole("meter", { name: "Fuel" });
    expect(meter).toHaveAttribute("aria-valuenow", "42");
  });

  it("clamps the fill to 0–100", () => {
    const { container } = render(<SegmentBar color={stVar("green")} percent={140} label="x" />);
    expect((container.querySelector(".h-full") as HTMLElement).style.width).toBe("100%");
  });

  it("marches, hidden from assistive tech, when there is no proven amount and it is active", () => {
    const { container } = render(<SegmentBar color={stVar("green")} active label="ignored" />);
    expect(screen.queryByRole("meter")).toBeNull();
    expect(container.querySelector(".st-segments-march")).not.toBeNull();
  });

  it("can be a solid fill (the roster bar)", () => {
    const { container } = render(<SegmentBar color={stVar("cyan")} percent={50} solid size="sm" />);
    expect(container.querySelector(".st-segments")).toBeNull();
  });
});

describe("Avatar", () => {
  it("shows two-letter initials, hidden from assistive tech, with an optional lamp and ring", () => {
    const { container } = render(
      <Avatar
        name="Quill"
        color={stVar("room-1")}
        size={30}
        ring={stVar("cyan")}
        lamp={{ color: stVar("green"), className: lampBlink("active") }}
      />,
    );
    const chip = container.firstElementChild as HTMLElement;
    expect(chip).toHaveTextContent("QU");
    expect(chip).toHaveAttribute("aria-hidden", "true");
    expect(chip).toHaveClass("st-ring");
    expect(chip.querySelector(".st-blink")).not.toBeNull();
  });

  it("gives the Overseer a white chip with a cyan ring", () => {
    expect(overseerAvatarProps()).toEqual({
      color: "var(--st-white)",
      ring: "var(--st-cyan)",
      ringGap: "var(--st-room)",
    });
  });
});

describe("Sprite", () => {
  it("draws every filled cell of the character, at an integer scale", () => {
    const { container } = render(<Sprite look={5} scale={4} label="Rivet" />);
    const svg = screen.getByRole("img", { name: "Rivet" });
    expect(svg).toHaveAttribute("width", "80");
    expect(svg).toHaveAttribute("height", "104");
    const covered = [...container.querySelectorAll("rect")].reduce(
      (n, r) => n + Number(r.getAttribute("width")),
      0,
    );
    const character = CHARACTERS[5];
    if (!character) throw new Error("no character");
    expect(covered).toBe(characterGrid(character).flat().filter(Boolean).length);
  });

  it("is decorative without a label and falls back for an unknown look", () => {
    const { container } = render(<Sprite look={99} />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelectorAll("rect").length).toBeGreaterThan(0);
  });
});

describe("buttons", () => {
  it("styles tabs filled when active", () => {
    expect(tabClass(true)).toContain("bg-cyan");
    expect(tabClass(false, "map")).toContain("text-cyan");
  });

  it("outline and choice buttons click, and say what they do", async () => {
    const onClick = vi.fn();
    render(
      <>
        <OutlineButton tone="amber" onClick={onClick}>
          Stop run
        </OutlineButton>
        <ChoiceButton glyph="A" tone="green" onClick={onClick}>
          Approve
        </ChoiceButton>
        <OutlineButton tone="line" filled>
          Back
        </OutlineButton>
        <Diamond color={stVar("cyan")} />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Stop run" }));
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});

describe("tones", () => {
  it("maps every status to a token", () => {
    for (const tone of [...Object.values(CREW_STATUS_TONE), ...Object.values(RUN_STATUS_TONE)]) {
      expect(toneVar(tone)).toMatch(/^var\(--st-[a-z-]+\)$/);
    }
    expect(lampBlink("idle")).toBe("");
    expect(lampBlink("blocked")).toContain("st-blink-blocked");
  });
});

describe("accessibility", () => {
  it("has no axe violations", async () => {
    const { container } = render(
      <Panel title="Scanner" meta="Room">
        <StatBox label="Tasks live" value={3} tone="green" />
        <SegmentBar color={stVar("amber")} percent={40} label="Fuel" />
        <Avatar name="Wren" color={stVar("room-0")} />
        <Sprite look={1} scale={2} label="Bolt" />
        <OutlineButton>Demolish</OutlineButton>
        <ChoiceButton glyph="B" tone="red">
          Deny
        </ChoiceButton>
      </Panel>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
