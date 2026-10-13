import { lookFor } from "../characters.js";
import type { AgentConfig } from "../config/agent-config.js";
import type { StationConfig } from "../config/station-config.js";
import type { GlossaryKey } from "../glossary.js";
import type { CrewActivityEntry } from "../run/crew-activity.js";
import type { RunState } from "../run/run-state.js";
import { laneLabel, type Point, placeRooms, type Rect, routeBetween, tagPoint } from "./layout.js";
import {
  alertCount,
  type CrewDisplayStatus,
  crewDisplayStatus,
  type RunDisplayStatus,
  runDisplayStatus,
  sortRuns,
} from "./status.js";

/**
 * The station dashboard as one pure projection of runtime state (ADR-0013): rooms placed on the
 * map with their crew, grants and alerts; hallways routed between them with live traffic; the
 * roster; and the header counts. The ui renders this and nothing else, so everything on screen
 * traces back to the station config, the event log, or the run table.
 */

export interface DashboardRun {
  readonly id: string;
  readonly agentId: string;
  readonly sessionId: string;
  readonly state: RunState;
  readonly createdAt: string;
  readonly steps: number;
  readonly title: string;
}

export interface DashboardInput {
  readonly station: StationConfig;
  readonly agents: readonly { readonly id: string; readonly config: AgentConfig }[];
  /** Folded crew activity (GET /api/activity `crew`); absent means idle. */
  readonly activity: Readonly<Record<string, CrewActivityEntry>>;
  /** Recent runs, any order (GET /api/runs). */
  readonly runs: readonly DashboardRun[];
  /** Dispatches still running: who they went to. */
  readonly dispatches: readonly { readonly workerAgentId: string }[];
  /** Runs in flight now (GET /api/activity `runs`): the TASKS LIVE count. */
  readonly activeRunCount: number;
  /** Memory proposals awaiting a decision, station-wide. */
  readonly pendingMemoryProposals: number;
}

export interface DashboardCrew {
  readonly id: string;
  readonly name: string;
  readonly roomId: string;
  readonly overseer: boolean;
  readonly status: CrewDisplayStatus;
  readonly look: number;
  readonly colorIndex: number;
  /** Why the last run ended badly, when it did. */
  readonly detail?: string;
  readonly sessionId?: string;
}

export interface DashboardGrant {
  /** `prop:web`, `connector:notion`. */
  readonly key: string;
  /** The in-fiction object word (glossary). */
  readonly object: GlossaryKey;
  /** The real capability's name: a glossary key for a prop, the connector's own name otherwise. */
  readonly real: { readonly term: GlossaryKey } | { readonly name: string };
  readonly scope: "read" | "write";
}

export interface DashboardRoom {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly sector: string;
  readonly colorIndex: number;
  readonly rect: Rect;
  readonly bridge: boolean;
  readonly crew: readonly DashboardCrew[];
  readonly grants: readonly DashboardGrant[];
  /** A crew member here is blocked. */
  readonly alert: boolean;
}

export interface DashboardLane {
  readonly id: string;
  readonly label: string;
  readonly from: string;
  readonly to: string;
  readonly note?: string;
  readonly route: readonly Point[];
  readonly tag?: Point;
  /** Dispatches running to crew in a room this hallway joins to the Bridge (ADR-0013 #9). */
  readonly traffic: number;
  /** The room whose color the packets take: the end that is not the Bridge. */
  readonly packetRoom: string;
}

export interface DashboardMission extends DashboardRun {
  readonly status: RunDisplayStatus;
  readonly roomId?: string;
}

export interface Dashboard {
  readonly rooms: readonly DashboardRoom[];
  readonly lanes: readonly DashboardLane[];
  /** Every crew member, the Overseer last (the roster shows it as "+ OV"). */
  readonly crew: readonly DashboardCrew[];
  readonly overseer?: DashboardCrew;
  readonly bridgeId?: string;
  /** Sorted the design's way: blocked, running, queued, halted or failed, done. */
  readonly missions: readonly DashboardMission[];
  readonly liveCount: number;
  readonly alerts: number;
}

const PROP_OBJECT = {
  web: "object.web",
  files: "object.files",
  memory: "object.memory",
} as const satisfies Record<string, GlossaryKey>;
const PROP_REAL = { web: "prop.web", files: "prop.files", memory: "prop.memory" } as const;
const PROP_SCOPE = { web: "read", files: "write", memory: "read" } as const;

