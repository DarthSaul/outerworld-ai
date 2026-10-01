import { term } from "@darthsaul/outerworld-ai-core";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { fakeApi, renderApp } from "../test/fake-daemon.js";

const at = "2026-10-01T09:00:00.000Z";

const busy = () => {
  const fake = fakeApi();
  fake.crewActivity.quill = { state: "awaiting_consent", runs: 1, sessionId: "s1", at };
  fake.crewActivity.vesper = { state: "running", runs: 1, sessionId: "s0", at };
  return fake;
};

const map = () => screen.findByRole("region", { name: term("station.map") });

describe("Station map", () => {
  it("draws rooms with their props and crew, and the Overseer at the edge", async () => {
    const { container } = renderApp("/");
    const m = await map();
    const rooms = [...m.querySelectorAll<HTMLElement>("[data-team]")].map((el) => el.dataset.team);
    expect(rooms).toEqual(["command", "operations"]);
    const operations = m.querySelector<HTMLElement>('[data-team="operations"]');
    if (!operations) throw new Error("no operations room");
    expect(within(operations).getByRole("button", { name: /Quill/ })).toHaveAttribute(
      "data-state",
      "idle",
    );
    expect(within(operations).getByText("Files")).toBeInTheDocument();
    expect(within(m).getByRole("button", { name: /Vesper/ })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows live state from the runtime: working, waiting for approval, a room needing attention", async () => {
    renderApp("/", busy());
    const m = await map();
    const operations = await within(m).findByRole("group", { name: "Operations" });
    await expect.poll(() => operations.dataset.health).toBe("attention");
    expect(within(operations).getByRole("button", { name: /Quill/ })).toHaveAttribute(
      "data-state",
      "working",
    );
    expect(within(operations).getByText("waiting for your approval")).toBeInTheDocument();
    expect(m.querySelector("[data-state='reconciling']")).not.toBeNull();
  });

  it("opens a crew member's page, or COMMS with the Overseer, from the map", async () => {
    const user = userEvent.setup();
    renderApp("/");
    const m = await map();
    await user.click(within(m).getByRole("button", { name: /Quill/ }));
    expect(await screen.findByRole("heading", { level: 1, name: "Quill" })).toBeInTheDocument();
  });

  it("opens COMMS with the Overseer from its core", async () => {
    const user = userEvent.setup();
    renderApp("/");
    const m = await map();
    await user.click(within(m).getByRole("button", { name: /Vesper/ }));
    expect(
      await screen.findByRole("heading", { level: 1, name: term("comms") }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Vesper", pressed: true })).toBeInTheDocument();
  });

  it("refreshes from runtime events, never by guessing", async () => {
    const fake = fakeApi();
    const { emit } = renderApp("/", fake);
    const m = await map();
    const quill = within(m).getByRole("button", { name: /Quill/ });
    expect(quill).toHaveAttribute("data-state", "idle");
    fake.crewActivity.quill = { state: "running", runs: 1, sessionId: "s1", at };
    emit({
      type: "run.started",
      agentId: "quill",
      sessionId: "s1",
      runId: "r1",
      payload: { model: "anthropic/claude-sonnet-5.5" },
    });
    await expect.poll(() => quill.dataset.state).toBe("working");
  });
});
