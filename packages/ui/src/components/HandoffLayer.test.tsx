import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HandoffLayer, type HandoffLayerProps } from "./HandoffLayer.js";

const geometry = {
  "a-b": {
    path: "M 100 100 C 200 100, 300 100, 400 100",
    midpoint: { x: 250, y: 100 },
    angle: 0,
    chevronAt: { x: 355, y: 100 },
    paired: true,
    side: 1 as const,
  },
  "b-a": {
    path: "M 400 112 C 300 112, 200 112, 100 112",
    midpoint: { x: 250, y: 112 },
    angle: 180,
    chevronAt: { x: 145, y: 112 },
    paired: true,
    side: -1 as const,
  },
};

const props = (): HandoffLayerProps => ({
  handoffs: [
    { id: "a-b", from: "a", to: "b", label: "Alpha to Beta" },
    { id: "b-a", from: "b", to: "a", label: "Beta to Alpha" },
  ],
  geometry,
  carrying: { "a-b": true, "b-a": false },
  onSelect: vi.fn(),
});

describe("HandoffLayer", () => {
  it("draws one visible path and one wide hit path per handoff, with the chevron at the reading end", () => {
    render(
      <svg role="presentation">
        <HandoffLayer {...props()} />
      </svg>,
    );
    const item = document.querySelector('[data-handoff="a-b"]');
    expect(item).not.toBeNull();
    expect(item?.querySelector('path[data-role="stroke"]')).toHaveAttribute(
      "d",
      geometry["a-b"].path,
    );
    expect(item?.querySelector('path[data-role="hit"]')).toHaveAttribute("d", geometry["a-b"].path);
    const chevron = item?.querySelector('[data-role="chevron"]');
    expect(chevron?.getAttribute("transform")).toContain("translate(355 100)");
    expect(chevron?.getAttribute("transform")).toContain("rotate(0)");
  });

  it("is selectable by keyboard and mouse, naming the handoff", async () => {
    const p = props();
    render(
      <svg role="presentation">
        <HandoffLayer {...p} />
      </svg>,
    );
    const btn = screen.getByRole("button", { name: "Beta to Alpha" });
    await userEvent.click(btn);
    expect(p.onSelect).toHaveBeenLastCalledWith({ kind: "handoff", id: "b-a" });
    btn.focus();
    await userEvent.keyboard("{Enter}");
    expect(p.onSelect).toHaveBeenCalledTimes(2);
  });

  it("derives data-state: selected wins, then carrying, then emphasis, else default", () => {
    render(
      <svg role="presentation">
        <HandoffLayer
          {...props()}
          selection={{ kind: "handoff", id: "b-a" }}
          emphasized={new Set(["a-b"])}
        />
      </svg>,
    );
    expect(document.querySelector('[data-handoff="b-a"]')).toHaveAttribute(
      "data-state",
      "selected",
    );
    expect(document.querySelector('[data-handoff="a-b"]')).toHaveAttribute(
      "data-state",
      "carrying",
    );
  });

  it("emphasizes a connected, non-carrying handoff", () => {
    const p = { ...props(), carrying: { "a-b": false, "b-a": false } };
    render(
      <svg role="presentation">
        <HandoffLayer {...p} emphasized={new Set(["a-b"])} />
      </svg>,
    );
    expect(document.querySelector('[data-handoff="a-b"]')).toHaveAttribute(
      "data-state",
      "emphasis",
    );
    expect(document.querySelector('[data-handoff="b-a"]')).toHaveAttribute("data-state", "default");
  });

  it("renders a packet only on carrying handoffs, moving along the same path", () => {
    render(
      <svg role="presentation">
        <HandoffLayer {...props()} />
      </svg>,
    );
    const packets = document.querySelectorAll("[data-packet]");
    expect(packets).toHaveLength(1);
    expect(packets[0]).toHaveAttribute("data-packet", "a-b");
    expect(packets[0]?.getAttribute("style")).toContain(
      `offset-path: path("${geometry["a-b"].path}")`,
    );
  });
});
