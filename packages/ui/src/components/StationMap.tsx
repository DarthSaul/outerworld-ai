import {
  deriveRig,
  type HandoffGeometry,
  handoffGeometry,
  LAYOUT_SIZE,
  layoutStation,
  overseerLinkGeometry,
  type Station,
  type StationState,
  term,
} from "@darthsaul/outerworld-ai-core";
import { type CSSProperties, memo, useMemo } from "react";
import type { HealthState } from "../tokens/tokens.js";
import { timeLabel } from "./format.js";
import { CHEVRON_PATH, HandoffLayer } from "./HandoffLayer.js";
import { OverseerCore } from "./OverseerCore.js";
import { type Selection, teamOfSelection } from "./selection.js";
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

const boxStyle = (b: { x: number; y: number; w: number; h: number }): CSSProperties =>
  ({
    "--ow-box-x": b.x,
    "--ow-box-y": b.y,
    "--ow-box-w": b.w,
    "--ow-box-h": b.h,
  }) as CSSProperties;

/**
 * The map: core's layout in a 1000-unit frame, an SVG handoff layer, wires from every team into
 * the overseer, and one TeamPanel per team as HTML over it. Computes no geometry itself.
 */
export const StationMap = memo(function StationMap({
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

  const focusTeam = teamOfSelection(station, selection);
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
  const handoffItems = station.handoffs.map((h) => ({
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
      stateLabel={term(`overseer.${state.overseer.state}`)}
      {...(lastPost !== undefined ? { lastPostLabel: lastPost } : {})}
      attentionCount={state.overseer.attention.length}
      selected={selection?.kind === "overseer"}
      onSelect={onSelect}
    />
  );

  const panelFor = (teamId: string) => {
    const t = station.teams.find((x) => x.id === teamId);
    if (!t) return null;
    const ts = state.teams[t.id];
    const health: HealthState = ts?.health ?? "ok";
    const grants: TeamPanelGrant[] = station.grants
      .filter((g) => g.teamId === t.id)
      .map((g) => ({ id: g.id, mode: g.mode, label: g.label ?? g.tool }));
    const agents: TeamPanelAgent[] = station.agents
      .filter((a) => a.teamId === t.id)
      .map((a) => {
        const note = state.agents[a.id]?.note;
        return {
          id: a.id,
          name: a.persona.name,
          mandate: a.persona.mandate,
          rig: a.persona.rig,
          derived: deriveRig(a, station),
          state: state.agents[a.id]?.state ?? "idle",
          ...(note ? { note } : {}),
        };
      });
    const last = timeLabel(ts?.lastRun?.startedAt);
    return (
      <TeamPanel
        id={t.id}
        name={t.name}
        mission={t.mission}
        emblem={t.emblem}
        health={health}
        healthLabel={term(`health.${health}`)}
        run={ts?.run ?? "idle"}
        {...(last ? { lastRunLabel: last } : {})}
        grants={grants}
        agents={agents}
        selection={selection ?? null}
        dimmed={focusTeam !== undefined && !connected.has(t.id)}
        onSelect={onSelect}
        agentColumns={1}
      />
    );
  };

  if (stacked) {
    return (
      <div
        className="ow-map-stacked flex flex-col items-stretch gap-(--ow-space-4)"
        data-map-stacked
      >
        <div className="flex justify-center">{overseer}</div>
        {station.teams.map((t) => (
          <div key={t.id}>{panelFor(t.id)}</div>
        ))}
      </div>
    );
  }

  const center = layout.overseer;
  return (
    <div
      className="ow-map-viewport"
      data-map-viewport
      style={{ "--ow-map-units": LAYOUT_SIZE, "--ow-map-zoom": zoom } as CSSProperties}
    >
      <div
        className="ow-map-frame"
        data-map-frame
        style={{ "--ow-map-units": LAYOUT_SIZE } as CSSProperties}
      >
        <svg
          className="ow-map-svg"
          viewBox={`0 0 ${LAYOUT_SIZE} ${LAYOUT_SIZE}`}
          aria-label={term("lanes")}
        >
          <g className="ow-overseer-links">
            {station.teams.map((t) => {
              const g = overseerLinkGeometry(t.id, layout);
              return (
                <g key={t.id} data-overseer-link={t.id}>
                  <path
                    d={g.path}
                    fill="none"
                    className="ow-overseer-link"
                    strokeWidth="var(--ow-size-hairline)"
                  />
                  <g
                    transform={`translate(${g.chevronAt.x} ${g.chevronAt.y}) rotate(${g.angle})`}
                    className="ow-overseer-link-chevron"
                  >
                    <path d={CHEVRON_PATH} fill="none" strokeWidth="var(--ow-size-hairline)" />
                  </g>
                </g>
              );
            })}
          </g>
          <HandoffLayer
            handoffs={handoffItems}
            geometry={geometry}
            carrying={carrying}
            emphasized={emphasized}
            selection={selection ?? null}
            onSelect={onSelect}
          />
        </svg>
        {station.teams.map((t) => (
          <div
            key={t.id}
            className="ow-map-box"
            style={boxStyle(layout.teams[t.id] ?? { x: 0, y: 0, w: 0, h: 0 })}
          >
            {panelFor(t.id)}
          </div>
        ))}
        <div
          className="ow-map-box ow-map-box--center"
          style={boxStyle({ x: center.x + center.w / 2, y: center.y + center.h / 2, w: 0, h: 0 })}
        >
          {overseer}
        </div>
      </div>
    </div>
  );
});
