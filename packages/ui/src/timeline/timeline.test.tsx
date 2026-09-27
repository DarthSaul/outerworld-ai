import { bindReducer, emptyState } from "@darthsaul/outerworld-ai-core";
import { act, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadFixture } from "../test/fixture.js";
import { MOTION_MS } from "../tokens/tokens.js";
import { RunDigestButton } from "./RunDigestButton.js";
import { runDigestTimeline } from "./runDigestTimeline.js";
import { useTimeline } from "./useTimeline.js";

const { station } = loadFixture();
const T0 = "2026-09-27T15:00:00Z";

describe("runDigestTimeline", () => {
  it("walks one team's run from start to digest, in order, with monotonic steps", () => {
    const steps = runDigestTimeline(station, T0);
    expect(steps.map((s) => s.event.type)).toEqual([
      "run.started",
      "agent.state",
      "ledger.written",
      "agent.state",
      "run.finished",
      "overseer.state",
      "digest.posted",
    ]);
    for (let i = 1; i < steps.length; i++)
      expect(steps[i]!.step).toBeGreaterThan(steps[i - 1]!.step);
    expect(steps[0]?.event).toMatchObject({ teamId: "project-management" });
  });

  it("replays to a finished run with a carrying handoff and a reported overseer", () => {
    const apply = bindReducer(station);
    let s = emptyState(station, { now: T0, sourcePath: "demo" });
    for (const { event } of runDigestTimeline(station, T0)) s = apply(s, event);
    expect(s.teams["project-management"]?.run).toBe("done");
    expect(s.agents.planner?.state).toBe("done");
    expect(s.handoffs["project-management-to-strength-app"]?.carrying).toBe(true);
    expect(s.overseer.state).toBe("reported");
    expect(s.overseer.lastOutwardPostAt).toBeDefined();
  });
});

function Harness({ stepMs }: { readonly stepMs: number }) {
  const t = useTimeline(station, emptyState(station, { now: T0, sourcePath: "demo" }), {
    stepMs,
    now: T0,
  });
  return (
    <div>
      <output data-testid="run">{t.state.teams["project-management"]?.run}</output>
      <output data-testid="overseer">{t.state.overseer.state}</output>
      <output data-testid="playing">{String(t.playing)}</output>
      <output data-testid="step">{t.step}</output>
      <RunDigestButton playing={t.playing} onPlay={t.play} onReset={t.reset} />
    </div>
  );
}

describe("useTimeline", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it("starts idle, plays step by step at stepMs, then stops at the end", async () => {
    render(<Harness stepMs={100} />);
    expect(screen.getByTestId("run")).toHaveTextContent("idle");
    expect(screen.getByTestId("playing")).toHaveTextContent("false");
    await userEvent.click(screen.getByRole("button", { name: /run digest/i }));
    expect(screen.getByTestId("playing")).toHaveTextContent("true");
    act(() => vi.advanceTimersByTime(100));
    expect(screen.getByTestId("run")).toHaveTextContent("working");
    // Each step's timer is scheduled by an effect after the previous state commit, so advance in slices.
    for (let i = 0; i < 12; i++) act(() => vi.advanceTimersByTime(100));
    expect(screen.getByTestId("run")).toHaveTextContent("done");
    expect(screen.getByTestId("overseer")).toHaveTextContent("reported");
    expect(screen.getByTestId("playing")).toHaveTextContent("false");
  });

  it("reset returns to the initial state", async () => {
    render(<Harness stepMs={100} />);
    await userEvent.click(screen.getByRole("button", { name: /run digest/i }));
    for (let i = 0; i < 12; i++) act(() => vi.advanceTimersByTime(100));
    await userEvent.click(screen.getByRole("button", { name: /reset/i }));
    expect(screen.getByTestId("run")).toHaveTextContent("idle");
    expect(screen.getByTestId("step")).toHaveTextContent("0");
  });
});

describe("MOTION_MS", () => {
  it("names the durations the timeline can use", () => {
    expect(MOTION_MS.packet).toBeGreaterThan(0);
    expect(MOTION_MS.reduced).toBeGreaterThan(0);
  });
});
