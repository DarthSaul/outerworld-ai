import type { GrantMode } from "../tokens/tokens.js";

export interface GrantChipProps {
  readonly mode: GrantMode;
  /** The tool or skill name shown after the mode glyph. */
  readonly label: string;
  /** Lit while a replayed run is using this grant. */
  readonly inUse?: boolean;
  /** Struck through; kept for one run of history. */
  readonly revoked?: boolean;
  readonly selected?: boolean;
  /** When present the chip is a button. */
  readonly onSelect?: () => void;
  readonly className?: string;
}

const MODE_GLYPH: Record<GrantMode, string> = { read: "R", write: "W" };

/**
 * A grant chip: mode glyph (R/W, in mono) then the tool name. Color never carries mode alone.
 * Status tint stays at 16% at rest and 35% while in use; text stays ink-1 (design spec §02).
 */
export function GrantChip({
  mode,
  label,
  inUse,
  revoked,
  selected,
  onSelect,
  className,
}: GrantChipProps) {
  const classes = [
    "ow-chip inline-flex h-(--ow-size-chip-h) items-center gap-(--ow-size-chip-gap) rounded-chip border px-(--ow-size-chip-pad-x) font-mono text-mono text-ink-1",
    mode === "read"
      ? "border-chip-border-read bg-chip-read"
      : "border-chip-border-write bg-chip-write",
    inUse ? (mode === "read" ? "bg-chip-read-active" : "bg-chip-write-active") : "",
    revoked ? "text-ink-3 line-through" : "",
    selected ? "ring-(--ow-size-selection-ring) ring-selection-ring" : "",
    onSelect ? "cursor-pointer" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  const content = (
    <>
      <span aria-hidden="true">{MODE_GLYPH[mode]}</span>
      <span className="sr-only">{mode}</span>
      <span>{label}</span>
    </>
  );
  const data = {
    "data-mode": mode,
    "data-in-use": inUse ? "true" : undefined,
    "data-revoked": revoked ? "true" : undefined,
  };
  if (onSelect) {
    return (
      <button
        type="button"
        className={classes}
        aria-pressed={selected ? "true" : "false"}
        onClick={onSelect}
        {...data}
      >
        {content}
      </button>
    );
  }
  return (
    <span className={classes} {...data}>
      {content}
    </span>
  );
}
