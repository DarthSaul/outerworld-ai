import { term } from "@darthsaul/outerworld-ai-core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { fakeApi, renderApp } from "../test/fake-daemon.js";

const at = "2026-10-01T09:00:00.000Z";

const map = () => screen.findByRole("region", { name: term("map.title") });
const scanner = () => screen.getByRole("region", { name: term("scanner.title") });
const comms = () => screen.getByRole("region", { name: term("comms.title") });

const withLane = () => {
  const fake = fakeApi();
  fake.state.station = {
    ...fake.state.station,
    lanes: [{ id: "operations-to-command", from: "operations", to: "command", note: "Briefings" }],
  };
  return fake;
};

describe("Station map", () => {
  it("puts the Overseer's room on the Bridge and draws the other rooms with crew and objects", async () => {
    const { container } = renderApp("/");
    const m = await map();
    expect(within(m).getByRole("button", { name: "HQ · Bridge Command" })).toBeInTheDocument();
    expect(within(m).getByRole("button", { name: "Vesper, Overseer" })).toBeInTheDocument();
    const ops = container.querySelector<HTMLElement>('[data-room="operations"]');
    if (!ops) throw new Error("no operations room");
    expect(within(ops).getByRole("button", { name: "Quill, Idle" })).toBeInTheDocument();
    expect(within(ops).getByTitle("Archive cabinet")).toHaveTextContent("Files");
    expect(screen.getByRole("region", { name: term("roster.title") })).toHaveTextContent("1 + OV");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("shows live state from the runtime and refreshes from events, never by guessing", async () => {
    const fake = fakeApi();
    const { emit, container } = renderApp("/", fake);
    const m = await map();
    expect(within(m).getByRole("button", { name: "Quill, Idle" })).toBeInTheDocument();
    fake.crewActivity.quill = { state: "awaiting_consent", runs: 1, sessionId: "s1", at };
    emit({
      type: "run.awaiting_consent",
      agentId: "quill",
      sessionId: "s1",
      runId: "r1",
      payload: { consentId: "c1" },
    });
    expect(await within(m).findByRole("button", { name: "Quill, Blocked" })).toBeInTheDocument();
    expect(container.querySelector('[data-room="operations"]')).toHaveAttribute("data-alert");
  });

  it("shows a crew member stopped by a budget as blocked, from budget.blocked alone", async () => {
    const fake = fakeApi();
    fake.crewActivity.quill = { state: "running", runs: 1, sessionId: "s1", at };
    const { emit } = renderApp("/", fake);
    const m = await map();
    expect(await within(m).findByRole("button", { name: "Quill, Active" })).toBeInTheDocument();
    fake.crewActivity.quill = { state: "blocked", runs: 0, sessionId: "s1", detail: "budget", at };
    emit({
      type: "budget.blocked",
      agentId: "quill",
      sessionId: "s1",
      runId: "r1",
      payload: { scope: "run", spentUsd: 0.6, limitUsd: 0.5 },
    });
    expect(await within(m).findByRole("button", { name: "Quill, Blocked" })).toBeInTheDocument();
  });

  it("scans the Bridge by default, then whatever is picked on the map or the roster", async () => {
    const user = userEvent.setup();
    renderApp("/", withLane());
    const m = await map();
    expect(scanner()).toHaveTextContent("Most urgent missions");
    await user.click(within(m).getByRole("button", { name: "Hallway L-01: Operations ⇄ Command" }));
    expect(scanner()).toHaveTextContent("Briefings");
    const roster = screen.getByRole("region", { name: term("roster.title") });
    await user.click(within(roster).getByRole("button", { name: /Quill/ }));
    expect(scanner()).toHaveTextContent("Crew member · Operations");
    await user.click(within(scanner()).getByRole("button", { name: "◀ Operations" }));
    expect(scanner()).toHaveTextContent(term("scanner.grants"));
  });

  it("switches map style and remembers it", async () => {
    const user = userEvent.setup();
    const { container, unmount } = renderApp("/");
    await map();
    await user.click(screen.getByRole("button", { name: term("mapStyle.polygon") }));
    expect(container.querySelector('[data-map-style="polygon"]')).not.toBeNull();
    unmount();
    const again = renderApp("/");
    await map();
    expect(again.container.querySelector('[data-map-style="polygon"]')).not.toBeNull();
    await user.click(screen.getByRole("button", { name: term("mapStyle.schematic") }));
  });
});

describe("hallways", () => {
  it("draws a hallway between two picked rooms and selects it", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/");
    const m = await map();
    await user.click(screen.getByRole("button", { name: term("map.draw") }));
    expect(within(m).getByRole("status")).toHaveTextContent(term("map.drawFirst"));
    await user.click(within(m).getByRole("button", { name: "A-1 Operations" }));
    expect(within(m).getByRole("status")).toHaveTextContent("Link Operations to…");
    await user.click(within(m).getByRole("button", { name: "HQ · Bridge Command" }));
    expect(calls).toContainEqual({
      method: "POST",
      path: "/lanes",
      body: { from: "operations", to: "command", note: "Handoff · Operations ⇄ Command" },
    });
  });

  it("says so instead of drawing a second hallway between linked rooms, and can cancel", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/", withLane());
    const m = await map();
    await user.click(screen.getByRole("button", { name: term("map.draw") }));
    await user.click(within(m).getByRole("button", { name: "HQ · Bridge Command" }));
    await user.click(within(m).getByRole("button", { name: "HQ · Bridge Command" }));
    expect(within(m).getByRole("status")).toHaveTextContent(term("map.drawFirst"));
    await user.click(within(m).getByRole("button", { name: "HQ · Bridge Command" }));
    await user.click(within(m).getByRole("button", { name: "A-1 Operations" }));
    expect(
      await screen.findByText("Command and Operations are already linked"),
    ).toBeInTheDocument();
    expect(calls.some((c) => c.path === "/lanes")).toBe(false);
    await user.click(screen.getByRole("button", { name: term("map.draw") }));
    await user.click(screen.getByRole("button", { name: term("map.drawCancel") }));
    expect(within(m).queryByRole("status")).toBeNull();
  });

  it("demolishes a hallway from the scanner", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/", withLane());
    const m = await map();
    await user.click(within(m).getByRole("button", { name: /Hallway L-01/ }));
    await user.click(within(scanner()).getByRole("button", { name: term("scanner.demolish") }));
    expect(calls).toContainEqual({ method: "DELETE", path: "/lanes/operations-to-command" });
  });
});

