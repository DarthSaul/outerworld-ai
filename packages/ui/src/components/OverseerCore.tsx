import { OverseerCharacter, type OverseerState } from "../character/OverseerCharacter.js";
import type { Selection } from "./selection.js";

export interface OverseerCoreProps {
  /** Proper name from the persona. */
  readonly name: string;
  /** Fixed role noun from the glossary (`term("overseer.role")`). */
  readonly roleNoun: string;
  readonly state: OverseerState;
  readonly lastPostLabel?: string;
  readonly attentionCount?: number;
  readonly selected?: boolean;
  readonly onSelect: (selection: Selection) => void;
}

const STATE_LABEL: Record<OverseerState, string> = {
  idle: "idle",
  reconciling: "reconciling",
  reported: "reported",
  attention: "needs attention",
};

/**
 * The overseer's octagon at the map center: the hero rig at 2×, the role noun, the proper
 * name, and one status line. Attention shows as a ring on the core, never as the glow.
 */
export function OverseerCore({
  name,
  roleNoun,
  state,
  lastPostLabel,
  attentionCount,
  selected,
  onSelect,
}: OverseerCoreProps) {
  const status =
    state === "reported" && lastPostLabel
      ? `posted ${lastPostLabel}`
      : state === "attention" && attentionCount
        ? `${attentionCount} need attention`
        : STATE_LABEL[state];
  return (
    <div className="flex flex-col items-center gap-(--ow-space-2)" data-overseer-core>
      <button
        type="button"
        className={[
          "ow-overseer-core flex h-(--ow-size-overseer-core-h) w-(--ow-size-overseer-core-w) flex-col items-center justify-end gap-(--ow-space-1) bg-surface-panel pb-(--ow-space-3) text-center",
          selected ? "ring-(--ow-size-selection-ring) ring-selection-ring" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        data-state={state}
        aria-pressed={selected ? "true" : "false"}
        onClick={() => onSelect({ kind: "overseer", id: "overseer" })}
      >
        <OverseerCharacter name={name} state={state} scale={2} />
        <span className="font-mono text-eyebrow uppercase text-ink-3">{roleNoun}</span>
        <span className="text-label text-ink-1">{name}</span>
      </button>
      <span className="text-caption text-ink-2" data-overseer-status>
        {status}
      </span>
    </div>
  );
}
