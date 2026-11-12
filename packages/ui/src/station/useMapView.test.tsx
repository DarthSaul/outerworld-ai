import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { demoDashboard } from "../test/dashboard.js";
import { DashboardMap } from "./DashboardMap.js";
import { clampView, fitView, MAX_MAP_SCALE, zoomView } from "./useMapView.js";

const wide = { vw: 1000, vh: 700, cw: 1000, ch: 700 };
const narrow = { vw: 430, vh: 580, cw: 860, ch: 580 };

describe("map view math", () => {
  it("fits every room: never scales up, scales down to the tighter side, and centers", () => {
    expect(fitView(wide)).toEqual({ x: 0, y: 0, scale: 1 });
    expect(fitView(narrow)).toEqual({ x: 0, y: 145, scale: 0.5 });
    expect(fitView({ vw: 0, vh: 0, cw: 0, ch: 0 })).toEqual({ x: 0, y: 0, scale: 1 });
  });

  it("keeps part of the plane under the viewport's center", () => {
    expect(clampView({ x: 5000, y: -5000, scale: 1 }, wide)).toEqual({
      x: 500,
      y: 350 - 700,
      scale: 1,
    });
    const inside = { x: -10, y: 20, scale: 1 };
    expect(clampView(inside, wide)).toEqual(inside);
  });

  it("zooms about the center, between the fitted scale and the maximum", () => {
    const fitted = fitView(narrow);
    expect(zoomView(fitted, 0.5, narrow).scale).toBe(0.5);
    const z = zoomView(fitted, 2, narrow);
    expect(z.scale).toBe(1);
    // The plane point under the viewport's center stays there.
    const before = (narrow.vw / 2 - fitted.x) / fitted.scale;
    expect((narrow.vw / 2 - z.x) / z.scale).toBeCloseTo(before);
    expect(zoomView({ x: 0, y: 0, scale: 1.9 }, 4, wide).scale).toBe(MAX_MAP_SCALE);
  });

  it("re-applies the limits at the same zoom when the viewport grows past the scale", () => {
    // Zoomed out to fit a narrow viewport, then the viewport widens: 0.5 is below the new fit.
    const grown = zoomView(fitView(narrow), 1, wide);
    expect(grown.scale).toBe(1);
    expect(clampView(grown, wide)).toEqual(grown);
  });
});

/** happy-dom lays nothing out: give the viewport and the plane the sizes a browser would. */
function sized(viewport: { w: number; h: number }, plane: { w: number; h: number }) {
  const size = (el: Element, axis: "w" | "h") =>
    el.hasAttribute("data-map-viewport")
      ? viewport[axis]
      : el.hasAttribute("data-map-plane")
        ? plane[axis]
        : 0;
  const spies = [
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (
      this: Element,
    ) {
      return size(this, "w");
    }),
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (
      this: Element,
    ) {
      return size(this, "h");
    }),
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (
      this: Element,
    ) {
      return size(this, "w");
    }),
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (
      this: Element,
    ) {
      return size(this, "h");
    }),
  ];
  return () => {
    for (const s of spies) s.mockRestore();
  };
}

const planeOf = (container: HTMLElement) =>
  container.querySelector("[data-map-plane]") as HTMLElement;
const viewportOf = (container: HTMLElement) =>
  container.querySelector("[data-map-viewport]") as HTMLElement;

describe("DashboardMap: pan, zoom, recenter", () => {
  let restore: () => void;
  beforeEach(() => {
    restore = sized({ w: 430, h: 580 }, { w: 860, h: 580 });
  });
  afterEach(() => restore());

  it("starts with every room in view", () => {
    const { container } = render(<DashboardMap dashboard={demoDashboard()} />);
    expect(planeOf(container).style.transform).toBe("translate(0px, 145px) scale(0.5)");
  });

  it("drags the map, and a drag across a room does not select it", () => {
    const onSelectRoom = vi.fn();
    const { container } = render(
      <DashboardMap dashboard={demoDashboard()} onSelectRoom={onSelectRoom} />,
    );
    const viewport = viewportOf(container);
    const room = screen.getByRole("button", { name: "B-1 Research" });
    fireEvent.pointerDown(room, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 160, clientY: 130 });
    expect(viewport.className).toContain("cursor-grabbing");
    fireEvent.pointerUp(viewport, { pointerId: 1, clientX: 160, clientY: 130 });
    fireEvent.click(room);
    expect(onSelectRoom).not.toHaveBeenCalled();
    expect(planeOf(container).style.transform).toBe("translate(60px, 175px) scale(0.5)");
    expect(viewport.className).toContain("cursor-grab");
  });

  it("treats a press that barely moves as a click", () => {
    const onSelectRoom = vi.fn();
    const { container } = render(
      <DashboardMap dashboard={demoDashboard()} onSelectRoom={onSelectRoom} />,
    );
    const room = screen.getByRole("button", { name: "B-1 Research" });
    fireEvent.pointerDown(room, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(viewportOf(container), { pointerId: 1, clientX: 102, clientY: 101 });
    fireEvent.pointerUp(viewportOf(container), { pointerId: 1 });
    fireEvent.click(room);
    expect(onSelectRoom).toHaveBeenCalledWith("research");
  });

  it("zooms with the buttons and recenters to fit every room", () => {
    const { container } = render(<DashboardMap dashboard={demoDashboard()} />);
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(planeOf(container).style.transform).toContain("scale(0.625)");
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(planeOf(container).style.transform).toContain("scale(0.5)");
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: /Recenter/ }));
    expect(planeOf(container).style.transform).toBe("translate(0px, 145px) scale(0.5)");
  });

  it("a press on the view buttons never starts a drag", () => {
    const { container } = render(<DashboardMap dashboard={demoDashboard()} />);
    const recenter = screen.getByRole("button", { name: /Recenter/ });
    fireEvent.pointerDown(recenter, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(viewportOf(container), { pointerId: 1, clientX: 90, clientY: 90 });
    expect(planeOf(container).style.transform).toBe("translate(0px, 145px) scale(0.5)");
  });

  it("lets a click through after a drag the browser sent no click for", async () => {
    vi.useFakeTimers();
    const onSelectRoom = vi.fn();
    const { container } = render(
      <DashboardMap dashboard={demoDashboard()} onSelectRoom={onSelectRoom} />,
    );
    const viewport = viewportOf(container);
    fireEvent.pointerDown(viewport, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(viewport, { pointerId: 1, clientX: 40, clientY: 0 });
    fireEvent.pointerUp(viewport, { pointerId: 1 });
    act(() => vi.runAllTimers());
    vi.useRealTimers();
    fireEvent.click(screen.getByRole("button", { name: "B-1 Research" }));
    expect(onSelectRoom).toHaveBeenCalledWith("research");
  });
});
