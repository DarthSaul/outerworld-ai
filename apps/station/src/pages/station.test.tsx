import { term } from "@darthsaul/outerworld-ai-core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { fakeApi, renderApp } from "../test/fake-daemon.js";
import { choose } from "../test/menus.js";

const at = "2026-10-01T09:00:00.000Z";

const map = () => screen.findByRole("region", { name: term("map.title") });
const scanner = () => screen.getByRole("region", { name: term("scanner.title") });
const comms = () => screen.getByRole("tabpanel", { name: term("comms.title") });

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
    expect(within(scanner()).getByRole("button", { name: /^Crew · 2/ })).toHaveAttribute(
      "aria-haspopup",
      "listbox",
    );
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

  it("scans the Bridge by default, then whatever is picked on the map or the crew picker", async () => {
    const user = userEvent.setup();
    renderApp("/", withLane());
    const m = await map();
    expect(scanner()).toHaveTextContent("Most urgent missions");
    await user.click(within(m).getByRole("button", { name: "Hallway L-01: Operations ⇄ Command" }));
    expect(scanner()).toHaveTextContent("Briefings");
    await user.click(within(scanner()).getByRole("button", { name: /^Crew · 2/ }));
    await user.click(within(scanner()).getByRole("option", { name: /^Quill/ }));
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

  it("starts a new session for each order, never the open one, and streams it in the panel", async () => {
    const user = userEvent.setup();
    const fake = fakeApi();
    const old = fake.seedSession("vesper", "Chat");
    const { calls, emit } = renderApp("/", fake);
    await map();
    await user.type(
      within(comms()).getByRole("textbox", { name: term("comms.order") }),
      "Tell me the score{Enter}",
    );
    await waitFor(() =>
      expect(calls).toContainEqual({ method: "POST", path: "/agents/vesper/sessions", body: {} }),
    );
    const sent = await waitFor(() => {
      const c = calls.find((x) => x.method === "POST" && x.path.endsWith("/messages"));
      if (!c) throw new Error("no message yet");
      return c;
    });
    expect(sent.path).not.toBe(`/sessions/${old.session.id}/messages`);
    expect(sent.body).toEqual({ text: "Tell me the score" });
    const sessionId = sent.path.split("/")[2] ?? "";
    // The panel becomes that conversation, and the reply streams into it.
    const chat = await within(comms()).findByRole("region", { name: /^Vesper · / });
    expect(within(chat).getByText("Tell me the score")).toBeInTheDocument();
    const runId = fake.sessions.get(sessionId)?.runs[0]?.id ?? "";
    emit({
      type: "run.delta",
      agentId: "vesper",
      sessionId,
      runId,
      ephemeral: true,
      payload: { text: "On it, Commander." },
    });
    expect(await within(chat).findByText("On it, Commander.")).toBeInTheDocument();
  });

  it("keeps the conversation until Give a new order, and the next order is a new session", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/");
    await map();
    await user.type(
      within(comms()).getByRole("textbox", { name: term("comms.order") }),
      "First{Enter}",
    );
    const chat = await within(comms()).findByRole("region", { name: /^Vesper · / });
    // No auto-advance back to chatter: the conversation stays put.
    expect(within(comms()).queryByRole("textbox", { name: term("comms.order") })).toBeNull();
    await user.click(within(chat).getByRole("button", { name: term("comms.newOrder") }));
    const box = await within(comms()).findByRole("textbox", { name: term("comms.order") });
    await user.type(box, "Second{Enter}");
    await within(comms()).findByRole("region", { name: /^Vesper · / });
    const created = calls.filter(
      (c) => c.method === "POST" && c.path === "/agents/vesper/sessions",
    );
    expect(created).toHaveLength(2);
    const messages = calls.filter((c) => c.method === "POST" && c.path.endsWith("/messages"));
    expect(new Set(messages.map((m) => m.path)).size).toBe(2);
  });

  it("gives the next order the model and reasoning chosen under the order box", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/");
    await map();
    const picker = within(comms()).getByRole("group", { name: term("model.settings") });
    await choose(user, picker, term("model.model"), /^Claude Opus 5\.5,/);
    await choose(user, picker, term("model.reasoning"), /^High,/);
    await user.type(
      within(comms()).getByRole("textbox", { name: term("comms.order") }),
      "Plan it{Enter}",
    );
    const patch = await waitFor(() => {
      const c = calls.find((x) => x.method === "PATCH" && x.path.startsWith("/sessions/"));
      if (!c) throw new Error("no settings yet");
      return c;
    });
    expect(patch.body).toEqual({
      modelSettings: { model: "anthropic/claude-opus-5.5", reasoning: "high" },
    });
    const order = calls.indexOf(patch);
    const message = calls.findIndex((c) => c.method === "POST" && c.path.endsWith("/messages"));
    expect(order).toBeLessThan(message);
  });

  it("remembers the open order across a reload, and drops one whose session is gone", async () => {
    const fake = fakeApi();
    const s = fake.seedSession("vesper", "Score");
    localStorage.setItem("outerworld.overseerOrder", s.session.id);
    const first = renderApp("/", fake);
    await map();
    expect(await within(comms()).findByRole("region", { name: "Vesper · Score" })).toBeVisible();
    first.unmount();
    localStorage.setItem("outerworld.overseerOrder", "gone");
    renderApp("/", fakeApi());
    await map();
    expect(
      await within(comms()).findByRole("textbox", { name: term("comms.order") }),
    ).toBeInTheDocument();
  });
});

