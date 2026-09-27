import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { OverseerCharacter } from "./OverseerCharacter.js";

describe("OverseerCharacter", () => {
  it("is an image named by the overseer and its state, using the hero symbol", () => {
    render(<OverseerCharacter name="Meridian" state="reconciling" scale={2} />);
    const img = screen.getByRole("img", { name: "Meridian, reconciling" });
    expect(img).toHaveAttribute("data-state", "reconciling");
    expect(img.querySelector("use")).toHaveAttribute("href", "#ow-hero");
    expect(img).toHaveAttribute("viewBox", "0 0 48 64");
  });

  it("renders at 2× or 4× only", () => {
    render(<OverseerCharacter name="M" state="idle" scale={4} />);
    expect(screen.getByRole("img")).toHaveAttribute("width", "192");
    expect(screen.getByRole("img")).toHaveAttribute("height", "256");
    expect(() => render(<OverseerCharacter name="N" state="idle" scale={1 as 2} />)).toThrow(
      /2 or 4/,
    );
  });

  it("is achromatic: rig colors are bound to the overseer tokens, never to hues", () => {
    render(<OverseerCharacter name="M" state="idle" scale={2} />);
    const style = screen.getByRole("img").getAttribute("style") ?? "";
    expect(style).toContain("--ow-rig-primary: var(--ow-overseer-primary)");
    expect(style).toContain("--ow-rig-secondary: var(--ow-overseer-secondary)");
    expect(style).toContain("--ow-rig-frame: var(--ow-overseer-frame)");
    expect(style).not.toContain("tint-hue");
  });

  it("maps overseer states onto the run glow: reconciling glows working, reported glows done, attention glows failed, idle glows idle", () => {
    const glow = (state: "idle" | "reconciling" | "reported" | "attention") => {
      const { unmount } = render(<OverseerCharacter name="M" state={state} scale={2} />);
      const s = screen.getByRole("img").getAttribute("style") ?? "";
      unmount();
      return /--ow-rig-glow: var\(--ow-rig-glow-(\w+)\)/.exec(s)?.[1];
    };
    expect(glow("idle")).toBe("idle");
    expect(glow("reconciling")).toBe("working");
    expect(glow("reported")).toBe("done");
    expect(glow("attention")).toBe("failed");
  });

  it("has no axe violations", async () => {
    const { container } = render(<OverseerCharacter name="Meridian" state="reported" scale={2} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
