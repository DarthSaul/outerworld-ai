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

/** "notion" → "Notion"; labels already capitalized or with counts pass through. */
export function displayLabel(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * A tool chip: the tool name (capitalized) over a lighter "read" / "write" line. The mode is
 * always written out, so color never carries it alone. Status tint stays at 16% at rest and 35%
 * while in use; text stays ink-1 (design spec v0.3 §04).
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
    "ow-chip inline-flex min-h-(--ow-size-chip-h) flex-col items-start justify-center rounded-chip border px-(--ow-size-chip-pad-x) py-(--ow-size-chip-pad-y) text-left leading-none",
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
      <span className="text-label text-ink-1" data-chip-name>
        {displayLabel(label)}
      </span>
      <span
        className={`font-mono text-eyebrow ${inUse ? "text-ink-1" : "text-ink-2"}`}
        data-chip-mode
      >
        {mode}
      </span>
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
