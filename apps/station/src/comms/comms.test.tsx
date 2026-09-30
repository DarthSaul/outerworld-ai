import { term } from "@darthsaul/outerworld-ai-core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { fakeApi, renderApp } from "../test/fake-daemon.js";

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
    expect(await within(chat).findByText("All clear.")).toHaveAttribute(
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

  it("offers Cancel while a run is active, and sends nothing new until it ends", async () => {
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
    expect(within(chat).getByRole("button", { name: term("comms.send") })).toBeDisabled();
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

describe("Settings", () => {
  it("says which models runs use and that no key is set", async () => {
    renderApp("/settings");
    expect(await screen.findByText(term("settings.model.fake"))).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Key status" })).toHaveTextContent(
      term("settings.key.none"),
    );
  });

  it("saves a key through a password field and then reports it stored, never showing it", async () => {
    const user = userEvent.setup();
    const { calls, container } = renderApp("/settings");
    const field = await screen.findByLabelText(term("settings.key.new"));
    expect(field).toHaveAttribute("type", "password");
    await user.type(field, "sk-or-v1-secret");
    await user.click(screen.getByRole("button", { name: term("settings.key.save") }));
    expect(calls.find((c) => c.method === "PUT")?.body).toEqual({ key: "sk-or-v1-secret" });
    await waitFor(() =>
      expect(screen.getByRole("status", { name: "Key status" })).toHaveTextContent(
        term("settings.key.keychain"),
      ),
    );
    expect(field).toHaveValue("");
    expect(container.textContent).not.toContain("sk-or-v1-secret");
  });

  it("shows the daemon's refusal of a bad key", async () => {
    const user = userEvent.setup();
    renderApp("/settings");
    await user.type(await screen.findByLabelText(term("settings.key.new")), "nope");
    await user.click(screen.getByRole("button", { name: term("settings.key.save") }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "OpenRouter did not accept this key",
    );
  });

  it("removes a stored key", async () => {
    const user = userEvent.setup();
    const fake = fakeApi();
    fake.settings.openrouter = { configured: true, source: "keychain" };
    const { calls } = renderApp("/settings", fake);
    await user.click(await screen.findByRole("button", { name: term("settings.key.remove") }));
    expect(calls).toContainEqual({ method: "DELETE", path: "/settings/openrouter" });
  });

  it("has no axe violations", async () => {
    const { container } = renderApp("/settings");
    await screen.findByText(term("settings.model.fake"));
    expect(await axe(container)).toHaveNoViolations();
  });
});
