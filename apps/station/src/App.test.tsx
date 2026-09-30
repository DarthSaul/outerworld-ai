import { type RuntimeEvent, term } from "@darthsaul/outerworld-ai-core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { axe } from "vitest-axe";
import { App, SCREENS } from "./App.js";
import { type Connect, DaemonProvider } from "./daemon-context.js";
import type { ConnectOptions } from "./lib/event-stream.js";
import { MissingToken } from "./pages/MissingToken.js";

const event = (seq: number, type: "station.started" | "station.updated"): RuntimeEvent => ({
  seq,
  type,
  at: `2026-09-29T12:00:0${seq}.000Z`,
  payload: {},
});

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
    expect(within(nav).getByRole("link", { name: term("station") })).toHaveAttribute(
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

  it("Station shows only what the event log proves: empty, then events newest first", () => {
    const { conn } = renderAt("/");
    expect(screen.getByText(term("empty.events.title"))).toBeInTheDocument();
    expect(screen.getByText(`${term("events.latest")} #0`)).toBeInTheDocument();
    conn.emit(event(1, "station.started"));
    conn.emit(event(2, "station.updated"));
    expect(screen.getByText(`${term("events.latest")} #2`)).toBeInTheDocument();
    const items = screen.getAllByRole("listitem").filter((li) => li.dataset.eventType);
    expect(items.map((li) => li.dataset.eventType)).toEqual(["station.updated", "station.started"]);
  });

  it("renders a placeholder for screens later phases build", () => {
    renderAt("/comms");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(term("comms"));
    expect(screen.getByText(/phase 3/)).toBeInTheDocument();
  });

  it("has no axe violations on the Station screen with events", async () => {
    const { conn, container } = renderAt("/");
    conn.emit(event(1, "station.started"));
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
