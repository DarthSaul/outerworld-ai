import { term } from "@darthsaul/outerworld-ai-core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { fakeApi, renderApp } from "../test/fake-daemon.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const nav = () => screen.findByRole("navigation", { name: term("crewPage.nav") });
const main = (container: HTMLElement) => container.querySelector("[data-crew-main]") as HTMLElement;

describe("Crew screen", () => {
  it("is one panel: a sidenav of crew (Crew first, the default) beside the main panel", async () => {
    const { container } = renderApp("/crew");
    const side = await nav();
    const panel = screen.getByRole("region", { name: term("crewPage.rooms") });
    expect(screen.getByRole("heading", { level: 1, name: term("crewPage.rooms") })).toBeVisible();
    expect(panel.contains(side)).toBe(true);
    expect(panel.contains(main(container))).toBe(true);
    // The Crew / Rooms toggle sits in the title strip with the screen title, not in the sidenav.
    const view = within(panel).getByRole("group", { name: term("crewPage.view") });
    expect(side.contains(view)).toBe(false);
    const title = screen.getByRole("heading", { level: 1, name: term("crewPage.rooms") });
    expect(title.parentElement).toBe(view.parentElement);
    const [crew, rooms] = within(view).getAllByRole("button") as HTMLElement[];
    expect(crew).toHaveTextContent(term("agents"));
    expect(rooms).toHaveTextContent(term("rooms"));
    expect(crew).toHaveAttribute("aria-pressed", "true");
    // Nothing chosen yet: the main panel says what to do.
    expect(within(main(container)).getByText(term("crewPage.pickAgent.title"))).toBeVisible();
  });

  it("lists each crew member: name and tags, then room; model on the left and spend on the right", async () => {
    const fake = fakeApi();
    fake.spend.agents = { quill: 0.0042 };
    const { container } = renderApp("/crew", fake);
    const side = await nav();
    const list = side.querySelector('[data-listing="agents"]') as HTMLElement;
    const items = within(list).getAllByRole("listitem");
    expect(items.map((c) => c.getAttribute("data-agent"))).toEqual(["vesper", "quill"]);
    const quill = items[1] as HTMLElement;
    const link = within(quill).getByRole("link");
    expect(link).toHaveAttribute("href", "/crew/quill");
    const [top, meta] = Array.from(link.children) as HTMLElement[];
    expect(top).toHaveTextContent("Quill");
    expect(top).toHaveTextContent("Operations");
    // The tag shares the name's row.
    const flag = top?.querySelector('[data-flag="full-power"]') as HTMLElement;
    expect(flag).toHaveTextContent(term("approvalMode.full"));
    expect(flag.parentElement).toHaveTextContent(/^Quill/);
    // Model first (left), spend last (right), spread apart.
    expect(meta?.firstElementChild).toHaveTextContent("anthropic/claude-sonnet-5.5");
    expect(meta?.lastElementChild).toHaveAttribute("data-agent-spend");
    expect(meta?.lastElementChild).toHaveTextContent("$0.0042");
    expect(meta?.className).toMatch(/justify-between/);
    expect(within(items[0] as HTMLElement).getByText(term("overseer.role"))).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it("opens a crew member's setup in the main panel, marking them in the list", async () => {
    const user = userEvent.setup();
    const { container } = renderApp("/crew");
    const side = await nav();
    await user.click(within(side).getByRole("link", { name: /Quill/ }));
    expect(await screen.findByRole("heading", { level: 2, name: "Quill" })).toBeInTheDocument();
    expect(main(container).querySelector('[data-agent-detail="quill"]')).not.toBeNull();
    expect(within(side).getByRole("link", { name: /Quill/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      within(main(container)).getByRole("region", { name: term("tools.effective") }),
    ).toBeTruthy();
  });

  it("switches to rooms, and opens a room's props and crew in the main panel", async () => {
    const user = userEvent.setup();
    const { container } = renderApp("/crew");
    const side = await nav();
    await user.click(screen.getByRole("button", { name: term("rooms") }));
    const list = await waitFor(() => {
      const el = side.querySelector('[data-listing="rooms"]');
      if (!el) throw new Error("no rooms yet");
      return el as HTMLElement;
    });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((i) => i.dataset.roomItem),
    ).toEqual(["command", "operations"]);
    expect(within(main(container)).getByText(term("crewPage.pickRoom.title"))).toBeVisible();
    await user.click(within(list).getByRole("link", { name: /Command/ }));
    const command = await screen.findByRole("region", { name: "Command" });
    expect(within(command).getByRole("link", { name: "Vesper" })).toBeInTheDocument();
    expect(within(command).getByText(term("overseer.role"))).toBeInTheDocument();
    await user.click(within(list).getByRole("link", { name: /Operations/ }));
    const ops = await screen.findByRole("region", { name: "Operations" });
    expect(ops.querySelector('[data-agent="quill"] [data-flag="full-power"]')).toHaveTextContent(
      term("approvalMode.full"),
    );
  });

  it("shows a room's props as toggles and places a prop with one click", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/crew?listing=rooms&room=operations");
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
    renderApp("/crew?listing=rooms&room=operations");
    const ops = await screen.findByRole("region", { name: "Operations" });
    expect(within(ops).getByRole("button", { name: /Delete/ })).toBeDisabled();
  });

  it("adds a crew member from the top of the crew list, then opens their setup", async () => {
    const user = userEvent.setup();
    const { calls, container } = renderApp("/crew");
    const side = await nav();
    const add = within(side).getByRole("link", { name: `+ ${term("agent.verb")}` });
    const list = side.querySelector('[data-listing="agents"]');
    expect(
      add.compareDocumentPosition(list as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await user.click(add);
    const form = await within(main(container)).findByRole("form", { name: term("agent.verb") });
    const panel = within(main(container)).getByRole("region", { name: term("agent.verb") });
    expect(within(panel).getByText(term("agent.add.hint"))).toBeInTheDocument();
    expect(
      within(panel).getByRole("button", { name: term("template.projectManager") }),
    ).toBeInTheDocument();
    await user.type(within(form).getByLabelText("Name"), "Scout");
    await user.selectOptions(within(form).getByLabelText(term("room")), "operations");
    await user.click(within(form).getByRole("button", { name: term("agent.verb") }));
    expect(calls.find((c) => c.method === "POST")).toEqual({
      method: "POST",
      path: "/agents",
      body: { name: "Scout", roomId: "operations" },
    });
    expect(await screen.findByRole("heading", { level: 2, name: "Scout" })).toBeInTheDocument();
  });

  it("adds a room from the top of the rooms list, then opens it", async () => {
    const user = userEvent.setup();
    const { calls, container } = renderApp("/crew?listing=rooms");
    const side = await nav();
    await user.click(within(side).getByRole("link", { name: `+ ${term("room.verb")}` }));
    const panel = await within(main(container)).findByRole("region", { name: term("room.verb") });
    expect(within(panel).getByText(term("room.add.hint"))).toBeInTheDocument();
    const form = within(panel).getByRole("form", { name: term("room.verb") });
    await user.type(within(form).getByLabelText(term("room.name")), "Hangar");
    await user.click(within(form).getByRole("button"));
    expect(calls).toContainEqual({ method: "POST", path: "/rooms", body: { name: "Hangar" } });
    expect(await screen.findByRole("region", { name: "Hangar" })).toBeInTheDocument();
  });

  it("updates live when another tab changes the station (event, then refetch)", async () => {
    const { state, emit } = renderApp("/crew");
    const side = await nav();
    await within(side).findByRole("link", { name: /Vesper/ });
    const vesper = state.agents.get("vesper");
    if (vesper) vesper.config = { ...vesper.config, name: "Vesper Prime" };
    emit({ type: "agent.updated", agentId: "vesper", payload: { change: "updated" } });
    expect(await within(side).findByRole("link", { name: /Vesper Prime/ })).toBeInTheDocument();
  });

  it("has no axe violations with a room open", async () => {
    const { container } = renderApp("/crew?listing=rooms&room=command");
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

  it("sums up a granted connector in one line, full access, with its tools behind a toggle", async () => {
    const user = userEvent.setup();
    const fake = fakeApi();
    const quill = fake.state.agents.get("quill");
    if (quill) quill.config = { ...quill.config, connectorGrants: ["notion"] };
    fake.toolCatalog.notion = Array.from({ length: 30 }, (_, i) => ({
      name: `notion-tool-${i}`,
      class: i < 10 ? ("write" as const) : ("read" as const),
    }));
    renderApp("/crew/quill", fake);
    const tools = await screen.findByRole("region", { name: term("tools.effective") });
    const line = await waitFor(() => {
      const el = tools.querySelector('[data-connector-tools="Notion"]');
      if (!el) throw new Error("no connector line yet");
      return el as HTMLElement;
    });
    expect(line).toHaveTextContent(
      `${term("connector")}: Notion ${term("tools.connector.full")} · 30 tools · 20 read, 10 write`,
    );
    // The thirty tools are not spelled out in the panel until asked for, then in a bounded box.
    const toggle = within(line).getByText(term("tools.connector.show"));
    const details = toggle.closest("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    await user.click(toggle);
    expect(details.open).toBe(true);
    const list = within(details).getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(30);
    expect(list.className).toMatch(/max-h-/);
    expect(list.className).toMatch(/overflow-y-auto/);
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
    // Back to the crew screen with nobody chosen.
    expect(await screen.findByText(term("crewPage.pickAgent.title"))).toBeInTheDocument();
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
