import { type RuntimeEvent, term } from "@darthsaul/outerworld-ai-core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { App, SCREENS } from "./App.js";
import { type Connect, DaemonProvider } from "./daemon-context.js";
import type { ConnectOptions } from "./lib/event-stream.js";
import { MissingToken } from "./pages/MissingToken.js";
import { fakeApi, renderApp } from "./test/fake-daemon.js";

/** A connection the test drives by hand. */
const fakeConnection = () => {
  let opts: ConnectOptions | undefined;
  let closed = false;
  const connect: Connect = (o) => {
    opts = o;
    return {
      close: () => {
        closed = true;
      },
    };
  };
  return {
    connect,
    emit: (e: RuntimeEvent) => act(() => opts?.onEvent(e)),
    status: (s: Parameters<NonNullable<ConnectOptions["onStatus"]>>[0]) =>
      act(() => opts?.onStatus?.(s)),
    options: () => opts,
    closed: () => closed,
  };
};

const renderAt = (path: string, conn = fakeConnection()) => {
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <DaemonProvider token="tok" connect={conn.connect}>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </DaemonProvider>
    </QueryClientProvider>,
  );
  return { ...view, conn };
};

describe("App shell", () => {
  it("links every v1 screen by its glossary name and marks the current one", () => {
    renderAt("/");
    const nav = screen.getByRole("navigation", { name: "Primary" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(SCREENS.map((s) => term(s.label)));
    expect(within(nav).getByRole("link", { name: term("tab.station") })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("opens one event stream with the token and closes it on unmount", () => {
    const { conn, unmount } = renderAt("/");
    expect(conn.options()).toMatchObject({ url: "/api/events", token: "tok" });
    unmount();
    expect(conn.closed()).toBe(true);
  });

  it("shows the connection status from the stream", () => {
    const { conn } = renderAt("/");
    conn.status("connected");
    expect(screen.getByRole("status", { name: "Connection" })).toHaveTextContent(
      term("connection.connected"),
    );
    conn.status("reconnecting");
    expect(screen.getByRole("status", { name: "Connection" })).toHaveTextContent(
      term("connection.reconnecting"),
    );
  });

  it("renders every screen's own page, with no placeholders left", () => {
    renderAt("/memory");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(term("memory"));
    expect(screen.getByText(term("memory.pick"))).toBeInTheDocument();
  });
});

describe("Station chrome", () => {
  it("names the station, counts live tasks and alerts, and plays the radio from notifications", async () => {
    const fake = fakeApi();
    fake.crewActivity.quill = { state: "awaiting_consent", runs: 1, sessionId: "s1" };
    fake.notifications.push({
      seq: 1,
      at: "2026-09-29T12:00:00.000Z",
      kind: "run_failed",
      level: "alert",
      agentId: "quill",
      detail: "HTTP 500",
    });
    renderApp("/", fake);
    const header = screen.getByRole("banner");
    expect(await within(header).findByText("Test Station")).toBeInTheDocument();
    expect(within(header).getByText("Overseer console · 2 rooms · 2 crew")).toBeInTheDocument();
    await waitFor(() =>
      expect(within(header).getByText(term("stat.alerts")).nextSibling).toHaveTextContent("1"),
    );
    const radio = within(header).getByRole("region", { name: term("radio.title") });
    expect(await within(radio).findByText("A run by Quill failed: HTTP 500")).toBeInTheDocument();
    expect(within(radio).getByText("Quill")).toBeInTheDocument();
  });

  it("shows vitals in the footer: today's tokens, fuel against the daily cap, uptime", async () => {
    const fake = fakeApi();
    fake.spend.tokens = 1_284_000;
    fake.spend.stationUsd = 12.5;
    fake.state.station = { ...fake.state.station, budgets: { stationDailyUsd: 50 } };
    renderApp("/", fake);
    const footer = screen.getByRole("contentinfo");
    expect(await within(footer).findByText("1.284M")).toBeInTheDocument();
    expect(
      await within(footer).findByRole("meter", { name: "Fuel · $12.50 / $50.00 day" }),
    ).toBeInTheDocument();
    expect(await within(footer).findByText(/^\d{2}d \d{2}:\d{2}:\d{2}$/)).toBeInTheDocument();
  });

  it("turns the CRT overlay off and remembers it", async () => {
    const user = userEvent.setup();
    const { container, unmount } = renderApp("/");
    expect(container.querySelector(".st-crt")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: term("crt.label") }));
    expect(container.querySelector(".st-crt")).toBeNull();
    unmount();
    const again = renderApp("/");
    expect(again.container.querySelector(".st-crt")).toBeNull();
    await user.click(screen.getByRole("button", { name: term("crt.label") }));
  });

  it("has no axe violations on the Station screen", async () => {
    const { container } = renderApp("/");
    await screen.findByRole("region", { name: term("map.title") });
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("MissingToken", () => {
  it("tells the Commander how to open the page from the daemon, accessibly", async () => {
    const { container } = render(<MissingToken />);
    expect(screen.getByRole("heading")).toHaveTextContent(/daemon/);
    expect(await axe(container)).toHaveNoViolations();
  });
});
