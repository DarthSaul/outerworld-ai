import { term } from "@darthsaul/outerworld-ai-core";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { ApiError } from "../lib/api.js";
import { fakeApi, renderApp } from "../test/fake-daemon.js";
import { choose } from "../test/menus.js";

const at = "2026-10-01T09:00:00.000Z";

const map = () => screen.findByRole("region", { name: term("map.title") });
const scanner = () => screen.getByRole("region", { name: term("scanner.title") });
const comms = () => screen.getByRole("region", { name: term("comms") });
const crewColumn = () => screen.getByRole("region", { name: term("agents") });
/** The COMMS message box when no session is open: "Message Vesper…". */
const composer = (name = "Vesper") =>
  within(comms()).getByRole("textbox", { name: `Message ${name}…` });
const grid = (container: HTMLElement) =>
  container.querySelector<HTMLElement>("[style*='--st-station-cols']");

const withLane = () => {
  const fake = fakeApi();
  fake.state.station = {
    ...fake.state.station,
    lanes: [{ id: "operations-to-command", from: "operations", to: "command", note: "Briefings" }],
  };
  return fake;
};

describe("Station map", () => {
  // The scanner starts folded (ADR-0018); these read it, so it starts open here.
  beforeEach(() => localStorage.setItem("outerworld.scanner", "open"));

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
  // The scanner starts folded (ADR-0018); these read it, so it starts open here.
  beforeEach(() => localStorage.setItem("outerworld.scanner", "open"));

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
  // The scanner starts folded (ADR-0018); these read it, so it starts open here.
  beforeEach(() => localStorage.setItem("outerworld.scanner", "open"));

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

describe("COMMS", () => {
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

  it("starts a new session with the Overseer by default and streams it in the panel", async () => {
    const user = userEvent.setup();
    const fake = fakeApi();
    const old = fake.seedSession("vesper", "Chat");
    const { calls, emit } = renderApp("/", fake);
    await map();
    expect(within(comms()).getByRole("button", { name: /^Answering Vesper/ })).toBeInTheDocument();
    await user.type(composer(), "Tell me the score{Enter}");
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

  it("lets go of a session it started once the list has it, so archiving it closes COMMS", async () => {
    const user = userEvent.setup();
    const fake = fakeApi();
    const { calls, emit } = renderApp("/", fake);
    await map();
    await user.type(composer(), "Plan the week{Enter}");
    const sent = await waitFor(() => {
      const c = calls.find((x) => x.method === "POST" && x.path.endsWith("/messages"));
      if (!c) throw new Error("no message yet");
      return c;
    });
    const sessionId = sent.path.split("/")[2] ?? "";
    // The list picks it up, then it is archived elsewhere.
    emit({ type: "session.created", agentId: "vesper", sessionId, payload: { title: "x" } });
    await within(crewColumn()).findByRole("button", { name: /New session/ });
    const entry = fake.sessions.get(sessionId);
    if (entry) entry.session = { ...entry.session, archivedAt: at };
    emit({ type: "session.archived", agentId: "vesper", sessionId, payload: {} });
    await waitFor(() => expect(composer()).toBeInTheDocument());
  });

  it("lets go of a session it started that is archived before the list ever has it", async () => {
    const user = userEvent.setup();
    const fake = fakeApi();
    const { calls, emit } = renderApp("/", fake);
    await map();
    // The station-wide list never refetches from here on: it never includes the new session.
    const get = fake.api.get;
    const held = new Promise<never>(() => {});
    fake.api.get = async <T,>(path: string) => (path === "/sessions" ? held : get<T>(path));
    await user.type(composer(), "Plan the week{Enter}");
    const sent = await waitFor(() => {
      const c = calls.find((x) => x.method === "POST" && x.path.endsWith("/messages"));
      if (!c) throw new Error("no message yet");
      return c;
    });
    const sessionId = sent.path.split("/")[2] ?? "";
    await within(comms()).findByRole("region", { name: /^Vesper · / });
    const entry = fake.sessions.get(sessionId);
    if (entry) entry.session = { ...entry.session, archivedAt: at };
    emit({ type: "session.archived", agentId: "vesper", sessionId, payload: {} });
    await waitFor(() => expect(composer()).toBeInTheDocument());
  });

  it("starts the conversation with whoever is picked in the agent row", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/");
    await map();
    await choose(user, comms(), term("comms.agent"), /^Quill/);
    await user.type(composer("Quill"), "Audit the hub{Enter}");
    await waitFor(() =>
      expect(calls).toContainEqual({ method: "POST", path: "/agents/quill/sessions", body: {} }),
    );
    expect(await within(comms()).findByRole("region", { name: /^Quill · / })).toBeVisible();
  });

  it("keeps the conversation until New, and the next message is a new session", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/");
    await map();
    await user.type(composer(), "First{Enter}");
    await within(comms()).findByRole("region", { name: /^Vesper · / });
    // No auto-advance back to chatter: the conversation stays put.
    expect(within(comms()).queryByRole("textbox", { name: "Message Vesper…" })).toBeNull();
    await user.click(
      within(crewColumn()).getByRole("button", { name: term("station.sessions.new") }),
    );
    await user.type(composer(), "Second{Enter}");
    await within(comms()).findByRole("region", { name: /^Vesper · / });
    const created = calls.filter(
      (c) => c.method === "POST" && c.path === "/agents/vesper/sessions",
    );
    expect(created).toHaveLength(2);
    const messages = calls.filter((c) => c.method === "POST" && c.path.endsWith("/messages"));
    expect(new Set(messages.map((m) => m.path)).size).toBe(2);
  });

  it("gives the new conversation the model and reasoning chosen under the message box", async () => {
    const user = userEvent.setup();
    const fake = fakeApi();
    const { calls } = renderApp("/", fake);
    await map();
    const picker = within(comms()).getByRole("group", { name: term("model.settings") });
    await choose(user, picker, term("model.model"), /^Claude Opus 5\.5,/);
    await choose(user, picker, term("model.reasoning"), /^High,/);
    await user.type(composer(), "Plan it{Enter}");
    const patch = await waitFor(() => {
      const c = calls.find((x) => x.method === "PATCH" && x.path.startsWith("/sessions/"));
      if (!c) throw new Error("no settings yet");
      return c;
    });
    expect(patch.body).toEqual({
      modelSettings: { model: "anthropic/claude-opus-5.5", reasoning: "high" },
    });
    // The message, to the session those settings were saved on, after them.
    const message = calls.findIndex(
      (c) => c.method === "POST" && c.path === `${patch.path}/messages`,
    );
    expect(message).toBeGreaterThan(-1);
    expect(calls.indexOf(patch)).toBeLessThan(message);
    const sessionId = patch.path.split("/")[2] ?? "";
    expect(fake.sessions.get(sessionId)?.runs[0]).toMatchObject({
      model: "anthropic/claude-opus-5.5",
      reasoning: "high",
    });
  });

  it("remembers the open session across a reload, and drops one that is gone", async () => {
    const fake = fakeApi();
    const s = fake.seedSession("vesper", "Score");
    // The key the Overseer's open order used before the three columns still opens it.
    localStorage.setItem("outerworld.overseerOrder", s.session.id);
    const first = renderApp("/", fake);
    await map();
    expect(await within(comms()).findByRole("region", { name: "Vesper · Score" })).toBeVisible();
    expect(localStorage.getItem("outerworld.overseerOrder")).toBeNull();
    first.unmount();
    localStorage.setItem("outerworld.commsSession", "gone");
    renderApp("/", fakeApi());
    await map();
    await waitFor(() => expect(composer()).toBeInTheDocument());
  });

  it("hands an open session to another crew member from the agent row", async () => {
    const user = userEvent.setup();
    const fake = fakeApi();
    const s = fake.seedSession("vesper", "Launch plan");
    localStorage.setItem("outerworld.commsSession", s.session.id);
    const { calls, container } = renderApp("/", fake);
    await map();
    await within(comms()).findByRole("region", { name: "Vesper · Launch plan" });
    await choose(user, comms(), term("comms.agent"), /^Quill/);
    expect(calls).toContainEqual({
      method: "PATCH",
      path: `/sessions/${s.session.id}`,
      body: { agentId: "quill" },
    });
    expect(
      await within(comms()).findByRole("region", { name: "Quill · Launch plan" }),
    ).toBeVisible();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("applies a pick made while a handover is still in flight, and sends after it lands", async () => {
    const user = userEvent.setup();
    const fake = fakeApi();
    const s = fake.seedSession("vesper", "Launch plan");
    localStorage.setItem("outerworld.commsSession", s.session.id);
    // Hold every PATCH until released, so the first handover is still in flight.
    let release = () => {};
    const held = new Promise<void>((r) => {
      release = r;
    });
    const send = fake.api.send;
    fake.api.send = async (method, path, body) => {
      if (method === "PATCH") await held;
      return send(method, path, body);
    };
    const { calls } = renderApp("/", fake);
    await map();
    await within(comms()).findByRole("region", { name: "Vesper · Launch plan" });
    await choose(user, comms(), term("comms.agent"), /^Quill/);
    // Back to Vesper before the first handover lands: not dropped as "already Vesper's".
    await choose(user, comms(), term("comms.agent"), /^Vesper/);
    await user.type(
      within(comms()).getByRole("textbox", { name: term("comms.placeholder") }),
      "Go{Enter}",
    );
    release();
    await waitFor(() =>
      expect(calls.filter((c) => c.method !== "GET").map((c) => [c.method, c.body])).toEqual([
        ["PATCH", { agentId: "quill" }],
        ["PATCH", { agentId: "vesper" }],
        ["POST", { text: "Go" }],
      ]),
    );
    expect(s.runs.at(-1)?.agentId).toBe("vesper");
  });

  it("does not send a message queued behind a handover that is refused", async () => {
    const user = userEvent.setup();
    const fake = fakeApi();
    const s = fake.seedSession("vesper", "Launch plan");
    localStorage.setItem("outerworld.commsSession", s.session.id);
    let release = () => {};
    const held = new Promise<void>((r) => {
      release = r;
    });
    const send = fake.api.send;
    fake.api.send = async <T,>(
      method: Parameters<typeof send>[0],
      path: string,
      body?: unknown,
    ) => {
      if (method === "PATCH") {
        await held;
        throw new ApiError(409, "the session has a run in progress", []);
      }
      return send<T>(method, path, body);
    };
    const { calls } = renderApp("/", fake);
    await map();
    await within(comms()).findByRole("region", { name: "Vesper · Launch plan" });
    await choose(user, comms(), term("comms.agent"), /^Quill/);
    const box = within(comms()).getByRole("textbox", { name: term("comms.placeholder") });
    await user.type(box, "Go{Enter}");
    release();
    expect(await within(comms()).findByText(term("comms.agent.notSent"))).toBeVisible();
    expect(calls.filter((c) => c.method === "POST")).toEqual([]);
    expect(box).toHaveValue("Go");
    expect(s.runs).toHaveLength(0);
  });

  it("shows the session's real owner once the handover settles, even if it changed again", async () => {
    const user = userEvent.setup();
    const fake = fakeApi();
    const s = fake.seedSession("vesper", "Launch plan");
    localStorage.setItem("outerworld.commsSession", s.session.id);
    // The handover lands, then another tab hands the session straight back before we refetch.
    const send = fake.api.send;
    fake.api.send = async <T,>(
      method: Parameters<typeof send>[0],
      path: string,
      body?: unknown,
    ) => {
      const out = await send<T>(method, path, body);
      if (method === "PATCH") s.session = { ...s.session, agentId: "vesper" };
      return out;
    };
    renderApp("/", fake);
    await map();
    await within(comms()).findByRole("region", { name: "Vesper · Launch plan" });
    await choose(user, comms(), term("comms.agent"), /^Quill/);
    await waitFor(() =>
      expect(
        within(comms()).getByRole("button", { name: /^Answering Vesper/ }),
      ).toBeInTheDocument(),
    );
  });

  it("leaves a refused handover's session exactly as it was", async () => {
    const fake = fakeApi();
    const worker = fake.seedSession("quill", "Worker");
    fake.dispatches.push({ workerSessionId: worker.session.id } as never);
    const before = { ...worker.session };
    await expect(
      fake.api.send("PATCH", `/sessions/${worker.session.id}`, {
        title: "Renamed",
        agentId: "vesper",
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      fake.api.send("PATCH", `/sessions/${worker.session.id}`, { title: "X", agentId: "nobody" }),
    ).rejects.toMatchObject({ status: 404 });
    expect(worker.session).toEqual(before);
  });

  it("keeps each earlier reply under the name of the crew member who wrote it", async () => {
    const fake = fakeApi();
    const s = fake.seedSession("quill", "Handed over");
    s.runs.push(
      {
        id: "r1",
        sessionId: s.session.id,
        agentId: "vesper",
        state: "completed",
        model: "m",
        createdAt: at,
        steps: 1,
      },
      {
        id: "r2",
        sessionId: s.session.id,
        agentId: "quill",
        state: "completed",
        model: "m",
        createdAt: at,
        steps: 1,
      },
    );
    s.messages.push(
      { role: "user", text: "Start" },
      { role: "assistant", text: "Vesper here." },
      { role: "user", text: "Next" },
      { role: "assistant", text: "Quill here." },
    );
    s.messageRuns = { 0: "r1", 1: "r1", 2: "r2", 3: "r2" };
    localStorage.setItem("outerworld.commsSession", s.session.id);
    renderApp("/", fake);
    await map();
    const chat = await within(comms()).findByRole("region", { name: "Quill · Handed over" });
    const replies = within(chat)
      .getAllByRole("listitem")
      .filter((li) => li.getAttribute("data-message") === "assistant");
    expect(replies.map((r) => r.textContent)).toEqual(["VesperVesper here.", "QuillQuill here."]);
  });

  it("won't switch crew mid-run or on dispatched work, and says why", async () => {
    const fake = fakeApi();
    const busy = fake.seedSession("vesper", "Busy");
    busy.runs.push({
      id: "r9",
      sessionId: busy.session.id,
      agentId: "vesper",
      state: "running",
      model: "m",
      createdAt: at,
      steps: 1,
    });
    localStorage.setItem("outerworld.commsSession", busy.session.id);
    const first = renderApp("/", fake);
    await map();
    expect(await within(comms()).findByText(term("comms.agent.busy"))).toBeInTheDocument();
    expect(within(comms()).queryByRole("button", { name: /^Answering/ })).toBeNull();
    first.unmount();
    const worker = fake.seedSession("quill", "From Vesper");
    fake.dispatches.push({
      id: "d1",
      leadAgentId: "vesper",
      leadSessionId: busy.session.id,
      leadRunId: "r9",
      workerAgentId: "quill",
      workerSessionId: worker.session.id,
      task: "Look it up",
      status: "running",
      createdAt: at,
    });
    localStorage.setItem("outerworld.commsSession", worker.session.id);
    renderApp("/", fake);
    await map();
    expect(await within(comms()).findByText(term("comms.agent.dispatched"))).toBeInTheDocument();
  });

  it("keeps focus in the message box while the station updates around it", async () => {
    const fake = fakeApi();
    fake.seedSession("vesper", "Launch plan");
    const user = userEvent.setup();
    const { emit, client } = renderApp("/", fake);
    await map();
    await user.click(await within(crewColumn()).findByRole("button", { name: "Launch plan" }));
    const chat = await within(comms()).findByRole("region", { name: /Vesper · Launch plan/ });
    const box = within(chat).getByRole("textbox");
    await user.click(box);
    await user.type(box, "Hel");
    // Live events refetch the station, dashboard, and session list: focus must stay put.
    const quill = fake.state.agents.get("quill");
    if (quill) quill.config = { ...quill.config, name: "Quill II" };
    emit({ type: "agent.updated", agentId: "quill", payload: {} } as never);
    emit({ type: "run.completed", agentId: "vesper", sessionId: "x", runId: "y", payload: {} });
    await client.invalidateQueries();
    await waitFor(() => expect(screen.getAllByText(/Quill II/).length).toBeGreaterThan(0));
    expect(box).toHaveFocus();
    await user.keyboard("lo");
    expect(box).toHaveFocus();
    expect(box).toHaveValue("Hello");
  });

  it("expands across the station and collapses back", async () => {
    const user = userEvent.setup();
    const { container } = renderApp("/");
    await map();
    await user.click(within(comms()).getByRole("button", { name: term("comms.expand") }));
    expect(grid(container)?.style.getPropertyValue("--st-station-cols")).toBe("minmax(0,1fr)");
    expect((await map()).parentElement?.className.split(" ").includes("desktop:hidden")).toBe(true);
    await user.click(within(comms()).getByRole("button", { name: term("comms.collapse") }));
    expect(grid(container)?.style.getPropertyValue("--st-station-cols")).toMatch(
      /^minmax\(0,1\.000fr\)/,
    );
  });
});

describe("Crew column", () => {
  it("lists the crew, and picking one scans them", async () => {
    localStorage.setItem("outerworld.scanner", "open");
    const user = userEvent.setup();
    const { container } = renderApp("/");
    await map();
    const roster = within(crewColumn()).getByRole("list", { name: term("agents") });
    expect(
      within(roster)
        .getAllByRole("button")
        .map((b) => b.getAttribute("aria-label")),
    ).toEqual(["Vesper", "Quill"]);
    expect(crewColumn()).toHaveTextContent("0 working");
    expect(crewColumn()).toHaveTextContent("2 idle");
    await user.click(within(roster).getByRole("button", { name: "Quill" }));
    expect(within(roster).getByRole("button", { name: "Quill" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(scanner()).toHaveTextContent("Crew member · Operations");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("lists every crew member's sessions, filters to dispatched ones, and opens one", async () => {
    const user = userEvent.setup();
    const fake = fakeApi();
    const lead = fake.seedSession("vesper", "Launch plan");
    const worker = fake.seedSession("quill", "Hub audit");
    fake.dispatches.push({
      id: "d1",
      leadAgentId: "vesper",
      leadSessionId: lead.session.id,
      leadRunId: "r1",
      workerAgentId: "quill",
      workerSessionId: worker.session.id,
      task: "Audit the hub",
      status: "completed",
      createdAt: at,
    });
    renderApp("/", fake);
    await map();
    const column = crewColumn();
    const audit = await within(column).findByRole("button", { name: "Hub audit" });
    expect(within(column).getByRole("button", { name: "Launch plan" })).toBeInTheDocument();
    expect(audit).toHaveTextContent(term("station.sessions.dispatchedTag"));
    await user.click(
      within(column).getByRole("button", { name: term("station.sessions.dispatched") }),
    );
    expect(within(column).queryByRole("button", { name: "Launch plan" })).toBeNull();
    expect(within(column).getByRole("button", { name: "Hub audit" })).toBeInTheDocument();
    await user.click(within(column).getByRole("button", { name: "Hub audit" }));
    expect(await within(comms()).findByRole("region", { name: "Quill · Hub audit" })).toBeVisible();
    expect(within(column).getByRole("button", { name: "Hub audit" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("folds to a folder tab that gives the map its share, and remembers it", async () => {
    const user = userEvent.setup();
    const first = renderApp("/");
    await map();
    await user.click(
      within(crewColumn()).getByRole("button", { name: term("station.crew.collapse") }),
    );
    const tab = screen.getByRole("button", { name: term("station.crew.expand") });
    expect(tab).toHaveAttribute("aria-expanded", "false");
    expect(grid(first.container)?.style.getPropertyValue("--st-station-cols")).toBe(
      "minmax(0,3.000fr) auto minmax(0,1.000fr)",
    );
    first.unmount();
    const again = renderApp("/");
    await map();
    await user.click(screen.getByRole("button", { name: term("station.crew.expand") }));
    expect(grid(again.container)?.style.getPropertyValue("--st-station-cols")).toBe(
      "minmax(0,1.000fr) auto minmax(0,2.000fr) auto minmax(0,1.000fr)",
    );
  });

  it("lists the Overseer first, wherever the station keeps them", async () => {
    const fake = fakeApi();
    // The daemon lists Quill before the Overseer.
    const entries = [...fake.state.agents.entries()].reverse();
    fake.state.agents.clear();
    for (const [k, v] of entries) fake.state.agents.set(k, v);
    renderApp("/", fake);
    await map();
    const roster = within(crewColumn()).getByRole("list", { name: term("agents") });
    await waitFor(() =>
      expect(
        within(roster)
          .getAllByRole("button")
          .map((b) => b.getAttribute("aria-label")),
      ).toEqual(["Vesper", "Quill"]),
    );
    // A thin rule under the Overseer sets them apart from the rest of the crew.
    const [overseer, quill] = within(roster).getAllByRole("listitem");
    expect(overseer?.className).toMatch(/\bborder-b\b/);
    expect(quill?.className ?? "").not.toMatch(/\bborder-b\b/);
  });
});

describe("Scanner folding", () => {
  it("starts folded, opens to at most half the column, and remembers it", async () => {
    const user = userEvent.setup();
    const first = renderApp("/");
    await map();
    const folded = scanner();
    expect(within(folded).getByRole("button", { name: term("scanner.expand") })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(within(folded).queryByRole("group", { name: term("scanner.view") })).toBeNull();
    await user.click(within(folded).getByRole("button", { name: term("scanner.expand") }));
    expect(scanner().className).toMatch(/desktop:max-h-1\/2/);
    expect(within(scanner()).getByRole("group", { name: term("scanner.view") })).toBeVisible();
    first.unmount();
    renderApp("/");
    await map();
    expect(
      within(scanner()).getByRole("button", { name: term("scanner.collapse") }),
    ).toHaveAttribute("aria-expanded", "true");
  });
});

describe("Station split", () => {
  it("resizes the map against the comms column from the handle, kept per viewer", async () => {
    localStorage.removeItem("outerworld.split");
    const user = userEvent.setup();
    const { container } = renderApp("/");
    await map();
    const handle = screen.getByRole("separator", { name: term("station.resize") });
    expect(handle).toHaveAttribute("aria-valuenow", "25");
    // happy-dom lays nothing out, so give the row a width for the pixel-to-fr conversion.
    vi.spyOn(grid(container) as HTMLElement, "clientWidth", "get").mockReturnValue(1600);
    handle.focus();
    await user.keyboard("{ArrowLeft}");
    expect(Number(handle.getAttribute("aria-valuenow"))).toBeGreaterThan(25);
    expect(grid(container)?.style.getPropertyValue("--st-station-cols")).toBe(
      "minmax(0,1.000fr) auto minmax(0,1.940fr) auto minmax(0,1.060fr)",
    );
    expect(localStorage.getItem("outerworld.split")).toBe("1.06");
    await user.keyboard("{Enter}");
    expect(handle).toHaveAttribute("aria-valuenow", "25");
    expect(await axe(container)).toHaveNoViolations();
    localStorage.removeItem("outerworld.split");
  });

  it("keeps each handle's starting width its own when both are dragged at once", async () => {
    localStorage.setItem("outerworld.crewSplit", "1.25");
    localStorage.setItem("outerworld.split", "0.75");
    const { container } = renderApp("/");
    await map();
    vi.spyOn(grid(container) as HTMLElement, "clientWidth", "get").mockReturnValue(1600);
    const crew = screen.getByRole("separator", { name: term("station.resize.crew") });
    const comms = screen.getByRole("separator", { name: term("station.resize") });
    // Two fingers: crew's drag starts, then comms' starts before crew's moves.
    fireEvent.pointerDown(crew, { button: 0, clientX: 400, pointerId: 1 });
    fireEvent.pointerDown(comms, { button: 0, clientX: 1200, pointerId: 2 });
    fireEvent.pointerMove(window, { clientX: 400 + 100, pointerId: 1 });
    // 1.25 + 0.25: from crew's own start, not from comms' 0.75.
    expect(localStorage.getItem("outerworld.crewSplit")).toBe("1.5");
    fireEvent.pointerMove(window, { clientX: 1200 - 100, pointerId: 2 });
    expect(localStorage.getItem("outerworld.split")).toBe("1");
    fireEvent.pointerUp(window, { pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 2 });
    localStorage.removeItem("outerworld.crewSplit");
    localStorage.removeItem("outerworld.split");
  });

  it("resizes the crew column against the map from its own handle, kept per viewer", async () => {
    localStorage.removeItem("outerworld.crewSplit");
    const user = userEvent.setup();
    const { container } = renderApp("/");
    await map();
    const handle = screen.getByRole("separator", { name: term("station.resize.crew") });
    expect(handle).toHaveAttribute("aria-valuenow", "25");
    vi.spyOn(grid(container) as HTMLElement, "clientWidth", "get").mockReturnValue(1600);
    // Dragged from where it began: 100px right is a quarter fr, wherever the pointer went between.
    fireEvent.pointerDown(handle, { button: 0, clientX: 400, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 450, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 500, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(grid(container)?.style.getPropertyValue("--st-station-cols")).toBe(
      "minmax(0,1.250fr) auto minmax(0,1.750fr) auto minmax(0,1.000fr)",
    );
    expect(localStorage.getItem("outerworld.crewSplit")).toBe("1.25");
    // Released: moving on changes nothing.
    fireEvent.pointerMove(window, { clientX: 900, pointerId: 1 });
    expect(localStorage.getItem("outerworld.crewSplit")).toBe("1.25");
    handle.focus();
    await user.keyboard("{Enter}");
    expect(handle).toHaveAttribute("aria-valuenow", "25");
    // A folded crew column has no handle.
    await user.click(
      within(crewColumn()).getByRole("button", { name: term("station.crew.collapse") }),
    );
    expect(screen.queryByRole("separator", { name: term("station.resize.crew") })).toBeNull();
    localStorage.removeItem("outerworld.crewSplit");
  });
});
