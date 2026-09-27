import type { CSSProperties, KeyboardEvent } from "react";
import { isSelected, type Selection } from "./selection.js";

/** Core's HandoffGeometry, restated here so ui carries no dependency on core's types at runtime. */
export interface HandoffPathGeometry {
  readonly path: string;
  readonly midpoint: { readonly x: number; readonly y: number };
  readonly angle: number;
  readonly chevronAt: { readonly x: number; readonly y: number };
  readonly paired: boolean;
  readonly side: -1 | 0 | 1;
}

export interface HandoffLayerItem {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  /** Accessible name, e.g. "Strength App to Project Management". */
  readonly label: string;
}

export interface HandoffLayerProps {
  readonly handoffs: readonly HandoffLayerItem[];
  readonly geometry: Readonly<Record<string, HandoffPathGeometry>>;
  /** Handoffs whose writer's ledger changed in its last run. */
  readonly carrying: Readonly<Record<string, boolean>>;
  /** Handoffs connected to the current selection. */
  readonly emphasized?: ReadonlySet<string>;
  readonly selection?: Selection | null;
  readonly onSelect: (selection: Selection) => void;
}

export type HandoffVisualState = "default" | "emphasis" | "carrying" | "selected";

function stateOf(id: string, props: HandoffLayerProps): HandoffVisualState {
  if (isSelected(props.selection, "handoff", id)) return "selected";
  if (props.carrying[id]) return "carrying";
  if (props.emphasized?.has(id)) return "emphasis";
  return "default";
}

/**
 * SVG paths between teams, drawn from core's geometry. Each handoff is a focusable group with a
 * thin visible stroke, a wide invisible hit path, a chevron pair at the reading end, and, when
 * carrying, one packet travelling the same path (design spec §05, §06, §08). Render inside the
 * map's <svg>.
 */
export function HandoffLayer(props: HandoffLayerProps) {
  const { handoffs, geometry, onSelect } = props;
  return (
    <g className="ow-handoffs">
      {handoffs.map((h) => {
        const g = geometry[h.id];
        if (!g) return null;
        const state = stateOf(h.id, props);
        const select = () => onSelect({ kind: "handoff", id: h.id });
        const onKey = (e: KeyboardEvent<SVGGElement>) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            select();
          }
        };
        return (
          <g
            key={h.id}
            role="button"
            tabIndex={0}
            aria-label={h.label}
            aria-pressed={state === "selected" ? "true" : "false"}
            className="ow-handoff cursor-pointer outline-none"
            data-handoff={h.id}
            data-state={state}
            data-paired={g.paired ? "true" : undefined}
            onClick={select}
            onKeyDown={onKey}
          >
            <path
              data-role="hit"
              d={g.path}
              fill="none"
              stroke="transparent"
              strokeWidth="var(--ow-size-handoff-hit)"
            />
            <path
              data-role="stroke"
              d={g.path}
              fill="none"
              className="ow-handoff-stroke"
              strokeWidth="var(--ow-size-hairline)"
            />
            <g
              data-role="chevron"
              transform={`translate(${g.chevronAt.x} ${g.chevronAt.y}) rotate(${g.angle})`}
              className="ow-handoff-chevron"
            >
              <path d="M -6 -4 L 0 0 L -6 4" fill="none" strokeWidth="var(--ow-size-hairline)" />
              <path d="M -2 -4 L 4 0 L -2 4" fill="none" strokeWidth="var(--ow-size-hairline)" />
            </g>
            {state === "carrying" ? <Packet handoffId={h.id} path={g.path} /> : null}
          </g>
        );
      })}
    </g>
  );
}

/** One ledger packet in transit: a dot moving along the handoff path at constant velocity. */
export function Packet({ handoffId, path }: { readonly handoffId: string; readonly path: string }) {
  const style = { offsetPath: `path("${path}")` } as CSSProperties;
  return (
    <circle
      data-packet={handoffId}
      className="ow-packet animate-packet"
      r="var(--ow-size-packet)"
      style={style}
    />
  );
}
