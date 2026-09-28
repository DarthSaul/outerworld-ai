import { Character, type RigChoice, type RigDerived } from "../character/Character.js";
import type { RunState } from "../tokens/tokens.js";

export interface AgentCardProps {
  readonly id: string;
  readonly name: string;
  readonly mandate: string;
  readonly rig: RigChoice;
  readonly derived: RigDerived;
  readonly state: RunState;
  readonly selected?: boolean;
  readonly dimmed?: boolean;
  readonly blinkDelayMs?: number;
  readonly onSelect: (agentId: string) => void;
}

/**
 * One agent on a team panel: the rig at 1×, the name, a one-line mandate, and the plain run
 * word. State axes are orthogonal (run × selected × dimmed). The card breathes while working.
 */
export function AgentCard({
  id,
  name,
  mandate,
  rig,
  derived,
  state,
  selected,
  dimmed,
  blinkDelayMs,
  onSelect,
}: AgentCardProps) {
  return (
    <button
      type="button"
      className={[
        "ow-agent-card flex w-full items-start gap-(--ow-space-2) rounded-agent bg-surface-raised p-(--ow-size-agent-pad) text-left",
        "transition-opacity duration-(--ow-dur-base) ease-standard",
        selected ? "ring-(--ow-size-selection-ring) ring-selection-ring" : "",
        state === "working" ? "animate-breathe" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-state={state}
      data-dimmed={dimmed ? "true" : undefined}
      aria-pressed={selected ? "true" : "false"}
      onClick={() => onSelect(id)}
    >
      <Character
        name={name}
        rig={rig}
        derived={derived}
        state={state}
        scale={1}
        {...(blinkDelayMs !== undefined ? { blinkDelayMs } : {})}
      />
      <span className="flex min-w-0 flex-col gap-(--ow-space-1)">
        <span className="text-label text-ink-1">{name}</span>
        <span className="line-clamp-2 text-caption text-ink-2">{mandate}</span>
        <span className="font-mono text-mono text-ink-3">{state}</span>
      </span>
    </button>
  );
}
