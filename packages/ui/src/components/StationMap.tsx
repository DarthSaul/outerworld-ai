import {
  type Agent,
  deriveRig,
  type Handoff,
  type HandoffGeometry,
  handoffGeometry,
  layoutStation,
  type Station,
  type StationState,
  term,
} from "@darthsaul/outerworld-ai-core";
import { type CSSProperties, useMemo } from "react";
import type { HealthState } from "../tokens/tokens.js";
import { HandoffLayer } from "./HandoffLayer.js";
import { OverseerCore } from "./OverseerCore.js";
import type { Selection } from "./selection.js";
import { TeamPanel, type TeamPanelAgent, type TeamPanelGrant } from "./TeamPanel.js";

export interface StationMapProps {
  readonly station: Station;
  readonly state: StationState;
  readonly selection?: Selection | null;
  readonly onSelect: (selection: Selection) => void;
  /** Stack teams in a column with the overseer on top (mobile). Handoff paths are not drawn. */
  readonly stacked?: boolean;
  /** Map zoom: one layout unit is one pixel at 1. The design allows 0.6 to 1.4. */
  readonly zoom?: number;
}

/** "14:02" in UTC from an ISO timestamp; the proof line carries the full value. */
export function timeLabel(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** The team a selection belongs to, or undefined for the overseer. */
function teamOfSelection(
  selection: Selection | null | undefined,
  station: Station,
): string | undefined {
  if (!selection) return undefined;
  switch (selection.kind) {
    case "team":
      return selection.id;
    case "agent":
      return station.agents.find((a) => a.id === selection.id)?.teamId;
    case "grant":
      return station.grants.find((g) => g.id === selection.id)?.teamId;
    case "handoff": {
      const h = station.handoffs.find((x) => x.id === selection.id);
      return h?.from;
    }
    default:
      return undefined;
  }
}

/**
 * The map: core's layout in a 1000-unit frame, an SVG handoff layer, and one TeamPanel per team as
 * HTML over it, with the overseer core at the center. Computes no geometry itself.
 */
export function StationMap({
  station,
  state,
  selection,
  onSelect,
  stacked,
  zoom = 1,
}: StationMapProps) {
  const layout = useMemo(() => layoutStation(station), [station]);
  const geometry = useMemo(() => {
    const out: Record<string, HandoffGeometry> = {};
    for (const h of station.handoffs) out[h.id] = handoffGeometry(h, layout, station.handoffs);
    return out;
  }, [station, layout]);

  const focusTeam = teamOfSelection(selection, station);
  const connected = new Set<string>();
  const emphasized = new Set<string>();
  if (focusTeam) {
    connected.add(focusTeam);
    for (const h of station.handoffs) {
      if (h.from === focusTeam || h.to === focusTeam) {
        connected.add(h.from);
        connected.add(h.to);
        emphasized.add(h.id);
      }
    }
  }
  if (selection?.kind === "handoff") {
    const h = station.handoffs.find((x) => x.id === selection.id);
    if (h) {
      connected.add(h.from);
      connected.add(h.to);
    }
  }

  const teamName = (id: string) => station.teams.find((t) => t.id === id)?.name ?? id;
  const handoffItems = station.handoffs.map((h: Handoff) => ({
    id: h.id,
    from: h.from,
    to: h.to,
    label: `${teamName(h.from)} to ${teamName(h.to)}`,
  }));
  const carrying: Record<string, boolean> = {};
  for (const h of station.handoffs) carrying[h.id] = state.handoffs[h.id]?.carrying ?? false;

  const lastPost = timeLabel(state.overseer.lastOutwardPostAt);
  const overseer = (
    <OverseerCore
      name={station.overseer.persona.name}
      roleNoun={term("overseer.role")}
      state={state.overseer.state}
      {...(lastPost !== undefined ? { lastPostLabel: lastPost } : {})}
      attentionCount={state.overseer.attention.length}
      selected={selection?.kind === "overseer"}
      onSelect={onSelect}
    />
  );

  const panels = station.teams.map((t) => {
    const ts = state.teams[t.id];
    const health: HealthState = ts?.health ?? "ok";
    const grants: TeamPanelGrant[] = station.grants
      .filter((g) => g.teamId === t.id)
      .map((g) => ({ id: g.id, mode: g.mode, label: g.label ?? g.tool }));
    const agents: TeamPanelAgent[] = station.agents
      .filter((a: Agent) => a.teamId === t.id)
      .map((a) => ({
        id: a.id,
        name: a.persona.name,
        mandate: a.persona.mandate,
        rig: a.persona.rig,
        derived: deriveRig(a, station),
        state: state.agents[a.id]?.state ?? "idle",
      }));
    const last = timeLabel(ts?.lastRun?.startedAt);
    return (
      <TeamPanel
        key={t.id}
        id={t.id}
        name={t.name}
        mission={t.mission}
        emblem={t.emblem}
        health={health}
        run={ts?.run ?? "idle"}
        {...(last ? { lastRunLabel: last } : {})}
        healthLabel={term(`health.${health}`)}
        grants={grants}
        agents={agents}
        selection={selection ?? null}
        dimmed={focusTeam !== undefined && !connected.has(t.id)}
        onSelect={onSelect}
        agentColumns={1}
      />
    );
  });

  if (stacked) {
    return (
      <div
        className="ow-map-stacked flex flex-col items-stretch gap-(--ow-space-4)"
        data-map-stacked
      >
        <div className="flex justify-center">{overseer}</div>
        {panels}
      </div>
    );
  }

  const units = 1000;
  const box = (b: { x: number; y: number; w: number; h: number }): CSSProperties =>
    ({
      "--ow-box-x": b.x,
      "--ow-box-y": b.y,
      "--ow-box-w": b.w,
      "--ow-box-h": b.h,
    }) as CSSProperties;
  const center = layout.overseer;
  return (
    <div
      className="ow-map-viewport"
      data-map-viewport
      style={{ "--ow-map-units": units, "--ow-map-zoom": zoom } as CSSProperties}
    >
      <div
        className="ow-map-frame"
        data-map-frame
        style={{ "--ow-map-units": units } as CSSProperties}
      >
        <svg className="ow-map-svg" viewBox={`0 0 ${units} ${units}`} aria-label={term("handoffs")}>
          <HandoffLayer
            handoffs={handoffItems}
            geometry={geometry}
            carrying={carrying}
            emphasized={emphasized}
            selection={selection ?? null}
            onSelect={onSelect}
          />
        </svg>
        {station.teams.map((t, i) => (
          <div
            key={t.id}
            className="ow-map-box"
            style={box(layout.teams[t.id] ?? { x: 0, y: 0, w: 0, h: 0 })}
          >
            {panels[i]}
          </div>
        ))}
        <div
          className="ow-map-box ow-map-box--center"
          style={box({ x: center.x + center.w / 2, y: center.y + center.h / 2, w: 0, h: 0 })}
        >
          {overseer}
        </div>
      </div>
    </div>
  );
}
