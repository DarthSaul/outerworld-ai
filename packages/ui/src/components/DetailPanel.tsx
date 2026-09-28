import { type Station, type StationState, term } from "@darthsaul/outerworld-ai-core";
import { memo, type ReactNode } from "react";
import { EmptyState } from "./EmptyState.js";
import { AgentReport } from "./report/AgentReport.js";
import { GrantReport } from "./report/GrantReport.js";
import { HandoffReport } from "./report/HandoffReport.js";
import { OverseerReport } from "./report/OverseerReport.js";
import { Missing } from "./report/parts.js";
import { TeamReport } from "./report/TeamReport.js";
import { resolveSelection, type Selection } from "./selection.js";

export interface DetailPanelProps {
  readonly station: Station;
  readonly state: StationState;
  readonly selection: Selection | null;
  readonly onSelect: (selection: Selection) => void;
  /** When given, a close control is shown (the mobile sheet). */
  readonly onClose?: () => void;
  /** Rendered as a bottom sheet (mobile). */
  readonly sheet?: boolean;
  /** No border, background, or radius: the parent pane supplies them. */
  readonly bare?: boolean;
}

function ReportBody({
  station,
  state,
  selection,
  onSelect,
}: Omit<DetailPanelProps, "onClose" | "sheet" | "bare">) {
  if (!selection) {
    return (
      <EmptyState
        title="Nothing selected"
        body="Select a team, an agent, a grant, a handoff, or the overseer on the map."
      />
    );
  }
  const r = resolveSelection(station, selection);
  if (!r) return <Missing />;
  const common = { station, state, onSelect };
  switch (r.kind) {
    case "team":
      return <TeamReport {...common} team={r.team} />;
    case "agent":
      return <AgentReport {...common} agent={r.agent} team={r.team} />;
    case "grant":
      return <GrantReport {...common} grant={r.grant} team={r.team} />;
    case "handoff":
      return <HandoffReport {...common} handoff={r.handoff} from={r.from} to={r.to} />;
    case "overseer":
      return <OverseerReport {...common} />;
  }
}

/**
 * The Report view of whatever is selected. Every report view carries a proof line (as-of,
 * path, commit), so the last-known-state promise is visible on every screen.
 */
export const DetailPanel = memo(function DetailPanel({
  station,
  state,
  selection,
  onSelect,
  onClose,
  sheet,
  bare,
}: DetailPanelProps) {
  const body: ReactNode = (
    <ReportBody station={station} state={state} selection={selection} onSelect={onSelect} />
  );
  return (
    <aside
      aria-label={term("report.tab")}
      className={[
        "ow-detail flex flex-col gap-(--ow-space-5) p-(--ow-size-panel-pad)",
        bare ? "" : "rounded-panel border border-border-subtle bg-surface-panel",
        sheet ? "ow-detail--sheet" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-sheet={sheet ? "true" : undefined}
    >
      {onClose ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-(--ow-size-control-h-dense) rounded-control border border-border-subtle px-(--ow-size-control-pad-x) text-label text-ink-2"
          >
            Close
          </button>
        </div>
      ) : null}
      {body}
    </aside>
  );
});
