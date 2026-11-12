import { term } from "@darthsaul/outerworld-ai-core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { fakeApi, renderApp } from "../test/fake-daemon.js";
import { choose, menu } from "../test/menus.js";

/** Opens COMMS on Vesper and starts a session; returns the chat window. */
const startChat = async (fake = fakeApi()) => {
  const user = userEvent.setup();
  const app = renderApp("/comms", fake);
  await user.click(await screen.findByRole("button", { name: "Vesper" }));
  await user.click(await screen.findByRole("button", { name: term("comms.new") }));
  const chat = await screen.findByRole("region", { name: /Vesper · New session/ });
  return { ...app, user, chat };
};

describe("COMMS", () => {
  it("asks you to pick a crew member first", async () => {
    renderApp("/comms");
    expect(await screen.findByText(term("comms.pick.title"))).toBeInTheDocument();
  });

  it("heads the conversation side like the crew list, with the next step full width under it", async () => {
    const { container } = renderApp("/comms");
    const side = await screen.findByRole("region", { name: term("comms.session.heading") });
    const heading = within(side).getByRole("heading", {
      level: 2,
      name: term("comms.session.heading"),
    });
    const crewHeading = within(screen.getByRole("navigation", { name: term("agents") })).getByRole(
      "heading",
      { level: 2, name: term("agents") },
    );
    // Same header style on both sides, so the first card on each lines up under it.
    expect(heading.className).toBe(crewHeading.className);
    const empty = within(side).getByText(term("comms.pick.title")).closest("[role=status]");
    expect(empty?.parentElement).toBe(side);
    expect(side.className).toMatch(/flex-col/);
    expect(side.className).not.toMatch(/items-start/);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("starts a session with the chosen crew member and opens its window", async () => {
    const { chat, calls } = await startChat();
    expect(calls.some((c) => c.method === "POST" && c.path === "/agents/vesper/sessions")).toBe(
      true,
    );
    expect(within(chat).getByText(term("comms.empty.title"))).toBeInTheDocument();
  });

  it("sends a message, streams the reply live, then shows the stored reply once the run ends", async () => {
    const { chat, user, calls, sessions, emit } = await startChat();
    await user.type(within(chat).getByRole("textbox"), "Status?");
    await user.click(within(chat).getByRole("button", { name: term("comms.send") }));
    const sent = calls.find((c) => c.path.endsWith("/messages"));
    expect(sent?.body).toEqual({ text: "Status?" });
    const ids = { agentId: "vesper", sessionId: "s1", runId: "r2" };
    emit({ type: "run.queued", ...ids, payload: { trigger: "user" } });
    await within(chat).findByText("Status?");
    expect(within(chat).getByRole("status", { name: "Run" })).toHaveTextContent(
      term("runState.running"),
    );

    emit({ type: "run.delta", ...ids, ephemeral: true, payload: { text: "All " } });
    emit({ type: "run.delta", ...ids, ephemeral: true, payload: { text: "clear." } });
    expect((await within(chat).findByText("All clear.")).closest("[data-message]")).toHaveAttribute(
      "data-message",
      "streaming",
    );

    const entry = sessions.get("s1");
    if (entry) {
      entry.messages.push({ role: "assistant", text: "All clear." });
      entry.runs = entry.runs.map((r) => ({ ...r, state: "completed" as const }));
    }
    emit({ type: "run.completed", ...ids, payload: {} });
    await waitFor(() =>
      expect(within(chat).getByText("All clear.").closest("[data-message]")).toHaveAttribute(
        "data-message",
        "assistant",
      ),
    );
    expect(within(chat).getByRole("status", { name: "Run" })).toHaveTextContent(
      term("runState.completed"),
    );
  });

  it("offers Cancel while a run is active, and turns the message box into a direction", async () => {
    const { chat, user, calls, emit } = await startChat();
    await user.type(within(chat).getByRole("textbox"), "Go");
    await user.click(within(chat).getByRole("button", { name: term("comms.send") }));
    emit({
      type: "run.queued",
      agentId: "vesper",
      sessionId: "s1",
      runId: "r2",
      payload: { trigger: "user" },
    });
    const cancel = await within(chat).findByRole("button", { name: term("comms.cancel") });
    expect(
      within(chat).queryByRole("button", { name: term("comms.send") }),
    ).not.toBeInTheDocument();
    expect(within(chat).getByText(term("comms.direct.hint"))).toBeInTheDocument();
    await user.type(within(chat).getByRole("textbox"), "Keep it short");
    await user.click(within(chat).getByRole("button", { name: term("comms.direct") }));
    expect(calls).toContainEqual({
      method: "POST",
      path: "/runs/r2/steer",
      body: { text: "Keep it short" },
    });
    expect(calls.filter((c) => c.path.endsWith("/messages"))).toHaveLength(1);
    await user.click(cancel);
    expect(calls).toContainEqual({ method: "POST", path: "/runs/r2/cancel" });
  });

  it("shows why a run failed, and names an interrupted run plainly", async () => {
    const fake = fakeApi();
    const { chat, user, sessions, emit } = await startChat(fake);
    await user.type(within(chat).getByRole("textbox"), "Hi");
    await user.click(within(chat).getByRole("button", { name: term("comms.send") }));
    const entry = sessions.get("s1");
    if (entry) {
      entry.runs = entry.runs.map((r) => ({
        ...r,
        state: "failed" as const,
        error: "No OpenRouter key: add one in Settings",
      }));
    }
    emit({
      type: "run.failed",
      agentId: "vesper",
      sessionId: "s1",
      runId: "r2",
      payload: { error: "x" },
    });
    expect(await within(chat).findByText(/No OpenRouter key/)).toBeInTheDocument();
    expect(term("runState.interrupted")).toMatch(/daemon stopped/);
  });

  it("shows tool use and refusals in the transcript", async () => {
    const fake = fakeApi();
    const { chat, sessions, emit } = await startChat(fake);
    const entry = sessions.get("s1");
    entry?.messages.push(
      { role: "user", text: "Look it up" },
      { role: "assistant", text: "", toolCalls: [{ id: "c1", name: "web_fetch", input: {} }] },
      { role: "tool", toolCallId: "c1", name: "web_fetch", output: { text: "page" } },
      { role: "tool", toolCallId: "c2", name: "write_file", output: "not granted", isError: true },
    );
    emit({
      type: "session.renamed",
      agentId: "vesper",
      sessionId: "s1",
      payload: { title: "New session" },
    });
    const tools = await within(chat).findAllByText(/web_fetch|write_file/);
    expect(tools.map((t) => t.textContent)).toEqual([
      "→ web_fetch",
      `web_fetch ${term("comms.tool.call")}`,
      `write_file ${term("comms.tool.error")}: not granted`,
    ]);
  });

  it("shows who you are talking to: room, role, status, approval, model, and spend", async () => {
    const user = userEvent.setup();
    const fake = fakeApi();
    fake.spend.agents = { quill: 0.42 };
    renderApp("/comms", fake);
    await user.click(await screen.findByRole("button", { name: "Quill" }));
    const profile = await screen.findByRole("region", { name: "About Quill" });
    const facts = Object.fromEntries(
      [...profile.querySelectorAll("dt")].map((dt) => [
        dt.textContent,
        dt.nextElementSibling?.textContent,
      ]),
    );
    expect(facts).toMatchObject({
      [term("comms.profile.role")]: term("agent"),
      [term("comms.profile.status")]: term("crewStatus.idle"),
      [term("comms.profile.approval")]: term("approvalMode.full"),
      [term("comms.profile.model")]: "anthropic/claude-sonnet-5.5",
      [term("comms.profile.spend")]: "$0.42",
    });
    expect(within(profile).getByText("Operations")).toBeInTheDocument();
    expect(within(profile).getByRole("link", { name: /Crew file/ })).toHaveAttribute(
      "href",
      "/crew/quill",
    );
  });

  it("lists sessions with their title, last line, size, and when, and follows a new title", async () => {
    const { user, sessions, emit } = await startChat();
    await user.type(
      within(screen.getByRole("region", { name: /Vesper · New session/ })).getByRole("textbox"),
      "Plan the launch",
    );
    await user.keyboard("{Enter}");
    const entry = sessions.get("s1");
    if (entry) {
      entry.messages.push({ role: "assistant", text: "Here is a plan." });
      entry.session = { ...entry.session, title: "Launch plan" };
    }
    emit({
      type: "session.renamed",
      agentId: "vesper",
      sessionId: "s1",
      payload: { title: "Launch plan" },
    });
    const list = screen.getByRole("region", { name: term("comms.sessions") });
    const item = await within(list).findByRole("button", { name: "Launch plan" });
    expect(item).toHaveAccessibleDescription(/Vesper: Here is a plan\./);
    expect(item).toHaveAccessibleDescription(/2 messages/);
    expect(item).toHaveAccessibleDescription(new RegExp(term("comms.session.working")));
    expect(within(item).getByRole("time")).toHaveAttribute("datetime", "2026-09-29T12:05:00.000Z");
    expect(item).toHaveAttribute("aria-current", "true");
  });

  it("keeps several chat windows open at once", async () => {
    const { user } = await startChat();
    await user.click(screen.getByRole("button", { name: "Quill" }));
    await user.click(screen.getByRole("button", { name: term("comms.new") }));
    expect(await screen.findByRole("region", { name: /Quill · New session/ })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /Vesper · New session/ })).toBeInTheDocument();
  });

  it("closes and archives a window", async () => {
    const { chat, user, calls } = await startChat();
    await user.click(within(chat).getByRole("button", { name: term("comms.archive") }));
    expect(calls).toContainEqual({
      method: "PATCH",
      path: "/sessions/s1",
      body: { archived: true },
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: /Vesper · New session/ }),
      ).not.toBeInTheDocument(),
    );
  });

  it("has no axe violations with a window open", async () => {
    const { container } = await startChat();
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("COMMS: reading a conversation", () => {
  it("puts your messages on the right, the crew member's work on the left, as Markdown", async () => {
    const fake = fakeApi();
    const entry = fake.seedSession("vesper", "Plan");
    entry.messages.push(
      { role: "user", text: "Any **risks**?" },
      { role: "assistant", text: "Two **caveats**:\n\n- budget\n- timing" },
    );
    const user = userEvent.setup();
    renderApp(`/comms?agent=vesper&open=${entry.session.id}`, fake);
    const chat = await screen.findByRole("region", { name: /Vesper · Plan/ });
    const mine = await within(chat).findByText("Any **risks**?");
    expect(mine.closest("[data-message]")).toHaveAttribute("data-side", "right");
    const caveats = within(chat).getByText("caveats");
    expect(caveats.tagName).toBe("STRONG");
    expect(caveats.closest("[data-message]")).toHaveAttribute("data-side", "left");
    expect(within(chat).getAllByRole("listitem").length).toBeGreaterThanOrEqual(2);
    // Only the transcript scrolls, inside a window of bounded height.
    const transcript = chat.querySelector("[data-transcript]");
    expect(transcript?.className).toMatch(/overflow-y-auto/);
    expect(chat.className).toMatch(/max-h-/);
    void user;
  });

  it("keeps the crew, the chosen crew member, and their sessions in one column, lists scrolling", async () => {
    const fake = fakeApi();
    fake.seedSession("vesper", "One");
    const { container } = renderApp("/comms?agent=vesper", fake);
    const profile = await screen.findByRole("region", { name: /Vesper/ });
    const crewList = container.querySelector("[data-crew-list]");
    const sessions = container.querySelector("[data-session-list]");
    expect(crewList?.className).toMatch(/overflow-y-auto/);
    expect(sessions?.className).toMatch(/overflow-y-auto/);
    const column = crewList?.closest("nav")?.parentElement;
    expect(column?.contains(profile)).toBe(true);
    expect(column?.contains(sessions ?? null)).toBe(true);
    // Crew file sits at the far side of the card's top row, beside a 1× character.
    const link = within(profile).getByRole("link", { name: /Crew file/i });
    expect(link.parentElement?.lastElementChild).toBe(link);
    expect(profile.querySelector("svg")?.getAttribute("width")).toBe("20");
  });
});

describe("COMMS: model settings per conversation (ADR-0016)", () => {
  it("sits under the message box: the model with its reasoning, then the key", async () => {
    const { chat } = await startChat();
    const box = within(chat).getByRole("form", { name: "Message Vesper" });
    const picker = within(chat).getByRole("group", { name: term("model.settings") });
    // The settings row follows the message box, as in a chat app's composer.
    expect(box.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(box).getByRole("button", { name: term("comms.send") })).toBeInTheDocument();
    expect(menu(picker, term("model.model"))).toHaveTextContent("Claude Sonnet 5.5");
    expect(menu(picker, term("model.reasoning"))).toHaveTextContent(
      term("model.reasoning.default"),
    );
    expect(menu(picker, term("model.provider"))).toHaveTextContent(term("model.provider.auto"));
  });

  it("starts on the crew member's model, and saves a change to the conversation", async () => {
    const { chat, user, calls } = await startChat();
    const picker = within(chat).getByRole("group", { name: term("model.settings") });
    await user.click(menu(picker, term("model.model")));
    expect(
      within(picker).getByRole("option", { name: /^Claude Sonnet 5\.5, Crew member's default/ }),
    ).toHaveAttribute("aria-selected", "true");
    // The crew member's model shows once, as the default.
    expect(within(picker).getAllByRole("option", { name: /^Claude Sonnet 5\.5/ })).toHaveLength(1);
    const opus = await within(picker).findByRole("option", {
      name: /^Claude Opus 5\.5, For complex work/,
    });
    await user.click(opus);
    expect(calls).toContainEqual({
      method: "PATCH",
      path: "/sessions/s1",
      body: { modelSettings: { model: "anthropic/claude-opus-5.5" } },
    });
    await waitFor(() =>
      expect(menu(picker, term("model.model"))).toHaveTextContent("Claude Opus 5.5"),
    );
    await choose(user, picker, term("model.reasoning"), /^Extra high, Most thorough/);
    expect(calls.filter((c) => c.method === "PATCH").at(-1)?.body).toEqual({
      modelSettings: { model: "anthropic/claude-opus-5.5", reasoning: "xhigh" },
    });
  });

  it("goes back to the crew member's settings when every field is on its default", async () => {
    const { chat, user, calls } = await startChat();
    const picker = within(chat).getByRole("group", { name: term("model.settings") });
    await choose(user, picker, term("model.provider"), /^OpenRouter,/);
    await waitFor(() =>
      expect(menu(picker, term("model.provider"))).toHaveTextContent(
        term("model.provider.openrouter"),
      ),
    );
    await choose(user, picker, term("model.provider"), /^Auto,/);
    expect(calls.filter((c) => c.method === "PATCH").at(-1)?.body).toEqual({ modelSettings: null });
  });

  it("says where the next call goes, and warns when the chosen key is missing", async () => {
    const fake = fakeApi();
    fake.settings.modelMode = "live";
    fake.settings.anthropic = { configured: true, source: "keychain" };
    const { chat, user } = await startChat(fake);
    const picker = within(chat).getByRole("group", { name: term("model.settings") });
    await waitFor(() =>
      expect(picker).toHaveAccessibleDescription(
        `${term("model.via")} ${term("settings.route.anthropic")}`,
      ),
    );
    await choose(user, picker, term("model.provider"), /^OpenRouter,/);
    await waitFor(() =>
      expect(
        within(chat).getByRole("group", { name: term("model.settings") }),
      ).toHaveAccessibleDescription(term("settings.route.needs_openrouter")),
    );
  });

  it("has no axe violations, with a settings menu open", async () => {
    const { container, chat, user } = await startChat();
    const picker = within(chat).getByRole("group", { name: term("model.settings") });
    await user.click(menu(picker, term("model.model")));
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("Settings", () => {
  const orStatus = () =>
    screen.getByRole("status", { name: `${term("settings.key.openrouter")} status` });
  const orCard = () => screen.getByRole("region", { name: term("settings.key.openrouter") });

  it("opens on Providers in a side menu of sections", async () => {
    renderApp("/settings");
    const nav = await screen.findByRole("navigation", { name: term("settings.nav") });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual([
      term("settings.providers"),
      term("settings.models"),
      term("budgets"),
      term("connectors"),
      term("settings.appearance"),
    ]);
    await waitFor(() =>
      expect(within(nav).getByRole("link", { name: term("settings.providers") })).toHaveAttribute(
        "aria-current",
        "page",
      ),
    );
    expect(
      await screen.findByRole("region", { name: term("settings.key.anthropic") }),
    ).toBeInTheDocument();
    expect(orStatus()).toHaveTextContent(term("settings.key.none"));
  });

  it("sets the display size on Appearance, for this browser", async () => {
    const user = userEvent.setup();
    renderApp("/settings/appearance");
    const group = await screen.findByRole("group", { name: term("settings.display") });
    expect(within(group).getByRole("radio", { name: term("display.auto") })).toBeChecked();
    await user.click(within(group).getByRole("radio", { name: term("display.large") }));
    expect(document.documentElement.getAttribute("data-display")).toBe("large");
    expect(localStorage.getItem("outerworld.display")).toBe("large");
    await user.click(within(group).getByRole("radio", { name: term("display.auto") }));
    expect(document.documentElement.hasAttribute("data-display")).toBe(false);
    localStorage.clear();
  });

  it("switches the main panel when another section is chosen", async () => {
    const user = userEvent.setup();
    renderApp("/settings");
    const nav = await screen.findByRole("navigation", { name: term("settings.nav") });
    await user.click(within(nav).getByRole("link", { name: term("budgets") }));
    expect(await screen.findByRole("region", { name: term("budgets") })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: term("settings.key.openrouter") })).toBeNull();
  });

  it("says which models runs use, and where each model's calls go", async () => {
    const fake = fakeApi();
    fake.settings.modelMode = "live";
    fake.settings.anthropic = { configured: true, source: "keychain" };
    renderApp("/settings/models", fake);
    expect(await screen.findByText(term("settings.model.live"))).toBeInTheDocument();
    const row = (id: string) => document.querySelector(`[data-model="${id}"]`);
    await waitFor(() =>
      expect(row("anthropic/claude-sonnet-5.5")).toHaveTextContent(
        term("settings.route.anthropic"),
      ),
    );
    expect(row("openai/gpt-5.6-terra")).toHaveTextContent(term("settings.route.needs_openrouter"));
  });

  it("saves a key through a password field and then reports it stored, never showing it", async () => {
    const user = userEvent.setup();
    const { calls, container } = renderApp("/settings/providers");
    await screen.findByRole("navigation", { name: term("settings.nav") });
    const field = within(orCard()).getByLabelText(term("settings.key.new"));
    expect(field).toHaveAttribute("type", "password");
    await user.type(field, "sk-or-v1-secret");
    await user.click(within(orCard()).getByRole("button", { name: term("settings.key.save") }));
    expect(calls.find((c) => c.method === "PUT")).toEqual({
      method: "PUT",
      path: "/settings/openrouter",
      body: { key: "sk-or-v1-secret" },
    });
    await waitFor(() => expect(orStatus()).toHaveTextContent(term("settings.key.keychain")));
    expect(field).toHaveValue("");
    expect(container.textContent).not.toContain("sk-or-v1-secret");
  });

  it("saves an Anthropic key to its own endpoint", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/settings/providers");
    const card = await screen.findByRole("region", { name: term("settings.key.anthropic") });
    await user.type(within(card).getByLabelText(term("settings.key.new")), "sk-ant-api03-x");
    await user.click(within(card).getByRole("button", { name: term("settings.key.save") }));
    expect(calls).toContainEqual({
      method: "PUT",
      path: "/settings/anthropic",
      body: { key: "sk-ant-api03-x" },
    });
    await waitFor(() =>
      expect(
        within(card).getByRole("status", { name: `${term("settings.key.anthropic")} status` }),
      ).toHaveTextContent(term("settings.key.keychain")),
    );
  });

  it("shows the daemon's refusal of a bad key", async () => {
    const user = userEvent.setup();
    renderApp("/settings/providers");
    await screen.findByRole("navigation", { name: term("settings.nav") });
    await user.type(within(orCard()).getByLabelText(term("settings.key.new")), "nope");
    await user.click(within(orCard()).getByRole("button", { name: term("settings.key.save") }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "OpenRouter did not accept this key",
    );
  });

  it("removes a stored key", async () => {
    const user = userEvent.setup();
    const fake = fakeApi();
    fake.settings.openrouter = { configured: true, source: "keychain" };
    const { calls } = renderApp("/settings/providers", fake);
    await screen.findByRole("navigation", { name: term("settings.nav") });
    await user.click(within(orCard()).getByRole("button", { name: term("settings.key.remove") }));
    expect(calls).toContainEqual({ method: "DELETE", path: "/settings/openrouter" });
  });

  it("has no axe violations", async () => {
    const { container } = renderApp("/settings/providers");
    await screen.findByRole("navigation", { name: term("settings.nav") });
    expect(await axe(container)).toHaveNoViolations();
  });
});