describe("crew actions", () => {
  it("stops a crew member's live runs", async () => {
    const user = userEvent.setup();
    const fake = fakeApi();
    const s = fake.seedSession("quill", "Briefing");
    s.runs.push({
      id: "r9",
      sessionId: s.session.id,
      agentId: "quill",
      state: "running",
      model: "m",
      createdAt: at,
      steps: 3,
    });
    fake.crewActivity.quill = { state: "running", runs: 1, sessionId: s.session.id, at };
    const { calls } = renderApp("/", fake);
    const m = await map();
    await user.click(await within(m).findByRole("button", { name: "Quill, Active" }));
    expect(scanner()).toHaveTextContent("Briefing");
    expect(scanner()).toHaveTextContent("Step 3");
    await user.click(within(scanner()).getByRole("button", { name: term("scanner.stopRun") }));
    expect(calls).toContainEqual({ method: "POST", path: "/runs/r9/cancel" });
  });
});

describe("Overseer comms", () => {
  it("chatters only about what is true: a quiet station says it is quiet", async () => {
    renderApp("/");
    await map();
    await waitFor(() =>
      expect(
        within(comms()).getByText(term("chatter.quiet"), { selector: ".sr-only" }),
      ).toBeInTheDocument(),
    );
  });

  it("asks for a pending consent with A and B, and answers it", async () => {
    const user = userEvent.setup();
    const fake = fakeApi();
    fake.consents.push({
      id: "c1",
      runId: "r1",
      sessionId: "s1",
      agentId: "quill",
      toolCallId: "t1",
      tool: "write_file",
      input: {},
      status: "pending",
      createdAt: at,
    });
    const { calls } = renderApp("/", fake);
    await map();
    expect(
      await within(comms()).findByText("Quill wants to use write_file. Approve?", {
        selector: ".sr-only",
      }),
    ).toBeInTheDocument();
    expect(within(comms()).getByText("Quill · Operations")).toBeInTheDocument();
    await user.click(within(comms()).getByRole("button", { name: term("comms.approve") }));
    expect(calls).toContainEqual({
      method: "POST",
      path: "/consents/c1",
      body: { decision: "approved" },
    });
  });

  it("asks about a memory proposal, and rejects it with B", async () => {
    const user = userEvent.setup();
    const fake = fakeApi();
    fake.memories.push({
      id: "m1",
      agentId: "quill",
      scope: "agent",
      text: "The hub moved",
      status: "proposed",
      createdAt: at,
    });
    const { calls } = renderApp("/", fake);
    await map();
    expect(
      await within(comms()).findByText("Quill wants to remember: “The hub moved”. Approve?", {
        selector: ".sr-only",
      }),
    ).toBeInTheDocument();
    await user.click(within(comms()).getByRole("button", { name: term("comms.deny") }));
    expect(calls).toContainEqual({ method: "POST", path: "/memories/m1/reject" });
  });

  it("sends an order to the Overseer's open session and streams the reply", async () => {
    const user = userEvent.setup();
    const fake = fakeApi();
    const s = fake.seedSession("vesper", "Chat");
    const { calls, emit } = renderApp("/", fake);
    await map();
    await user.type(within(comms()).getByRole("textbox"), "Research note apps{Enter}");
    await waitFor(() =>
      expect(calls).toContainEqual({
        method: "POST",
        path: `/sessions/${s.session.id}/messages`,
        body: { text: "Research note apps" },
      }),
    );
    const runId = s.runs[0]?.id ?? "";
    emit({
      type: "run.delta",
      agentId: "vesper",
      sessionId: s.session.id,
      runId,
      ephemeral: true,
      payload: { text: "On it, " },
    });
    emit({
      type: "run.delta",
      agentId: "vesper",
      sessionId: s.session.id,
      runId,
      ephemeral: true,
      payload: { text: "Commander." },
    });
    expect(
      await within(comms()).findByText("On it, Commander.", { selector: ".sr-only" }),
    ).toBeInTheDocument();
    expect(within(comms()).getByText("Vesper")).toBeInTheDocument();
  });

  it("opens a session for the order when the Overseer has none", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/");
    await map();
    await user.type(within(comms()).getByRole("textbox"), "Hello{Enter}");
    await waitFor(() =>
      expect(calls).toContainEqual({ method: "POST", path: "/agents/vesper/sessions", body: {} }),
    );
  });
});
