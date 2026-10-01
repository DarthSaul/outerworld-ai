import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { stVar } from "../tokens/tokens.js";
import {
  CrtToggle,
  formatTokens,
  formatUptime,
  RadioChatter,
  StationHeader,
  StationVitals,
  StopButton,
} from "./StationChrome.js";

const radio = [
  {
    id: 2,
    at: "2026-10-01T10:00:05Z",
    who: "Quill",
    color: stVar("room-0"),
    text: "A run finished",
  },
  { id: 1, at: "2026-10-01T09:59:00Z", who: "Wren", color: stVar("room-1"), text: "Waiting" },
];

describe("StationHeader", () => {
  it("names the station and its size, counts live tasks and alerts, and carries the radio", () => {
    render(
      <StationHeader
        stationName="Demo Station"
        rooms={3}
        crew={3}
        tabs={<a href="/">Station</a>}
        live={2}
        alerts={1}
        radio={radio}
        controls={<StopButton stopped={false} onToggle={() => {}} />}
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Demo Station" })).toBeInTheDocument();
    expect(screen.getByText("Overseer console · 3 rooms · 3 crew")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getByText("Alerts").parentElement).toHaveClass("st-blink-border");
    expect(screen.getByText("Tasks live").parentElement).not.toHaveClass("st-blink-border");
    const lines = screen.getByRole("region", { name: "Radio chatter" }).querySelectorAll("li");
    expect([...lines].map((l) => l.textContent?.slice(8))).toEqual([
      "QuillA run finished",
      "WrenWaiting",
    ]);
  });
});

describe("RadioChatter", () => {
  it("says so when the channel is empty", () => {
    render(<RadioChatter entries={[]} />);
    expect(screen.getByText("Static. Nothing on the channel yet.")).toBeInTheDocument();
  });
});

describe("controls", () => {
  it("stop reads Stop while running and Resume while stopped", () => {
    const onToggle = vi.fn();
    const { rerender } = render(<StopButton stopped={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(onToggle).toHaveBeenCalled();
    rerender(<StopButton stopped onToggle={onToggle} />);
    expect(screen.getByRole("button", { name: "Resume" })).toHaveAttribute("aria-pressed", "true");
  });

  it("toggles the CRT overlay", () => {
    const onToggle = vi.fn();
    render(<CrtToggle on onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: "Scanlines overlay" }));
    expect(onToggle).toHaveBeenCalled();
  });
});

describe("StationVitals", () => {
  afterEach(() => vi.useRealTimers());

  it("shows tokens, fuel against the cap, and uptime that ticks", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T10:00:00Z"));
    render(
      <StationVitals
        tokens={1_284_000}
        spendUsd={12.5}
        capUsd={50}
        startedAt="2026-09-28T05:47:49Z"
      />,
    );
    expect(screen.getByText("1.284M")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Fuel · $12.50 / $50.00 day" })).toHaveAttribute(
      "aria-valuenow",
      "25",
    );
    expect(screen.getByText("03d 04:12:11")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText("03d 04:12:12")).toBeInTheDocument();
  });

  it("without a cap shows spend alone; without data shows dashes", () => {
    render(<StationVitals spendUsd={3} />);
    expect(screen.getByText("Fuel · $3.00 today, no cap")).toBeInTheDocument();
    expect(screen.queryByRole("meter")).toBeNull();
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("formats like the design", () => {
    expect(formatTokens(4_000)).toBe("0.004M");
    expect(formatUptime(0)).toBe("00d 00:00:00");
    expect(formatUptime(-5)).toBe("00d 00:00:00");
  });

  it("has no axe violations", async () => {
    const { container } = render(
      <>
        <StationHeader
          stationName="Demo"
          rooms={3}
          crew={3}
          tabs={null}
          live={0}
          alerts={0}
          radio={radio}
          controls={<CrtToggle on={false} onToggle={() => {}} />}
        />
        <StationVitals tokens={0} spendUsd={0} capUsd={50} startedAt="2026-10-01T00:00:00Z" />
      </>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
