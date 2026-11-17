import { term, termWith } from "@darthsaul/outerworld-ai-core";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
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

describe("Connectors, a section of Settings", () => {
  it("ignores a malformed fragment in the address", async () => {
    renderApp("/settings#%E0%A4%A");
    expect(
      await screen.findByRole("heading", { name: term("settings"), level: 1 }),
    ).toBeInTheDocument();
  });

  it("offers Notion, GitHub, and Gmail when the station has no connectors", async () => {
    const user = userEvent.setup();
    const { calls } = renderApp("/settings/connectors");
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

  it("offers the presets not installed yet beside the installed ones", async () => {
    renderApp("/settings/connectors", withNotion());
    const adding = await screen.findByRole("region", { name: term("connector.add.title") });
    expect(
      within(adding)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual([
      termWith("connector.add", { name: "GitHub" }),
      termWith("connector.add", { name: "Gmail" }),
    ]);
  });

  it("takes GitHub's OAuth app: shows the redirect, sends the client, never shows it back", async () => {
    const user = userEvent.setup();
    const fake = fakeApi();
    const { emit } = renderApp("/settings/connectors", fake);
    // The daemon announces a station change after each install.
    const added = () => emit({ type: "station.updated", payload: {} });
    await user.click(
      await screen.findByRole("button", { name: termWith("connector.add", { name: "GitHub" }) }),
    );
    added();
    const card = await screen.findByRole("region", { name: "GitHub" });
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
    expect(within(form).getByLabelText(term("connector.client.id"))).toHaveValue("");
    // Notion registers its own clients: no form there.
    await user.click(
      screen.getByRole("button", { name: termWith("connector.add", { name: "Notion" }) }),
    );
    added();
    const notion = await screen.findByRole("region", { name: "Notion" });
    expect(within(notion).queryByRole("form")).toBeNull();
  });

  it("shows a connected Notion's status, tools with their class, and who is granted it", async () => {
    renderApp("/settings/connectors", withNotion());
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
    renderApp("/settings/connectors", fake);
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
    const { calls } = renderApp("/settings/connectors", withNotion());
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
    const { calls } = renderApp("/settings/connectors", withNotion("disconnected"));
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
    renderApp("/settings/connectors", fake);
    const card = await screen.findByRole("region", { name: "Notion" });
    expect(within(card).getByRole("status", { name: "Notion status" })).toHaveTextContent(
      `${term("connectorStatus.error")}: connect ECONNREFUSED`,
    );
  });

  it("lives under Settings: no tab of its own, and the old address lands on the section", async () => {
    renderApp("/connectors", withNotion());
    expect(
      await screen.findByRole("heading", { level: 1, name: term("settings") }),
    ).toBeInTheDocument();
    const section = await screen.findByRole("region", { name: term("connectors") });
    expect(section).toHaveAttribute("id", "connectors");
    expect(within(section).getByRole("region", { name: "Notion" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(within(nav).queryByRole("link", { name: term("connectors") })).toBeNull();
  });

  it("has no axe violations", async () => {
    const { container } = renderApp("/settings/connectors", withNotion());
    await screen.findByRole("region", { name: "Notion" });
    expect(await axe(container)).toHaveNoViolations();
  });
});
