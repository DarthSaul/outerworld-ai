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

export interface DaemonState {
  readonly api: Api;
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
  } else if (event.type === "station.updated") {
    void client.invalidateQueries({ queryKey: ["station"] });
    void client.invalidateQueries({ queryKey: ["agent"] });
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

  useEffect(() => {
    const conn = connect({
      url: "/api/events",
      token,
      onStatus: setStatus,
      onEvent: (e) => {
        if (e.ephemeral) return;
        setRecent((prev) => [e, ...prev].slice(0, RECENT));
        invalidateFor(e, queryClient);
      },
    });
    return () => conn.close();
  }, [token, connect, queryClient]);

  const value = useMemo(
    () => ({ api, status, recent, latestSeq: recent[0]?.seq ?? 0 }),
    [api, status, recent],
  );
  return <DaemonContext.Provider value={value}>{children}</DaemonContext.Provider>;
}

export function useDaemon(): DaemonState {
  const value = useContext(DaemonContext);
  if (!value) throw new Error("useDaemon needs a DaemonProvider");
  return value;
}
