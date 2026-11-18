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

/** Gmail as the daemon lists it: a server that needs the Commander's own OAuth app. */
const gmail = (ownClient: { set: boolean } = { set: false }): ConnectorItem => ({
  id: "gmail",
  name: "Gmail",
  url: "https://gmailmcp.googleapis.com/mcp/v1",
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
    await user.click(await screen.findByRole("button", { name: add("Notion") }));
    expect(calls).toContainEqual({
      method: "POST",
      path: "/connectors",
      body: { preset: "notion" },
    });
    expect(screen.getByRole("button", { name: add("GitHub") })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: add("Gmail") })).toBeInTheDocument();
  });

  it("discovers only the presets not installed yet", async () => {
    renderApp("/system/abilities/discover", withNotion());
    const adding = await screen.findByRole("region", { name: term("abilities.discover") });
    expect((await within(adding).findAllByRole("button")).map((b) => b.textContent)).toEqual([
      termWith("connector.add", { name: "GitHub" }),
      termWith("connector.add", { name: "Gmail" }),
    ]);
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
    expect(items).toHaveLength(6);
    expect(items[0]).toHaveTextContent(/Developer Preview Program/);
    expect(items[1]).toHaveTextContent(/Gmail MCP API/);
    expect(items[3]).toHaveTextContent("https://www.googleapis.com/auth/gmail.modify");
    const apis = within(items[1] as HTMLElement).getByRole("link");
    expect(apis).toHaveAttribute(
      "href",
      "https://console.cloud.google.com/apis/library/gmailmcp.googleapis.com",
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

  it("shows a connected Notion's status, tools with their class, and who is granted it", async () => {
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
    expect(within(card).getByText(`${term("connector.grantedTo")}: Quill`)).toBeInTheDocument();
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
