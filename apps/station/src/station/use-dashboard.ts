import { type Dashboard, dashboardModel, term } from "@darthsaul/outerworld-ai-core";
import {
  MAP_STYLES,
  type MapStyle,
  type RadioEntry,
  roomColorVar,
  stVar,
} from "@darthsaul/outerworld-ai-ui";
import { useMemo, useState } from "react";
import { notificationText } from "../components/notification-text.js";
import {
  type MemoryItem,
  useActivity,
  useMemoryProposals,
  useNotifications,
  useRecentRuns,
  useStationView,
} from "../queries.js";

/** How many radio lines the header keeps (the design caps its log at 40). */
const RADIO_LINES = 40;

export interface DashboardState {
  readonly dashboard?: Dashboard;
  readonly proposals: readonly MemoryItem[];
  readonly error: Error | null;
}

/**
 * The dashboard model from live queries: the station config, folded crew activity, recent runs,
 * running dispatches, and pending memory proposals. Undefined until the station has loaded.
 */
export function useDashboard(): DashboardState {
  const station = useStationView();
  const activity = useActivity();
  const runs = useRecentRuns();
  const agentIds = useMemo(
    () => station.data?.agents.map((a) => a.id) ?? [],
    [station.data?.agents],
  );
  const proposals = useMemoryProposals(agentIds);
  const dashboard = useMemo(() => {
    const config = station.data?.station;
    if (!config || !station.data) return undefined;
    return dashboardModel({
      station: config,
      agents: station.data.agents,
      activity: activity.data?.crew ?? {},
      runs: runs.data ?? [],
      dispatches: activity.data?.dispatches ?? [],
      activeRunCount: activity.data?.runs.length ?? 0,
      pendingMemoryProposals: proposals.length,
    });
  }, [station.data, activity.data, runs.data, proposals.length]);
  return {
    ...(dashboard ? { dashboard } : {}),
    proposals,
    error: station.error ?? activity.error ?? runs.error,
  };
}

/** The header's radio: the notification feed, each line in its speaker's room color. */
export function useRadio(dashboard: Dashboard | undefined): RadioEntry[] {
  const feed = useNotifications();
  const station = useStationView();
  return useMemo(() => {
    const items = feed.data?.pages.flatMap((p) => p.items).slice(0, RADIO_LINES) ?? [];
    const crew = new Map(dashboard?.crew.map((c) => [c.id, c]) ?? []);
    const connectorName = (id: string) =>
      station.data?.station?.connectors.find((c) => c.id === id)?.name ?? id;
    const nameOf = (id: string) => crew.get(id)?.name ?? id;
    return items.map((n) => {
      const member = n.agentId ? crew.get(n.agentId) : undefined;
      const color = !member
        ? stVar("text-mute")
        : member.overseer
          ? stVar("white")
          : member.roomId === dashboard?.bridgeId
            ? stVar("cyan")
            : roomColorVar(member.colorIndex);
      return {
        id: n.seq,
        at: n.at,
        who: member?.name ?? term("station"),
        color,
        text: notificationText(n, nameOf, connectorName),
      };
    });
  }, [feed.data, dashboard, station.data]);
}

function stored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return allowed.includes(value as T) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked (private windows); the preference just won't stick.
  }
}

/** A per-viewer preference kept in localStorage (ADR-0013 #19). */
export function usePreference<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): [T, (value: T) => void] {
  const [value, setValue] = useState(() => stored(key, allowed, fallback));
  return [
    value,
    (next: T) => {
      setValue(next);
      store(key, next);
    },
  ];
}

export const useMapStyle = () =>
  usePreference<MapStyle>("outerworld.mapStyle", MAP_STYLES, "schematic");
export const useCrt = () => usePreference<"on" | "off">("outerworld.crt", ["on", "off"], "on");
