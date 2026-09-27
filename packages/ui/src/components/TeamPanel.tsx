import type { RigChoice, RigDerived } from "../character/Character.js";
import type { GrantMode, HealthState, RunState } from "../tokens/tokens.js";
import { AgentCard } from "./AgentCard.js";
import { GrantChip } from "./GrantChip.js";
import { isSelected, type Selection } from "./selection.js";
import { type EmblemMark, TeamEmblem } from "./TeamEmblem.js";

export interface TeamPanelGrant {
  readonly id: string;
  readonly mode: GrantMode;
  readonly label: string;
  readonly inUse?: boolean;
}

export interface TeamPanelAgent {
  readonly id: string;
  readonly name: string;
  readonly mandate: string;
  readonly rig: RigChoice;
  readonly derived: RigDerived;
  readonly state: RunState;
}

export interface TeamPanelProps {
  readonly id: string;
  readonly name: string;
  readonly mission: string;
  readonly emblem: { readonly hue: number; readonly mark: EmblemMark };
  readonly health: HealthState;
  readonly run: RunState;
  /** Short display string for the last run, e.g. "14:02". */
  readonly lastRunLabel?: string;
  readonly grants: readonly TeamPanelGrant[];
  readonly agents: readonly TeamPanelAgent[];
  readonly selection?: Selection | null;
  readonly dimmed?: boolean;
  /** Header row only (map zoomed out or mobile list). */
  readonly collapsed?: boolean;
  readonly onSelect: (selection: Selection) => void;
  /** Plain health word for the header, from the glossary. */
  readonly healthLabel?: string;
}

const HEALTH_LABEL: Record<HealthState, string> = {
  ok: "healthy",
  attention: "needs attention",
  stalled: "stalled",
};

/**
 * A team on the map: header (emblem at 2×, name, mission, health square), grant chips, then
 * agents in a two-column grid. Selected, dimmed, and collapsed are orthogonal to run × health.
 */
export function TeamPanel({
  id,
  name,
  mission,
  emblem,
  health,
  run,
  lastRunLabel,
  grants,
  agents,
  selection,
  dimmed,
  collapsed,
  onSelect,
  healthLabel,
}: TeamPanelProps) {
  const teamSelected = isSelected(selection, "team", id);
  return (
    <fieldset
      className={[
        "ow-team m-0 flex min-w-(--ow-size-team-min-w) max-w-(--ow-size-team-max-w) flex-col gap-(--ow-size-team-gap) rounded-team border border-border-subtle bg-surface-team p-(--ow-size-team-pad)",
        "transition-opacity duration-(--ow-dur-base) ease-standard",
        teamSelected ? "ring-(--ow-size-selection-ring) ring-selection-ring" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-team={id}
      data-health={health}
      data-run={run}
      data-dimmed={dimmed ? "true" : undefined}
      data-collapsed={collapsed ? "true" : undefined}
    >
      <legend className="sr-only">{name}</legend>
      <button
        type="button"
        className="flex items-start gap-(--ow-space-3) text-left"
        aria-pressed={teamSelected ? "true" : "false"}
        onClick={() => onSelect({ kind: "team", id })}
      >
        <TeamEmblem name={name} hue={emblem.hue} mark={emblem.mark} scale={2} />
        <span className="flex min-w-0 flex-1 flex-col gap-(--ow-space-1)">
          <span className="text-label font-semibold text-ink-1">{name}</span>
          <span className="truncate text-caption text-ink-2">{mission}</span>
          <span className="flex flex-wrap gap-(--ow-space-1) font-mono text-mono text-ink-3">
            {lastRunLabel ? (
              <>
                <span>last {lastRunLabel}</span>
                <span aria-hidden="true">·</span>
              </>
            ) : null}
            <span data-health-label>{healthLabel ?? HEALTH_LABEL[health]}</span>
          </span>
        </span>
        <span
          className="ow-health-dot mt-(--ow-space-1) size-(--ow-size-health-dot) shrink-0"
          data-health={health}
          aria-hidden="true"
        />
      </button>
      {collapsed ? null : (
        <>
          {grants.length > 0 ? (
            <div className="flex flex-wrap gap-(--ow-size-chip-gap)">
              {grants.map((g) => (
                <GrantChip
                  key={g.id}
                  mode={g.mode}
                  label={g.label}
                  {...(g.inUse !== undefined ? { inUse: g.inUse } : {})}
                  selected={isSelected(selection, "grant", g.id)}
                  onSelect={() => onSelect({ kind: "grant", id: g.id })}
                />
              ))}
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-(--ow-space-2) desktop:grid-cols-2">
            {agents.map((a, i) => (
              <AgentCard
                key={a.id}
                {...a}
                selected={isSelected(selection, "agent", a.id)}
                blinkDelayMs={i * 900}
                onSelect={(agentId) => onSelect({ kind: "agent", id: agentId })}
              />
            ))}
          </div>
        </>
      )}
    </fieldset>
  );
}
