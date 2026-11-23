import { term, termWith } from "@darthsaul/outerworld-ai-core";
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

  it("lists each crew member: name, then room cut short, then tags and spend; no model", async () => {
    const fake = fakeApi();
    fake.spend.agents = { quill: 0.0042 };
    const { container } = renderApp("/crew", fake);
    const side = await nav();
    const list = side.querySelector('[data-listing="agents"]') as HTMLElement;
    const items = within(list).getAllByRole("listitem");
    expect(items.map((c) => c.getAttribute("data-agent"))).toEqual(["quill"]);
    const quill = items[0] as HTMLElement;
    const link = within(quill).getByRole("link");
    expect(link).toHaveAttribute("href", "/crew/quill");
    const [top, foot] = Array.from(link.children) as HTMLElement[];
    expect(top).toHaveTextContent("Quill");
    expect(top).toHaveTextContent("Operations");
    // The name has a row of its own; the tags sit at the bottom.
    expect(top?.querySelector("[data-agent-name]")).toHaveTextContent(/^Quill$/);
    expect(top?.querySelector('[data-flag="full-power"]')).toBeNull();
    const flag = foot?.querySelector('[data-flag="full-power"]') as HTMLElement;
    expect(flag).toHaveTextContent(term("approvalMode.full"));
    // A long room name ends in an ellipsis instead of widening the list.
    expect(top?.querySelector("[data-room-name]")?.className).toMatch(/\bmin-w-0 truncate\b/);
    // Today's spend at the bottom's far end; the model is not listed.
    expect(foot).toHaveAttribute("data-agent-foot");
    expect(foot?.lastElementChild).toHaveAttribute("data-agent-spend");
    expect(foot?.lastElementChild).toHaveTextContent("$0.0042");
    expect(link).not.toHaveTextContent("anthropic/claude-sonnet-5.5");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("puts the Overseer above Add crew member, set apart by a thin rule, and narrows the sidenav", async () => {
    const fake = fakeApi();
    // The daemon lists Quill before the Overseer; the sidenav still leads with the Overseer.
    const entries = [...fake.state.agents.entries()].reverse();
    fake.state.agents.clear();
    for (const [k, v] of entries) fake.state.agents.set(k, v);
    renderApp("/crew", fake);
    const side = await nav();
    expect(side.className).toMatch(/desktop:w-60/);
    const top = side.querySelector("[data-overseer-list]") as HTMLElement;
    await waitFor(() =>
      expect(
        within(top)
          .getAllByRole("listitem")
          .map((c) => c.getAttribute("data-agent")),
      ).toEqual(["vesper"]),
    );
    expect(within(top).getByText(term("overseer.role"))).toBeInTheDocument();
    const rule = side.querySelector("[data-overseer-rule]") as HTMLElement;
    const add = within(side).getByRole("link", { name: `+ ${term("agent.verb")}` });
    const order = (a: Node, b: Node) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(order(top, rule)).toBeTruthy();
    expect(order(rule, add)).toBeTruthy();
    expect(rule.className).toMatch(/border-t\b/);
    // Rooms has no Overseer to lead with.
    await userEvent.click(
      within(screen.getByRole("group", { name: term("crewPage.view") })).getByRole("button", {
        name: term("rooms"),
      }),
    );
    expect(side.querySelector("[data-overseer-list]")).toBeNull();
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

describe("Crew member tabs", () => {
  it("opens on Brief, with Memory and Config beside it and Delete in the strip", async () => {
    const { container } = renderApp("/crew/quill");
    const tabs = await screen.findByRole("tablist", { name: term("agentTabs.label") });
    expect(
      within(tabs)
        .getAllByRole("tab")
        .map((t) => t.textContent),
    ).toEqual([
      term("agentTabs.brief"),
      term("agentTabs.schedules"),
      term("agentTabs.memory"),
      term("agentTabs.config"),
    ]);
    expect(within(tabs).getByRole("tab", { name: term("agentTabs.brief") })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(tabs.parentElement?.contains(screen.getByRole("button", { name: "Delete" }))).toBe(true);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("switches tabs on click, and opens the tab the address names", async () => {
    const user = userEvent.setup();
    renderApp("/crew/quill");
    await user.click(await screen.findByRole("tab", { name: term("agentTabs.config") }));
    expect(await screen.findByRole("form", { name: "Configuration" })).toBeVisible();
    await user.click(screen.getByRole("tab", { name: term("agentTabs.brief") }));
    expect(screen.queryByRole("form", { name: "Configuration" })).toBeNull();
    expect(screen.getByRole("region", { name: term("tools.effective") })).toBeVisible();
  });

  it("keeps the schedules on their own tab, between Brief and Memory, and off Config", async () => {
    renderApp("/crew/quill?tab=schedules");
    const tab = await screen.findByRole("tabpanel", { name: term("agentTabs.schedules") });
    expect(
      await within(tab).findByRole("button", { name: term("schedule.add") }),
    ).toBeInTheDocument();
    const configTab = screen.getByRole("tab", { name: term("agentTabs.config") });
    const config = document.getElementById(configTab.getAttribute("aria-controls") ?? "");
    expect(config?.querySelector("#schedules-title")).toBeNull();
  });

  it("shows the crew member's memory on Memory", async () => {
    renderApp("/crew/quill?tab=memory");
    const memory = await screen.findByRole("tabpanel", { name: term("agentTabs.memory") });
    expect(
      await within(memory).findByRole("region", { name: term("memory.proposals") }),
    ).toBeInTheDocument();
    expect(within(memory).getByRole("region", { name: term("memory.beliefs") })).toBeVisible();
  });

  it("puts every editable field on Config, Appearance last, and none on Brief", async () => {
    renderApp("/crew/quill?tab=config");
    const config = await screen.findByRole("tabpanel", { name: term("agentTabs.config") });
    const appearance = await within(config).findByRole("region", {
      name: term("crewSelect.appearance"),
    });
    const panels = Array.from(
      config.querySelector("[data-scroll-area]")?.children ?? [],
    ) as HTMLElement[];
    expect(panels[0]).toHaveAccessibleName("Configuration");
    expect(panels.at(-1)?.contains(appearance)).toBe(true);
    expect(within(config).getByLabelText(term("document.identity"))).toBeInTheDocument();
    const briefTab = screen.getByRole("tab", { name: term("agentTabs.brief") });
    const brief = document.getElementById(briefTab.getAttribute("aria-controls") ?? "");
    expect(brief).toHaveTextContent(term("tools.effective"));
    expect(brief?.querySelectorAll("input, select, textarea, button")).toHaveLength(0);
  });
});

describe("Brief", () => {
  it("names the crew member, their room, and their model", async () => {
    renderApp("/crew/quill");
    const name = await screen.findByRole("heading", { level: 2, name: "Quill" });
    const header = name.closest("header") as HTMLElement;
    expect(header.querySelector("[data-room-line]")).toHaveTextContent("Room: Operations");
    // The model as a tag, written as agent.json has it; screen readers hear "Model:" first.
    const model = header.querySelector("[data-model-line]") as HTMLElement;
    expect(model).toHaveTextContent("Model: anthropic/claude-sonnet-5.5");
    expect(model.className).not.toMatch(/\buppercase\b/);
    expect(model.className).toMatch(/\bpx-2 py-1 text-d7\b/);
    expect(model).toHaveAttribute("title", "Claude Sonnet 5.5");
    expect(header.querySelector('[data-flag="full-power"]')).toHaveTextContent(
      term("approvalMode.full"),
    );
  });

  it("links to Config, so a read-only Brief always has something a keyboard can reach", async () => {
    const user = userEvent.setup();
    renderApp("/crew/quill");
    const brief = await screen.findByRole("tabpanel", { name: term("agentTabs.brief") });
    const edit = within(brief).getByRole("link", { name: term("brief.edit") });
    // Inside the tab's scroll area: a keyboard reaches it, and from there can scroll.
    expect(brief.querySelector("[data-scroll-area]")?.contains(edit)).toBe(true);
    await user.click(edit);
    expect(await screen.findByRole("form", { name: "Configuration" })).toBeVisible();
    expect(screen.getByRole("tab", { name: term("agentTabs.config") })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("lists what the crew member can use by readable name, in two columns", async () => {
    renderApp("/crew/vesper");
    const tools = await screen.findByRole("region", { name: term("tools.effective") });
    const grid = tools.querySelector("[data-capabilities]") as HTMLElement;
    expect(grid.className).toMatch(/desktop:grid-cols-2/);
    const items = within(grid).getAllByRole("listitem");
    expect(items.map((li) => li.dataset.tool)).toEqual([
      "dispatch",
      "read_session",
      "web_fetch",
      "remember",
    ]);
    const web = items[2] as HTMLElement;
    expect(web.querySelector("[data-tool-title]")).toHaveTextContent("Web & Browser");
    expect(web).toHaveTextContent(term("item.web_fetch.hint"));
    expect(web.querySelector("[data-tool-source]")).toHaveTextContent(
      `web_fetch · ${term("grant")}: ${term("prop.web")}`,
    );
    expect(web.querySelector('svg[data-icon="web"]')).not.toBeNull();
  });

  it("marks each tool read or write", async () => {
    renderApp("/crew/quill");
    const tools = await screen.findByRole("region", { name: term("tools.effective") });
    const items = within(tools).getAllByRole("listitem");
    expect(items.map((li) => `${li.dataset.tool}:${li.dataset.class}`)).toEqual([
      "read_file:read",
      "list_files:read",
      "write_file:write",
    ]);
    expect(items[2]).toHaveTextContent(`${term("item.write_file")}${term("grant.write")}`);
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

  it("sums up a granted connector in one item, full access, with its tools behind a toggle", async () => {
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
    expect(line).toHaveTextContent(`${term("connector")}: Notion${term("tools.connector.full")}`);
    expect(line).toHaveTextContent("30 tools · 20 read, 10 write");
    expect(line.querySelector('svg[data-icon="connector"]')).not.toBeNull();
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

  it("shows the identity as text to read, not a field to edit", async () => {
    renderApp("/crew/vesper");
    const identity = await screen.findByRole("region", { name: term("document.identity") });
    expect(identity).toHaveTextContent("Vesper");
    expect(within(identity).queryByRole("textbox")).toBeNull();
  });

  it("says when there is no identity yet", async () => {
    const fake = fakeApi();
    const vesper = fake.state.agents.get("vesper");
    if (vesper) vesper.documents = { ...vesper.documents, identity: "  \n" };
    renderApp("/crew/vesper", fake);
    const identity = await screen.findByRole("region", { name: term("document.identity") });
    expect(identity).toHaveTextContent(term("brief.identity.none"));
  });

  it("lists schedules read only, or says there are none", async () => {
    const fake = fakeApi();
    const quill = fake.state.agents.get("quill");
    if (quill)
      quill.config = {
        ...quill.config,
        schedules: [
          {
            id: "briefing",
            cron: "0 8 * * 1-5",
            timezone: "Europe/Stockholm",
            prompt: "Write the briefing.",
            catchUp: false,
            enabled: false,
          },
        ],
      };
    renderApp("/crew/quill", fake);
    const brief = await screen.findByRole("tabpanel", { name: term("agentTabs.brief") });
    const schedules = await within(brief).findByRole("region", { name: term("schedules") });
    const item = await waitFor(() => {
      const el = schedules.querySelector('[data-schedule="briefing"]');
      if (!el) throw new Error("no schedule yet");
      return el as HTMLElement;
    });
    expect(item).toHaveTextContent("0 8 * * 1-5");
    expect(item).toHaveTextContent("Write the briefing.");
    expect(item.querySelector("[data-schedule-state]")).toHaveTextContent(term("schedule.off"));
    expect(within(schedules).queryByRole("button")).toBeNull();
    expect(within(schedules).queryByRole("checkbox")).toBeNull();
  });

  it("says a crew member with no schedules has none", async () => {
    renderApp("/crew/vesper");
    const brief = await screen.findByRole("tabpanel", { name: term("agentTabs.brief") });
    const schedules = await within(brief).findByRole("region", { name: term("schedules") });
    expect(await within(schedules).findByText(term("brief.schedules.none"))).toBeVisible();
  });
});

describe("Config", () => {
  it("flags Full power visibly and saves only the fields that changed", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/crew/vesper?tab=config");
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

  it("keeps an unsaved change while the Commander looks at Brief", async () => {
    const user = userEvent.setup();
    renderApp("/crew/vesper?tab=config");
    const form = await screen.findByRole("form", { name: "Configuration" });
    await user.click(
      within(form).getByRole("radio", { name: new RegExp(term("approvalMode.full")) }),
    );
    await user.click(screen.getByRole("tab", { name: term("agentTabs.brief") }));
    await user.click(screen.getByRole("tab", { name: term("agentTabs.config") }));
    expect(
      within(screen.getByRole("form", { name: "Configuration" })).getByRole("button", {
        name: "Save changes",
      }),
    ).toBeEnabled();
  });

  it("grants a connector from its own panel, saved at once", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/crew/quill?tab=config");
    const panel = await screen.findByRole("region", { name: term("connectors") });
    const form = screen.getByRole("form", { name: "Configuration" });
    expect(form.contains(panel)).toBe(false);
    await user.click(
      within(panel).getByRole("checkbox", {
        name: termWith("agentConnectors.grantName", { name: "Notion" }),
      }),
    );
    expect(calls.at(-1)?.body).toEqual({ connectorGrants: ["notion"] });
  });

  it("builds each grant on the last one saved, even before the crew member is refetched", async () => {
    const user = userEvent.setup();
    const fake = fakeApi();
    fake.state.station = {
      ...fake.state.station,
      connectors: [
        ...fake.state.station.connectors,
        {
          id: "github",
          name: "GitHub",
          transport: { type: "http", url: "https://gh.example/mcp" },
        },
      ],
    };
    const { calls } = renderApp("/crew/quill?tab=config", fake);
    const panel = await screen.findByRole("region", { name: term("connectors") });
    const box = (name: string) =>
      within(panel).getByRole("checkbox", {
        name: termWith("agentConnectors.grantName", { name }),
      });
    await user.click(box("Notion"));
    // Locked while saving, then live again on the saved grants (no refetch has happened).
    await waitFor(() => expect(box("GitHub")).toBeEnabled());
    expect(box("Notion")).toBeChecked();
    await user.click(box("GitHub"));
    const patches = calls.filter((c) => c.method === "PATCH");
    expect(patches.map((c) => c.body)).toEqual([
      { connectorGrants: ["notion"] },
      { connectorGrants: ["notion", "github"] },
    ]);
  });

  it("sends a crew member's saves one at a time, in order, so no older answer lands last", async () => {
    const user = userEvent.setup();
    const fake = fakeApi();
    // Hold the first save's answer until the test lets it through.
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const send = fake.api.send;
    let held = false;
    (fake.api as { send: typeof send }).send = async (method, path, body) => {
      if (method === "PATCH" && !held) {
        held = true;
        await gate;
      }
      return send(method, path, body);
    };
    const { calls } = renderApp("/crew/quill?tab=config", fake);
    const form = await screen.findByRole("form", { name: "Configuration" });
    await user.click(
      within(form).getByRole("radio", { name: new RegExp(term("approvalMode.ask")) }),
    );
    await user.click(within(form).getByRole("button", { name: "Save changes" }));
    // The Config form's save is in flight; a grant from the Connectors panel waits its turn.
    const panel = screen.getByRole("region", { name: term("connectors") });
    await user.click(
      within(panel).getByRole("checkbox", {
        name: termWith("agentConnectors.grantName", { name: "Notion" }),
      }),
    );
    expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(0);
    release();
    await waitFor(() => expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(2));
    expect(calls.filter((c) => c.method === "PATCH").map((c) => c.body)).toEqual([
      { approvalMode: "ask" },
      { connectorGrants: ["notion"] },
    ]);
    // Both saves stand in the cached crew member: the grant's answer came last and holds both.
    await waitFor(() =>
      expect(
        within(panel).getByRole("checkbox", {
          name: termWith("agentConnectors.grantName", { name: "Notion" }),
        }),
      ).toBeChecked(),
    );
    expect(
      within(form).getByRole("radio", { name: new RegExp(term("approvalMode.ask")) }),
    ).toBeChecked();
  });

  it("lists each connector full width, with the Abilities logo, kind, status, and description", async () => {
    const fake = fakeApi();
    fake.connectors.push({
      id: "notion",
      name: "Notion",
      url: "https://mcp.notion.com/mcp",
      status: "connected",
      tools: [
        { name: "notion-search", class: "read", description: "Search" },
        { name: "notion-update-page", class: "write", description: "Update" },
      ],
      grantedTo: ["quill"],
    });
    const quill = fake.state.agents.get("quill");
    if (quill) quill.config = { ...quill.config, connectorGrants: ["notion"] };
    renderApp("/crew/quill?tab=config", fake);
    const panel = await screen.findByRole("region", { name: term("connectors") });
    const row = panel.querySelector('[data-connector-grant="notion"]') as HTMLElement;
    expect(row).toHaveAttribute("data-granted", "true");
    expect(row.querySelector('svg[data-brand="notion"]')).not.toBeNull();
    expect(within(row).getByText(term("ability.kind.mcp"))).toBeInTheDocument();
    expect(within(row).getByText(term("ability.notion.hint"))).toBeInTheDocument();
    expect(await within(row).findByText(term("connectorStatus.connected"))).toBeInTheDocument();
    expect(within(row).getByText("2 tools · 1 read, 1 write")).toBeInTheDocument();
    expect(
      within(row).getByRole("checkbox", {
        name: termWith("agentConnectors.grantName", { name: "Notion" }),
      }),
    ).toBeChecked();
  });

  it("points to Abilities when no connector is installed", async () => {
    const fake = fakeApi();
    fake.state.station = { ...fake.state.station, connectors: [] };
    renderApp("/crew/quill?tab=config", fake);
    const panel = await screen.findByRole("region", { name: term("connectors") });
    expect(within(panel).getByText(term("agentConnectors.none"), { exact: false })).toBeVisible();
    expect(
      within(panel).getByRole("link", { name: term("agentConnectors.discover") }),
    ).toHaveAttribute("href", "/system/abilities/discover");
  });

  it("shows the daemon's reasons when a change is refused", async () => {
    const user = userEvent.setup();
    renderApp("/crew/quill?tab=config");
    const form = await screen.findByRole("form", { name: "Configuration" });
    await user.selectOptions(within(form).getByLabelText("Role"), "overseer");
    await user.click(within(form).getByRole("button", { name: "Save changes" }));
    const alert = await within(form).findByRole("alert");
    expect(alert).toHaveTextContent("a second overseer");
    expect(alert).toHaveTextContent('agents.quill.role: "vesper" is already the overseer');
  });

  it("edits each document separately and saves it", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/crew/vesper?tab=config");
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
    expect(doc.parentElement?.querySelector("#doc-identity")).toHaveValue("# Vesper\n");
  });

  it("shows a document saved elsewhere unless it is being edited here", async () => {
    const user = userEvent.setup();
    const { state, emit } = renderApp("/crew/vesper?tab=config");
    const context = await screen.findByLabelText(term("document.context"));
    const purpose = screen.getByLabelText(term("document.purpose"));
    await user.type(purpose, "Mine");
    const vesper = state.agents.get("vesper");
    if (vesper) vesper.documents = { ...vesper.documents, context: "From disk", purpose: "Theirs" };
    emit({ type: "agent.updated", agentId: "vesper", payload: { change: "updated" } });
    await waitFor(() => expect(context).toHaveValue("From disk"));
    expect(purpose).toHaveValue("Mine");
  });

  it("has no axe violations", async () => {
    const { container } = renderApp("/crew/vesper?tab=config");
    await screen.findByRole("form", { name: "Configuration" });
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("Deleting a crew member", () => {
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
});

describe("Dispatch on the crew page (ADR-0024)", () => {
  /** Quill in Operations, Wren in Research, a hallway Operations → Research. */
  const withHallway = (quillDispatches = false) => {
    const fake = fakeApi();
    fake.state.station = {
      ...fake.state.station,
      rooms: [...fake.state.station.rooms, { id: "research", name: "Research", props: [] }],
      lanes: [{ id: "operations-to-research", from: "operations", to: "research" }],
    };
    const quill = fake.state.agents.get("quill");
    if (!quill) throw new Error("the fake station has Quill");
    const { canDispatch: _, ...plain } = quill.config;
    fake.state.agents.set("wren", {
      config: { ...plain, name: "Wren", roomId: "research" },
      documents: quill.documents,
    });
    if (quillDispatches) quill.config = { ...quill.config, canDispatch: true };
    return fake;
  };

  it("turns a crew member's dispatch on from Config", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/crew/quill?tab=config", withHallway());
    const form = await screen.findByRole("form", { name: "Configuration" });
    const toggle = within(form).getByRole("checkbox", {
      name: new RegExp(term("dispatch.canDispatch")),
    });
    expect(toggle).not.toBeChecked();
    expect(within(form).getByText(term("dispatch.canDispatch.hint"))).toBeInTheDocument();
    await user.click(toggle);
    await user.click(within(form).getByRole("button", { name: "Save changes" }));
    expect(calls.at(-1)).toEqual({
      method: "PATCH",
      path: "/agents/quill",
      body: { canDispatch: true },
    });
  });

  it("shows the Overseer's dispatch as always on", async () => {
    renderApp("/crew/vesper?tab=config");
    const form = await screen.findByRole("form", { name: "Configuration" });
    const toggle = within(form).getByRole("checkbox", {
      name: new RegExp(term("dispatch.canDispatch")),
    });
    expect(toggle).toBeChecked();
    expect(toggle).toBeDisabled();
    expect(within(form).getByText(term("dispatch.canDispatch.overseer"))).toBeInTheDocument();
  });

  it("lists on Brief exactly who policy lets it reach, and how", async () => {
    const { container } = renderApp("/crew/quill", withHallway(true));
    const panel = await screen.findByRole("region", { name: term("dispatch.reach") });
    const items = within(panel).getAllByRole("listitem");
    // Wren by the hallway's map label; never the Overseer, though Command is a room away.
    expect(items.map((li) => li.textContent)).toEqual([
      `WrenResearch${termWith("dispatch.reach.lane", { lane: "L-01" })}`,
    ]);
    expect(await axe(container)).toHaveNoViolations();
  });

  it("says so on Brief when dispatch is off", async () => {
    renderApp("/crew/quill", withHallway(false));
    const off = await screen.findByRole("region", { name: term("dispatch.reach") });
    expect(off).toHaveTextContent(term("dispatch.reach.off"));
  });

  it("shows the Overseer reaching every crew member", async () => {
    renderApp("/crew/vesper", withHallway());
    const panel = await screen.findByRole("region", { name: term("dispatch.reach") });
    expect(
      within(panel)
        .getAllByRole("listitem")
        .map((li) => li.firstChild?.textContent),
    ).toEqual(["Quill", "Wren"]);
    expect(panel).toHaveTextContent(term("dispatch.reach.overseer"));
  });
});
