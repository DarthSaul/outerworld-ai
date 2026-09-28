import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { Character } from "./Character.js";

const rig = { tintHue: 230, trimHue: 250, head: "dome", trace: "core" } as const;
const derived = { shoulder: "ball", accessory: "none" } as const;

const hrefs = (el: HTMLElement) =>
  Array.from(el.querySelectorAll("use")).map((u) => u.getAttribute("href"));

describe("Character", () => {
  it("is an image named by the agent and its state", () => {
    render(<Character name="Planner" rig={rig} derived={derived} state="idle" scale={1} />);
    const img = screen.getByRole("img", { name: "Planner, idle" });
    expect(img.tagName.toLowerCase()).toBe("svg");
    expect(img).toHaveAttribute("data-state", "idle");
  });

  it("references the chosen head, trace, and derived shoulder, plus the idle body", () => {
    render(<Character name="A" rig={rig} derived={derived} state="idle" scale={1} />);
    expect(hrefs(screen.getByRole("img"))).toEqual([
      "#ow-body-idle",
      "#ow-head-dome",
      "#ow-shoulder-ball",
      "#ow-trace-core",
    ]);
  });

  it("uses the active body while working", () => {
    render(<Character name="A" rig={rig} derived={derived} state="working" scale={1} />);
    expect(hrefs(screen.getByRole("img"))).toContain("#ow-body-active");
    expect(hrefs(screen.getByRole("img"))).not.toContain("#ow-body-idle");
  });

  it("adds the derived accessory when there is one", () => {
    render(
      <Character
        name="A"
        rig={rig}
        derived={{ shoulder: "pauldron", accessory: "thruster" }}
        state="idle"
        scale={1}
      />,
    );
    expect(hrefs(screen.getByRole("img"))).toEqual(
      expect.arrayContaining(["#ow-shoulder-pauldron", "#ow-accessory-thruster"]),
    );
  });

  it("shows the check glyph instead of the accessory when done", () => {
    render(
      <Character
        name="A"
        rig={rig}
        derived={{ shoulder: "ball", accessory: "antenna" }}
        state="done"
        scale={1}
      />,
    );
    const h = hrefs(screen.getByRole("img"));
    expect(h).toContain("#ow-glyph-check");
    expect(h).not.toContain("#ow-accessory-antenna");
  });

  it("shows the exclaim glyph when failed", () => {
    render(<Character name="A" rig={rig} derived={derived} state="failed" scale={1} />);
    expect(hrefs(screen.getByRole("img"))).toContain("#ow-glyph-exclaim");
  });

  it("sets the two persona hues and the state-owned glow as CSS variables", () => {
    render(<Character name="A" rig={rig} derived={derived} state="working" scale={2} />);
    const style = screen.getByRole("img").getAttribute("style") ?? "";
    expect(style).toContain("--ow-rig-tint-hue: 230");
    expect(style).toContain("--ow-rig-trim-hue: 250");
    expect(style).toContain("--ow-rig-glow: var(--ow-rig-glow-working)");
    expect(style).toContain("--ow-rig-px: 2px");
  });

  it("renders at integer multiples of the 24×32 grid only", () => {
    render(<Character name="A" rig={rig} derived={derived} state="idle" scale={4} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("width", "96");
    expect(img).toHaveAttribute("height", "128");
    expect(img).toHaveAttribute("viewBox", "0 0 24 32");
    expect(() =>
      render(<Character name="B" rig={rig} derived={derived} state="idle" scale={1.5 as 1} />),
    ).toThrow(/integer/);
  });

  it("groups the head and arms so CSS can animate them separately", () => {
    render(<Character name="A" rig={rig} derived={derived} state="working" scale={1} />);
    const img = screen.getByRole("img");
    expect(img.querySelector('[data-part="head"]')).not.toBeNull();
    expect(img.querySelector('[data-part="body"]')).not.toBeNull();
    expect(img.querySelector('[data-part="figure"]')).not.toBeNull();
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <Character name="Planner" rig={rig} derived={derived} state="working" scale={2} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
