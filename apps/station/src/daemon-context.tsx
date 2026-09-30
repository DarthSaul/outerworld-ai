import type { RuntimeEvent } from "@darthsaul/outerworld-ai-core";
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

export type Connect = (options: ConnectOptions) => Connection;

/**
 * Owns the one SSE connection for the page and the API client. Every screen renders runtime
 * state from here or from queries; nothing is simulated (the product law).
 */
export function DaemonProvider({
  token,
  connect = connectEvents,
  children,
}: {
  readonly token: string;
  readonly connect?: Connect;
  readonly children: ReactNode;
}) {
  const api = useMemo(() => createApi({ token }), [token]);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [recent, setRecent] = useState<RuntimeEvent[]>([]);

  useEffect(() => {
    const conn = connect({
      url: "/api/events",
      token,
      onStatus: setStatus,
      onEvent: (e) => setRecent((prev) => [e, ...prev].slice(0, RECENT)),
    });
    return () => conn.close();
  }, [token, connect]);

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