describe("Scanner folding", () => {
  it("folds the scanner to its strip, giving comms the column, and remembers it", async () => {
    const user = userEvent.setup();
    const first = renderApp("/");
    await map();
    const scanner = screen.getByRole("region", { name: term("scanner.title") });
    const column = scanner.parentElement as HTMLElement;
    expect(column.className).toMatch(/grid-rows-\[minmax\(0,1\.5fr\)_minmax\(0,2fr\)\]/);
    await user.click(within(scanner).getByRole("button", { name: term("scanner.collapse") }));
    expect(column.className).toMatch(/grid-rows-\[minmax\(0,1fr\)_auto\]/);
    expect(within(scanner).queryByRole("group", { name: term("scanner.view") })).toBeNull();
    first.unmount();
    renderApp("/");
    await map();
    const again = screen.getByRole("region", { name: term("scanner.title") });
    expect(within(again).getByRole("button", { name: term("scanner.expand") })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});

describe("Crew comms", () => {
  const crewTab = () => screen.getByRole("tab", { name: term("comms.crew.title") });

  it("is a second comms tab: a crew dropdown, then the chosen crew member's sessions", async () => {
    const fake = fakeApi();
    fake.seedSession("quill", "Hub audit");
    const user = userEvent.setup();
    const { container } = renderApp("/", fake);
    await map();
    expect(screen.getByRole("tab", { name: term("comms.title") })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.click(crewTab());
    expect(crewTab()).toHaveAttribute("aria-selected", "true");
    const panel = screen.getByRole("tabpanel", { name: term("comms.crew.title") });
    // The scanner's dropdown: grouped by room, each crew member drawn as their character.
    const picker = within(panel).getByRole("button", { name: /^Crew · 2/ });
    await user.click(picker);
    const options = within(panel).getAllByRole("option");
    expect(options.map((o) => o.getAttribute("aria-label"))).toEqual([
      "Vesper (Overseer) · Idle, Command",
      "Quill · Idle, Operations",
    ]);
    for (const o of options) expect(o.querySelector("[data-look] svg")).not.toBeNull();
    await user.click(within(panel).getByRole("option", { name: /^Quill/ }));
    expect(picker).toHaveAccessibleName("Crew · 2 Quill · Idle");
    const sessions = await within(panel).findByRole("region", { name: "Sessions · Quill" });
    expect(await within(sessions).findByText("Hub audit")).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("opens a session across the whole panel with a back button, and goes back to the list", async () => {
    const fake = fakeApi();
    const seeded = fake.seedSession("vesper", "Launch plan");
    const user = userEvent.setup();
    renderApp("/", fake);
    await map();
    await user.click(crewTab());
    const panel = screen.getByRole("tabpanel", { name: term("comms.crew.title") });
    await user.click(await within(panel).findByRole("button", { name: "Launch plan" }));
    const chat = await within(panel).findByRole("region", { name: /Vesper · Launch plan/ });
    const back = within(chat).getByRole("button", { name: term("comms.back") });
    await waitFor(() => expect(back).toHaveFocus());
    expect(within(panel).queryByRole("button", { name: /^Crew · / })).toBeNull();
    expect(within(chat).getByRole("textbox")).toBeInTheDocument();
    await user.click(back);
    const again = await within(panel).findByRole("button", { name: "Launch plan" });
    await waitFor(() => expect(again).toHaveFocus());
    expect(again).toHaveAttribute("data-session", seeded.session.id);
  });

  it("leaves focus in the message box when the panel refreshes", async () => {
    const fake = fakeApi();
    const seeded = fake.seedSession("vesper", "Launch plan");
    const user = userEvent.setup();
    const { emit } = renderApp("/", fake);
    await map();
    await user.click(crewTab());
    const panel = screen.getByRole("tabpanel", { name: term("comms.crew.title") });
    await user.click(await within(panel).findByRole("button", { name: "Launch plan" }));
    const chat = await within(panel).findByRole("region", { name: /Vesper · Launch plan/ });
    const back = within(chat).getByRole("button", { name: term("comms.back") });
    await waitFor(() => expect(back).toHaveFocus());
    const box = within(chat).getByRole("textbox");
    await user.click(box);
    // A run event refetches the session list, which rerenders the crew comms panel.
    emit({
      type: "run.completed",
      agentId: "vesper",
      sessionId: seeded.session.id,
      runId: "r-refresh",
      payload: {},
    });
    await waitFor(() =>
      expect(fake.calls.filter((c) => c.path === "/agents/vesper/sessions").length).toBeGreaterThan(
        1,
      ),
    );
    expect(box).toHaveFocus();
  });

  it("keeps Back when a session fails to load", async () => {
    const fake = fakeApi();
    const seeded = fake.seedSession("vesper", "Gone");
    const user = userEvent.setup();
    renderApp("/", fake);
    await map();
    await user.click(crewTab());
    const panel = screen.getByRole("tabpanel", { name: term("comms.crew.title") });
    const open = await within(panel).findByRole("button", { name: "Gone" });
    fake.sessions.delete(seeded.session.id);
    await user.click(open);
    expect(await within(panel).findByText(/no session/)).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: term("comms.back") }));
    expect(await within(panel).findByRole("button", { name: /^Crew · / })).toBeInTheDocument();
  });

  it("keeps focus in the message box while the station updates around it", async () => {
    const fake = fakeApi();
    fake.seedSession("vesper", "Launch plan");
    const user = userEvent.setup();
    const { emit, client } = renderApp("/", fake);
    await map();
    await user.click(crewTab());
    const panel = screen.getByRole("tabpanel", { name: term("comms.crew.title") });
    await user.click(await within(panel).findByRole("button", { name: "Launch plan" }));
    const chat = await within(panel).findByRole("region", { name: /Vesper · Launch plan/ });
    await waitFor(() =>
      expect(within(chat).getByRole("button", { name: term("comms.back") })).toHaveFocus(),
    );
    const box = within(chat).getByRole("textbox");
    await user.click(box);
    await user.type(box, "Hel");
    // Live events refetch the station and dashboard: the chat re-renders, focus must stay put.
    const quill = fake.state.agents.get("quill");
    if (quill) quill.config = { ...quill.config, name: "Quill II" };
    emit({ type: "agent.updated", agentId: "quill", payload: {} } as never);
    await client.invalidateQueries();
    await waitFor(() => expect(screen.getAllByText(/Quill II/).length).toBeGreaterThan(0));
    expect(box).toHaveFocus();
    await user.keyboard("lo");
    expect(box).toHaveFocus();
    expect(box).toHaveValue("Hello");
  });

  it("starts a new session and opens it", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/");
    await map();
    await user.click(crewTab());
    const panel = screen.getByRole("tabpanel", { name: term("comms.crew.title") });
    await user.click(await within(panel).findByRole("button", { name: term("comms.new") }));
    expect(
      await within(panel).findByRole("region", { name: /Vesper · New session/ }),
    ).toBeVisible();
    expect(calls).toContainEqual({ method: "POST", path: "/agents/vesper/sessions", body: {} });
  });
});

describe("Station split", () => {
  it("resizes the map against the comms column from the handle, kept per viewer", async () => {
    localStorage.removeItem("outerworld.split");
    const user = userEvent.setup();
    const { container } = renderApp("/");
    await map();
    const handle = screen.getByRole("separator", { name: term("station.resize") });
    const grid = () => container.querySelector<HTMLElement>("[style*='--st-station-cols']");
    expect(handle).toHaveAttribute("aria-valuenow", "33");
    expect(handle).toHaveAttribute("aria-valuemin", "25");
    expect(handle).toHaveAttribute("aria-valuemax", "50");
    // happy-dom lays nothing out, so give the row a width for the pixel-to-fr conversion.
    vi.spyOn(grid() as HTMLElement, "clientWidth", "get").mockReturnValue(1200);
    handle.focus();
    await user.keyboard("{ArrowLeft}");
    expect(Number(handle.getAttribute("aria-valuenow"))).toBeGreaterThan(33);
    expect(grid()?.style.getPropertyValue("--st-station-cols")).toBe(
      "minmax(0,1.940fr) auto minmax(0,1.060fr)",
    );
    expect(localStorage.getItem("outerworld.split")).toBe("1.06");
    await user.keyboard("{Enter}");
    expect(handle).toHaveAttribute("aria-valuenow", "33");
    expect(await axe(container)).toHaveNoViolations();
    localStorage.removeItem("outerworld.split");
  });
});
