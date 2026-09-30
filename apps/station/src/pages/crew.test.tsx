import { term } from "@darthsaul/outerworld-ai-core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { fakeApi, renderApp } from "../test/fake-daemon.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Crew screen", () => {
  it("lists every room with its crew, the Overseer marked and Full power flagged", async () => {
    renderApp("/crew");
    const command = await screen.findByRole("region", { name: "Command" });
    expect(within(command).getByRole("link", { name: "Vesper" })).toBeInTheDocument();
    expect(within(command).getByText(term("overseer.role"))).toBeInTheDocument();
    const ops = screen.getByRole("region", { name: "Operations" });
    const quill = ops.querySelector('[data-agent="quill"]');
    expect(quill?.querySelector('[data-flag="full-power"]')).toHaveTextContent(
      term("approvalMode.full"),
    );
  });

  it("shows each room's props as toggles and places a prop with one click", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/crew");
    const ops = await screen.findByRole("region", { name: "Operations" });
    const web = within(ops).getByRole("checkbox", { name: term("prop.web") });
    expect(web).not.toBeChecked();
    expect(within(ops).getByRole("checkbox", { name: term("prop.files") })).toBeChecked();
    await user.click(web);
    expect(calls.at(-1)).toEqual({
      method: "PATCH",
      path: "/rooms/operations",
      body: { props: [{ kind: "files" }, { kind: "web" }] },
    });
  });

  it("will not delete a room that still has crew", async () => {
    renderApp("/crew");
    const ops = await screen.findByRole("region", { name: "Operations" });
    expect(within(ops).getByRole("button", { name: /Delete/ })).toBeDisabled();
  });

  it("adds a crew member and opens its editor", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/crew");
    const form = await screen.findByRole("form", { name: term("agent.verb") });
    await user.type(within(form).getByLabelText("Name"), "Scout");
    await user.selectOptions(within(form).getByLabelText(term("room")), "operations");
    await user.click(within(form).getByRole("button", { name: term("agent.verb") }));
    expect(calls.find((c) => c.method === "POST")).toEqual({
      method: "POST",
      path: "/agents",
      body: { name: "Scout", roomId: "operations" },
    });
    expect(await screen.findByRole("heading", { level: 1, name: "Scout" })).toBeInTheDocument();
  });

  it("adds a room", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/crew");
    const form = await screen.findByRole("form", { name: term("room.verb") });
    await user.type(within(form).getByRole("textbox"), "Research");
    await user.click(within(form).getByRole("button"));
    expect(calls.at(-1)).toEqual({ method: "POST", path: "/rooms", body: { name: "Research" } });
  });

  it("updates live when another tab changes the station (event, then refetch)", async () => {
    const { state, emit } = renderApp("/crew");
    await screen.findByRole("region", { name: "Command" });
    const vesper = state.agents.get("vesper");
    if (vesper) vesper.config = { ...vesper.config, name: "Vesper Prime" };
    emit({ type: "agent.updated", agentId: "vesper", payload: { change: "updated" } });
    expect(await screen.findByRole("link", { name: "Vesper Prime" })).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = renderApp("/crew");
    await screen.findByRole("region", { name: "Command" });
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("Agent editor", () => {
  it("shows the effective tools with their class and where they come from", async () => {
    renderApp("/crew/vesper");
    const tools = await screen.findByRole("region", { name: term("tools.effective") });
    const items = within(tools).getAllByRole("listitem");
    expect(items.map((li) => li.dataset.tool)).toEqual([
      "dispatch",
      "read_session",
      "web_fetch",
      "remember",
    ]);
    expect(items[2]).toHaveTextContent(`web_fetch · read · ${term("grant")}: ${term("prop.web")}`);
  });

  it("marks each tool read or write", async () => {
    renderApp("/crew/quill");
    const tools = await screen.findByRole("region", { name: term("tools.effective") });
    expect(
      within(tools)
        .getAllByRole("listitem")
        .map((li) => `${li.dataset.tool}:${li.dataset.class}`),
    ).toEqual(["read_file:read", "list_files:read", "write_file:write"]);
  });

  it("says a granted connector's tools appear once it is connected, instead of hiding the grant", async () => {
    const fake = fakeApi();
    const quill = fake.state.agents.get("quill");
    if (quill) quill.config = { ...quill.config, connectorGrants: ["notion"] };
    renderApp("/crew/quill", fake);
    const tools = await screen.findByRole("region", { name: term("tools.effective") });
    expect(within(tools).getByText(/^Notion/)).toHaveTextContent(
      `Notion ${term("tools.connector.pending")}`,
    );
  });

  it("says plainly when a crew member has no tools", async () => {
    const fake = fakeApi();
    fake.state.station = {
      ...fake.state.station,
      rooms: fake.state.station.rooms.map((r) => ({ ...r, props: [] })),
    };
    renderApp("/crew/quill", fake);
    expect(await screen.findByText(term("tools.none"))).toBeInTheDocument();
  });

  it("flags Full power visibly and saves only the fields that changed", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/crew/vesper");
    const form = await screen.findByRole("form", { name: "Configuration" });
    const full = within(form).getByRole("radio", { name: new RegExp(term("approvalMode.full")) });
    expect(full.closest("[data-flag]")).toHaveAttribute("data-flag", "full-power");
    expect(within(form).getByRole("button", { name: "Save changes" })).toBeDisabled();
    await user.click(full);
    await user.click(within(form).getByRole("button", { name: "Save changes" }));
    expect(calls.at(-1)).toEqual({
      method: "PATCH",
      path: "/agents/vesper",
      body: { approvalMode: "full" },
    });
  });

  it("grants a connector with a checkbox", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/crew/quill");
    const form = await screen.findByRole("form", { name: "Configuration" });
    await user.click(within(form).getByRole("checkbox", { name: "Notion" }));
    await user.click(within(form).getByRole("button", { name: "Save changes" }));
    expect(calls.at(-1)?.body).toEqual({ connectorGrants: ["notion"] });
  });

  it("shows the daemon's reasons when a change is refused", async () => {
    const user = userEvent.setup();
    renderApp("/crew/quill");
    const form = await screen.findByRole("form", { name: "Configuration" });
    await user.selectOptions(within(form).getByLabelText("Role"), "overseer");
    await user.click(within(form).getByRole("button", { name: "Save changes" }));
    const alert = await within(form).findByRole("alert");
    expect(alert).toHaveTextContent("a second overseer");
    expect(alert).toHaveTextContent('agents.quill.role: "vesper" is already the overseer');
  });

  it("edits each document separately and saves it", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/crew/vesper");
    const purpose = await screen.findByLabelText(term("document.purpose"));
    await user.type(purpose, "Lead.");
    const doc = purpose.closest("[data-document]") as HTMLElement;
    expect(within(doc).getByText("unsaved")).toBeInTheDocument();
    await user.click(within(doc).getByRole("button"));
    expect(calls.at(-1)).toEqual({
      method: "PUT",
      path: "/agents/vesper/documents/purpose",
      body: { text: "Lead." },
    });
    expect(screen.getByLabelText(term("document.identity"))).toHaveValue("# Vesper\n");
  });

  it("shows a document saved elsewhere unless it is being edited here", async () => {
    const user = userEvent.setup();
    const { state, emit } = renderApp("/crew/vesper");
    const context = await screen.findByLabelText(term("document.context"));
    const purpose = screen.getByLabelText(term("document.purpose"));
    await user.type(purpose, "Mine");
    const vesper = state.agents.get("vesper");
    if (vesper) vesper.documents = { ...vesper.documents, context: "From disk", purpose: "Theirs" };
    emit({ type: "agent.updated", agentId: "vesper", payload: { change: "updated" } });
    await waitFor(() => expect(context).toHaveValue("From disk"));
    expect(purpose).toHaveValue("Mine");
  });

  it("deletes after confirmation and returns to the crew list", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    const { calls } = renderApp("/crew/quill");
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(calls.some((c) => c.method === "DELETE" && c.path === "/agents/quill")).toBe(true);
    expect(
      await screen.findByRole("heading", { level: 1, name: term("agents") }),
    ).toBeInTheDocument();
  });

  it("deletes nothing when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "confirm",
      vi.fn(() => false),
    );
    const { calls } = renderApp("/crew/quill");
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
  });

  it("reports an unknown crew member", async () => {
    renderApp("/crew/nobody");
    expect(await screen.findByRole("alert")).toHaveTextContent('no agent "nobody"');
  });

  it("has no axe violations", async () => {
    const { container } = renderApp("/crew/vesper");
    await screen.findByRole("form", { name: "Configuration" });
    expect(await axe(container)).toHaveNoViolations();
  });
});
