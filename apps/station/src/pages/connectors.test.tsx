import { term, termWith } from "@darthsaul/outerworld-ai-core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import type { ConnectorItem } from "../queries.js";
import { fakeApi, renderApp } from "../test/fake-daemon.js";

const withNotion = (status: "connected" | "disconnected" = "connected") => {
  const fake = fakeApi();
  fake.connectors.push({
    id: "notion",
    name: "Notion",
    url: "https://mcp.notion.com/mcp",
    status,
    tools:
      status === "connected"
        ? [
            { name: "notion-search", class: "read", description: "Search" },
            { name: "notion-update-page", class: "write", description: "Update" },
          ]
        : [],
    grantedTo: ["quill"],
  });
  return fake;
};

/**
 * Gmail as the daemon lists it: the station's own service over the Gmail API (ADR-0021), signed
 * in with the Commander's own OAuth app.
 */
const gmail = (ownClient: { set: boolean } = { set: false }): ConnectorItem => ({
  id: "gmail",
  name: "Gmail",
  service: "gmail",
  status: "disconnected",
  tools: [],
  grantedTo: [],
  ownClient: { set: ownClient.set, redirectUrl: "http://127.0.0.1:4317/oauth/callback/gmail" },
});

describe("Abilities: connectors under Discover and Installed", () => {
  it("ignores a malformed fragment in the address", async () => {
    renderApp("/system/abilities#%E0%A4%A");
    expect(
      await screen.findByRole("heading", { name: term("abilities"), level: 1 }),
    ).toBeInTheDocument();
  });

  it("offers Notion, GitHub, and Gmail under Discover when the station has no connectors", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/system/abilities");
    const add = (name: string) => termWith("connector.add", { name });
    const notion = await screen.findByRole("button", { name: add("Notion") });
    // All three while Discover still shows them: installing one moves to Installed.
    expect(screen.getByRole("button", { name: add("GitHub") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: add("Gmail") })).toBeInTheDocument();
    // Gmail MCP is not available yet: no way to add it.
    expect(screen.queryByRole("button", { name: add("Gmail MCP") })).toBeNull();
    await user.click(notion);
    expect(calls).toContainEqual({
      method: "POST",
      path: "/connectors",
      body: { preset: "notion" },
    });
  });

  it("adds only the presets not installed yet, and marks the installed one", async () => {
    renderApp("/system/abilities/discover", withNotion());
    const adding = await screen.findByRole("region", { name: term("abilities.discover") });
    expect((await within(adding).findAllByRole("button")).map((b) => b.textContent)).toEqual([
      termWith("connector.add", { name: "GitHub" }),
      termWith("connector.add", { name: "Gmail" }),
    ]);
    // Notion stays in the grid, tagged installed, with a way to its card under Installed.
    const notion = adding.querySelector('[data-ability="notion"]') as HTMLElement;
    expect(notion).toHaveAttribute("data-installed", "true");
    expect(within(notion).getByText(term("ability.isInstalled"))).toBeInTheDocument();
    const manage = within(notion).getByRole("link", { name: term("ability.manage") });
    expect(manage).toHaveAttribute("href", "/system/abilities/installed");
    expect(manage).toHaveAccessibleDescription("Notion");
    expect(adding.querySelector('[data-ability="github"]')).toHaveAttribute(
      "data-installed",
      "false",
    );
  });

  it("shows Gmail MCP as not yet available, with nothing to press", async () => {
    renderApp("/system/abilities/discover");
    const adding = await screen.findByRole("region", { name: term("abilities.discover") });
    const card = (await within(adding).findByRole("heading", { name: "Gmail MCP" })).closest(
      "li",
    ) as HTMLElement;
    expect(card).toHaveAttribute("data-available", "false");
    expect(within(card).getByText(term("ability.unavailable"))).toHaveTextContent(
      "Not yet available",
    );
    expect(within(card).queryByRole("button")).toBeNull();
    expect(within(card).queryByRole("link")).toBeNull();
    // Every other preset can be added.
    for (const id of ["notion", "github", "gmail"]) {
      expect(adding.querySelector(`[data-ability="${id}"]`)).toHaveAttribute(
        "data-available",
        "true",
      );
    }
  });

  it("says everything is installed once the available presets are, despite Gmail MCP", async () => {
    const fake = withNotion();
    for (const [id, name] of [
      ["github", "GitHub"],
      ["gmail", "Gmail"],
    ] as const) {
      fake.connectors.push({ id, name, status: "disconnected", tools: [], grantedTo: [] });
    }
    renderApp("/system/abilities/discover", fake);
    expect(await screen.findByText(term("abilities.discover.none"))).toBeInTheDocument();
  });

  it("shows Discover as a grid of cards: logo, name, kind, and a description of each", async () => {
    renderApp("/system/abilities/discover");
    const adding = await screen.findByRole("region", { name: term("abilities.discover") });
    const grid = await within(adding).findByRole("list");
    expect(grid).toHaveAttribute("data-ability-grid");
    expect(grid.className).toMatch(/desktop:grid-cols-2/);
    const cards = within(grid).getAllByRole("listitem");
    expect(cards.map((c) => c.dataset.ability)).toEqual(["notion", "github", "gmail", "gmail-mcp"]);
    const expected = {
      notion: { brand: "notion", kind: "mcp", hint: "ability.notion.hint" },
      github: { brand: "github", kind: "mcp", hint: "ability.github.hint" },
      gmail: { brand: "gmail", kind: "api", hint: "ability.gmail.hint" },
      "gmail-mcp": { brand: "gmail", kind: "mcp", hint: "ability.gmailMcp.hint" },
    } as const;
    for (const c of cards) {
      const id = c.dataset.ability as keyof typeof expected;
      const want = expected[id];
      expect(c.querySelector(`svg[data-brand="${want.brand}"]`), id).not.toBeNull();
      expect(within(c).getByText(term(`ability.kind.${want.kind}`))).toBeInTheDocument();
      expect(within(c).getByText(term(want.hint))).toBeInTheDocument();
    }
    expect(within(cards[0] as HTMLElement).getByRole("heading", { level: 3 })).toHaveTextContent(
      "Notion",
    );
  });

  it("shows Installed as full-width cards, one per row, each marked with its kind", async () => {
    const fake = withNotion();
    fake.connectors.push(gmail());
    renderApp("/system/abilities/installed", fake);
    const section = await screen.findByRole("region", { name: term("abilities.installed") });
    expect(within(section).getByText(term("connectors.hint"))).toHaveTextContent(
      /^Abilities installed once/,
    );
    const notion = await within(section).findByRole("region", { name: "Notion" });
    const list = notion.parentElement as HTMLElement;
    expect(list).toHaveAttribute("data-ability-list");
    expect(list.className).not.toMatch(/grid-cols/);
    expect(within(notion).getByText(term("ability.kind.mcp"))).toBeInTheDocument();
    const mail = within(section).getByRole("region", { name: "Gmail" });
    expect(within(mail).getByText(term("ability.kind.api"))).toBeInTheDocument();
    // The Gmail API service has no server URL to edit; Notion's MCP server does.
    expect(within(mail).queryByLabelText(term("connector.url"))).toBeNull();
    expect(within(notion).getByLabelText(term("connector.url"))).toBeInTheDocument();
    expect(notion.querySelector('svg[data-brand="notion"]')).not.toBeNull();
    expect(within(notion).getByText(term("ability.notion.hint"))).toBeInTheDocument();
  });

  it("takes GitHub's OAuth app: shows the redirect, sends the client, never shows it back", async () => {
    const user = userEvent.setup();
    const fake = fakeApi();
    const { emit } = renderApp("/system/abilities/discover", fake);
    // The daemon announces a station change after each install.
    const added = () => emit({ type: "station.updated", payload: {} });
    await user.click(
      await screen.findByRole("button", { name: termWith("connector.add", { name: "GitHub" }) }),
    );
    added();
    // Installing moves to Installed, where the new card is.
    const card = await screen.findByRole("region", { name: "GitHub" });
    expect(screen.getByRole("link", { name: term("abilities.installed") })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const form = within(card).getByRole("form", { name: term("connector.client") });
    expect(form).toHaveTextContent("http://127.0.0.1:4317/oauth/callback/github");
    const secret = within(form).getByLabelText(term("connector.client.secret"));
    expect(secret).toHaveAttribute("type", "password");
    await user.type(within(form).getByLabelText(term("connector.client.id")), "Iv1.abc");
    await user.type(secret, "shh");
    await user.click(within(form).getByRole("button", { name: term("connector.client.save") }));
    expect(fake.calls).toContainEqual({
      method: "PUT",
      path: "/connectors/github/client",
      body: { clientId: "Iv1.abc", clientSecret: "shh" },
    });
    expect(await within(form).findByText(term("connector.client.set"))).toBeInTheDocument();
    // Saved: the fields give way to a way to replace it, and the sign-in starts at once.
    expect(within(form).queryByLabelText(term("connector.client.id"))).toBeNull();
    expect(fake.calls).toContainEqual({
      method: "POST",
      path: "/connectors/github/connect",
      body: undefined,
    });
    // Notion registers its own clients: no form there.
    await user.click(screen.getByRole("link", { name: term("abilities.discover") }));
    await user.click(
      await screen.findByRole("button", { name: termWith("connector.add", { name: "Notion" }) }),
    );
    added();
    const notion = await screen.findByRole("region", { name: "Notion" });
    expect(within(notion).queryByRole("form")).toBeNull();
  });

  it("walks through Gmail's setup: each step, its console link, the scope, and the redirect", async () => {
    const user = userEvent.setup();
    const fake = fakeApi();
    fake.connectors.push(gmail());
    renderApp("/system/abilities/installed", fake);
    const card = await screen.findByRole("region", { name: "Gmail" });
    const form = within(card).getByRole("form", { name: term("connector.client") });
    const steps = within(form).getByRole("list", { name: term("connector.client.steps") });
    const items = within(steps).getAllByRole("listitem");
    // The Gmail API alone: no preview program, no MCP API.
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveTextContent(/enable the Gmail API/);
    expect(steps).not.toHaveTextContent(/Developer Preview|MCP API|gmailmcp/);
    expect(items[1]).toHaveTextContent(/seven days/);
    expect(items[2]).toHaveTextContent("https://www.googleapis.com/auth/gmail.modify");
    const apis = within(items[0] as HTMLElement).getByRole("link");
    expect(apis).toHaveAttribute(
      "href",
      "https://console.cloud.google.com/apis/library/gmail.googleapis.com",
    );
    expect(apis).toHaveAttribute("target", "_blank");
    expect(apis).toHaveAttribute("rel", "noopener noreferrer");
    // The redirect URL copies in one click.
    await user.click(within(form).getByRole("button", { name: term("connector.client.copy") }));
    expect(await navigator.clipboard.readText()).toBe("http://127.0.0.1:4317/oauth/callback/gmail");
    expect(within(form).getByText(term("connector.client.copied"))).toBeInTheDocument();
  });

  it("keeps a saved OAuth app out of the way until the Commander replaces it", async () => {
    const user = userEvent.setup();
    const fake = fakeApi();
    fake.connectors.push(gmail({ set: true }));
    renderApp("/system/abilities/installed", fake);
    const card = await screen.findByRole("region", { name: "Gmail" });
    const form = within(card).getByRole("form", { name: term("connector.client") });
    expect(within(form).getByText(term("connector.client.set"))).toBeInTheDocument();
    expect(within(form).queryByLabelText(term("connector.client.id"))).toBeNull();
    // The setup steps fold away once an app is saved.
    expect(form.querySelector("details")).not.toHaveAttribute("open");
    await user.click(within(form).getByRole("button", { name: term("connector.client.replace") }));
    expect(within(form).getByLabelText(term("connector.client.id"))).toBeInTheDocument();
    await user.click(within(form).getByRole("button", { name: term("connector.client.cancel") }));
    expect(within(form).queryByLabelText(term("connector.client.id"))).toBeNull();
  });

  it("offers the sign-in a connector asks for, without pressing Connect first", async () => {
    // A tool call found the sign-in refused: the daemon asks for a new one.
    const fake = fakeApi();
    fake.connectors.push({
      ...gmail({ set: true }),
      status: "needs_auth",
      authorizationUrl: "https://accounts.example.test/auth?state=s2",
    });
    renderApp("/system/abilities/installed", fake);
    const card = await screen.findByRole("region", { name: "Gmail" });
    expect(within(card).getByRole("status", { name: "Gmail status" })).toHaveTextContent(
      term("connectorStatus.needs_auth"),
    );
    expect(
      within(card).getByRole("link", { name: `${term("connector.signIn")} Gmail` }),
    ).toHaveAttribute("href", "https://accounts.example.test/auth?state=s2");
  });

  it("shows a connected Notion's status and tools with their class, without who is granted it", async () => {
    renderApp("/system/abilities/installed", withNotion());
    const card = await screen.findByRole("region", { name: "Notion" });
    expect(within(card).getByRole("status", { name: "Notion status" })).toHaveTextContent(
      term("connectorStatus.connected"),
    );
    const tools = within(card)
      .getAllByRole("listitem")
      .map((li) => `${li.dataset.tool}:${li.dataset.class}`);
    expect(tools).toEqual(["notion-search:read", "notion-update-page:write"]);
    // However many tools a server offers, the list scrolls in a box of bounded height.
    const list = within(card).getByRole("list", { name: term("connector.tools") });
    expect(list.className).toMatch(/max-h-/);
    expect(list.className).toMatch(/overflow-y-auto/);
    // Grants are made and shown on each crew member's page, not here.
    expect(within(card).queryByText(/Granted to/)).toBeNull();
    expect(
      within(card).queryByRole("button", { name: term("connector.remove") }),
    ).not.toBeInTheDocument();
  });

  it("connects, and when sign-in is needed offers a link to open in a new tab", async () => {
    const user = userEvent.setup();
    const fake = withNotion("disconnected");
    fake.connectAnswer.status = "needs_auth";
    fake.connectAnswer.authorizationUrl = "https://auth.example.test/authorize?state=s1";
    renderApp("/system/abilities/installed", fake);
    const card = await screen.findByRole("region", { name: "Notion" });
    await user.click(within(card).getByRole("button", { name: term("connector.connect") }));
    const link = await within(card).findByRole("link", {
      name: `${term("connector.signIn")} Notion`,
    });
    expect(link).toHaveAttribute("href", "https://auth.example.test/authorize?state=s1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(card).getByText(term("connector.signInHint"))).toBeInTheDocument();
  });

  it("drops an old sign-in link once a connector signed in and then disconnected", async () => {
    const user = userEvent.setup();
    const fake = withNotion("disconnected");
    fake.connectAnswer.status = "needs_auth";
    fake.connectAnswer.authorizationUrl = "https://auth.example.test/authorize?state=s1";
    const { emit } = renderApp("/system/abilities/installed", fake);
    const card = await screen.findByRole("region", { name: "Notion" });
    const signIn = { name: `${term("connector.signIn")} Notion` };
    await user.click(within(card).getByRole("button", { name: term("connector.connect") }));
    await within(card).findByRole("link", signIn);
    // The Commander signs in in the other tab; the daemon's callback connects it.
    const first = fake.connectors[0];
    if (first) {
      const { authorizationUrl: _signedIn, ...rest } = first;
      fake.connectors[0] = { ...rest, status: "connected" };
    }
    emit({ type: "connector.status", payload: { connectorId: "notion", status: "connected" } });
    await user.click(
      await within(card).findByRole("button", { name: term("connector.disconnect") }),
    );
    emit({ type: "connector.status", payload: { connectorId: "notion", status: "disconnected" } });
    await within(card).findByRole("button", { name: term("connector.connect") });
    expect(fake.connectors[0]).not.toHaveProperty("authorizationUrl");
    expect(within(card).queryByRole("link", signIn)).toBeNull();
  });

  it("disconnects, or disconnects and forgets the sign-in", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/system/abilities/installed", withNotion());
    const card = await screen.findByRole("region", { name: "Notion" });
    await user.click(within(card).getByRole("button", { name: term("connector.forget") }));
    expect(calls).toContainEqual({
      method: "POST",
      path: "/connectors/notion/disconnect",
      body: { forget: true },
    });
  });

  it("saves a new server URL", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/system/abilities/installed", withNotion("disconnected"));
    const card = await screen.findByRole("region", { name: "Notion" });
    const field = within(card).getByLabelText(term("connector.url"));
    await user.clear(field);
    await user.type(field, "https://mcp.example.test/mcp");
    await user.click(within(card).getByRole("button", { name: term("connector.save") }));
    expect(calls).toContainEqual({
      method: "PATCH",
      path: "/connectors/notion",
      body: { url: "https://mcp.example.test/mcp" },
    });
  });

  it("says why a connector could not connect", async () => {
    const fake = withNotion("disconnected");
    const first = fake.connectors[0];
    if (first) fake.connectors[0] = { ...first, status: "error", detail: "connect ECONNREFUSED" };
    renderApp("/system/abilities/installed", fake);
    const card = await screen.findByRole("region", { name: "Notion" });
    expect(within(card).getByRole("status", { name: "Notion status" })).toHaveTextContent(
      `${term("connectorStatus.error")}: connect ECONNREFUSED`,
    );
  });

  it.each(["/connectors", "/system/abilities/installed"])(
    "lives under Abilities, not Settings: %s lands on Installed",
    async (path) => {
      renderApp(path, withNotion());
      expect(
        await screen.findByRole("heading", { level: 1, name: term("abilities") }),
      ).toBeInTheDocument();
      const section = await screen.findByRole("region", { name: term("abilities.installed") });
      expect(section).toHaveAttribute("id", "connectors");
      expect(within(section).getByRole("region", { name: "Notion" })).toBeInTheDocument();
      const nav = screen.getByRole("navigation", { name: "Primary" });
      expect(within(nav).queryByRole("link", { name: term("abilities") })).toBeNull();
    },
  );

  it("sends an empty Installed to Discover", async () => {
    renderApp("/system/abilities/installed");
    const section = await screen.findByRole("region", { name: term("abilities.installed") });
    expect(await within(section).findByText(term("empty.connectors.title"))).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: term("abilities.discover") })).toHaveAttribute(
      "href",
      "/system/abilities/discover",
    );
  });

  it("opens Abilities on Discover in a side menu of Discover and Installed", async () => {
    renderApp("/system/abilities");
    const nav = await screen.findByRole("navigation", { name: term("abilities.nav") });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((l) => l.textContent),
    ).toEqual([term("abilities.discover"), term("abilities.installed")]);
    await waitFor(() =>
      expect(within(nav).getByRole("link", { name: term("abilities.discover") })).toHaveAttribute(
        "aria-current",
        "page",
      ),
    );
  });

  it("has no axe violations", async () => {
    const fake = withNotion();
    fake.connectors.push(gmail());
    const { container } = renderApp("/system/abilities/installed", fake);
    await screen.findByRole("region", { name: "Gmail" });
    expect(await axe(container)).toHaveNoViolations();
  });
});
