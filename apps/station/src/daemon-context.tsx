import type { RuntimeEvent } from "@darthsaul/outerworld-ai-core";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { type Api, createApi } from "./lib/api.js";
import {
  type Connection,
  type ConnectionStatus,
  type ConnectOptions,
  connectEvents,
} from "./lib/event-stream.js";

/** How many recent events the shell keeps in memory for the activity view. */
const RECENT = 50;

export type EventListener = (event: RuntimeEvent) => void;

export interface DaemonState {
  readonly api: Api;
  /** Every event as it arrives, ephemeral ones included (streamed text). Returns unsubscribe. */
  readonly subscribe: (listener: EventListener) => () => void;
  readonly status: ConnectionStatus;
  readonly latestSeq: number;
  /** Newest first. */
  readonly recent: readonly RuntimeEvent[];
}

const DaemonContext = createContext<DaemonState | null>(null);

/**
 * Events are the only signal that server state changed: each one invalidates the queries it can
 * affect, so every open tab refetches and stays true to the daemon.
 */
export function invalidateFor(event: RuntimeEvent, client: QueryClient): void {
  if (event.type === "agent.updated") {
    void client.invalidateQueries({ queryKey: ["station"] });
    void client.invalidateQueries({ queryKey: ["agent", event.agentId] });
    void client.invalidateQueries({ queryKey: ["schedules", event.agentId] });
  } else if (event.type === "station.updated") {
    void client.invalidateQueries({ queryKey: ["station"] });
    void client.invalidateQueries({ queryKey: ["agent"] });
    void client.invalidateQueries({ queryKey: ["connectors"] });
  } else if (event.type === "connector.status") {
    // A connector's tools change what granted crew members can use.
    void client.invalidateQueries({ queryKey: ["connectors"] });
    void client.invalidateQueries({ queryKey: ["agent"] });
  } else if (event.type.startsWith("session.")) {
    void client.invalidateQueries({ queryKey: ["sessions", event.agentId] });
    void client.invalidateQueries({ queryKey: ["session", event.sessionId] });
  } else if (event.type.startsWith("schedule.")) {
    void client.invalidateQueries({ queryKey: ["schedules", event.agentId] });
    void client.invalidateQueries({ queryKey: ["sessions", event.agentId] });
  } else if (event.type.startsWith("run.") && !event.ephemeral) {
    void client.invalidateQueries({ queryKey: ["session", event.sessionId] });
    // A schedule's history shows the state of the runs it started.
    void client.invalidateQueries({ queryKey: ["schedules", event.agentId] });
    void client.invalidateQueries({ queryKey: ["activity"] });
    void client.invalidateQueries({ queryKey: ["spend"] });
    // A run that ends while waiting expires its request; one that pauses creates one.
    void client.invalidateQueries({ queryKey: ["consents"] });
  } else if (event.type.startsWith("dispatch.")) {
    // The lead's session shows the dispatch card and, when it ends, the worker's report.
    void client.invalidateQueries({ queryKey: ["session", event.sessionId] });
    void client.invalidateQueries({ queryKey: ["activity"] });
  } else if (event.type.startsWith("consent.")) {
    void client.invalidateQueries({ queryKey: ["consents"] });
  } else if (event.type === "station.kill_switch") {
    void client.invalidateQueries({ queryKey: ["kill-switch"] });
  } else if (event.type.startsWith("memory.")) {
    // A station-wide belief shows for every crew member, so refresh them all.
    void client.invalidateQueries({ queryKey: ["memories"] });
  } else if (event.type.startsWith("budget.")) {
    void client.invalidateQueries({ queryKey: ["spend"] });
  }
}

export type Connect = (options: ConnectOptions) => Connection;

/**
 * Owns the one SSE connection for the page and the API client. Every screen renders runtime
 * state from here or from queries; nothing is simulated (the product law).
 */
export function DaemonProvider({
  token,
  connect = connectEvents,
  api: given,
  children,
}: {
  readonly token: string;
  readonly connect?: Connect;
  /** Injected in tests; otherwise a client for this token. */
  readonly api?: Api;
  readonly children: ReactNode;
}) {
  const api = useMemo(() => given ?? createApi({ token }), [given, token]);
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [recent, setRecent] = useState<RuntimeEvent[]>([]);
  const [listeners] = useState(() => new Set<EventListener>());

  useEffect(() => {
    const conn = connect({
      url: "/api/events",
      token,
      onStatus: setStatus,
      onEvent: (e) => {
        for (const l of listeners) l(e);
        if (e.ephemeral) return;
        setRecent((prev) => [e, ...prev].slice(0, RECENT));
        invalidateFor(e, queryClient);
      },
    });
    return () => conn.close();
  }, [token, connect, queryClient, listeners]);

  const subscribe = useMemo(
    () => (listener: EventListener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    [listeners],
  );
  const value = useMemo(
    () => ({ api, subscribe, status, recent, latestSeq: recent[0]?.seq ?? 0 }),
    [api, subscribe, status, recent],
  );
  return <DaemonContext.Provider value={value}>{children}</DaemonContext.Provider>;
}

export function useDaemon(): DaemonState {
  const value = useContext(DaemonContext);
  if (!value) throw new Error("useDaemon needs a DaemonProvider");
  return value;
}