export function dashboardModel(input: DashboardInput): Dashboard {
  const { station, agents, activity } = input;
  const overseerAgent = agents.find((a) => a.config.role === "overseer");
  const bridgeId = overseerAgent?.config.roomId;
  const placed = placeRooms(
    station.rooms.map((r) => r.id),
    bridgeId,
  );
  const placement = new Map(placed.map((p) => [p.id, p]));
  const roomOf = new Map(agents.map((a) => [a.id, a.config.roomId]));

  const crew: DashboardCrew[] = agents.map(({ id, config }) => {
    const entry = activity[id] ?? { state: "idle" as const, runs: 0 };
    return {
      id,
      name: config.name,
      roomId: config.roomId,
      overseer: config.role === "overseer",
      status: crewDisplayStatus(entry),
      look: lookFor(id, config.look),
      colorIndex: placement.get(config.roomId)?.colorIndex ?? 0,
      ...(entry.detail ? { detail: entry.detail } : {}),
      ...(entry.sessionId ? { sessionId: entry.sessionId } : {}),
    };
  });

  const rooms: DashboardRoom[] = station.rooms.flatMap((room) => {
    const p = placement.get(room.id);
    if (!p) return [];
    const here = crew.filter((c) => c.roomId === room.id);
    const connectorIds = [
      ...new Set(
        agents.filter((a) => a.config.roomId === room.id).flatMap((a) => a.config.connectorGrants),
      ),
    ];
    const grants: DashboardGrant[] = [
      ...room.props.map((prop) => ({
        key: `prop:${prop.kind}`,
        object: PROP_OBJECT[prop.kind],
        real: { term: PROP_REAL[prop.kind] },
        scope: PROP_SCOPE[prop.kind],
      })),
      ...connectorIds.map((id) => ({
        key: `connector:${id}`,
        object: "object.connector" as const,
        real: { name: station.connectors.find((c) => c.id === id)?.name ?? id },
        scope: "write" as const,
      })),
    ];
    return [
      {
        id: room.id,
        name: room.name,
        ...(room.description ? { description: room.description } : {}),
        sector: p.sector,
        colorIndex: p.colorIndex,
        rect: p.rect,
        bridge: p.bridge,
        crew: here,
        grants,
        alert: here.some((c) => c.status === "blocked"),
      },
    ];
  });

  const dispatchedTo = new Map<string, number>();
  for (const d of input.dispatches) {
    const room = roomOf.get(d.workerAgentId);
    if (room) dispatchedTo.set(room, (dispatchedTo.get(room) ?? 0) + 1);
  }
  const lanes: DashboardLane[] = station.lanes.map((lane, i) => {
    const a = placement.get(lane.from);
    const b = placement.get(lane.to);
    const others = placed.filter((p) => p.id !== lane.from && p.id !== lane.to).map((p) => p.rect);
    const route = a && b ? routeBetween(a.rect, b.rect, others) : [];
    const tag = tagPoint(route);
    const far = lane.from === bridgeId ? lane.to : lane.from;
    const touchesBridge = lane.from === bridgeId || lane.to === bridgeId;
    return {
      id: lane.id,
      label: laneLabel(i),
      from: lane.from,
      to: lane.to,
      ...(lane.note ? { note: lane.note } : {}),
      route,
      ...(tag ? { tag } : {}),
      traffic: touchesBridge ? (dispatchedTo.get(far) ?? 0) : 0,
      packetRoom: touchesBridge ? far : lane.to,
    };
  });

  const missions: DashboardMission[] = sortRuns(input.runs).map((run) => {
    const roomId = roomOf.get(run.agentId);
    return { ...run, status: runDisplayStatus(run.state), ...(roomId ? { roomId } : {}) };
  });

  const overseer = crew.find((c) => c.overseer);
  return {
    rooms,
    lanes,
    crew: [...crew.filter((c) => !c.overseer), ...(overseer ? [overseer] : [])],
    ...(overseer ? { overseer } : {}),
    ...(bridgeId ? { bridgeId } : {}),
    missions,
    liveCount: input.activeRunCount,
    alerts: alertCount(
      crew.map((c) => c.status),
      input.pendingMemoryProposals,
    ),
  };
}
