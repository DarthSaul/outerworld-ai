export interface RunDigestButtonProps {
  readonly playing: boolean;
  readonly onPlay: () => void;
  readonly onReset: () => void;
}

/** Plays the scripted demo sequence. Plain words: this is a demo control, not a themed verb. */
export function RunDigestButton({ playing, onPlay, onReset }: RunDigestButtonProps) {
  return (
    <div className="flex items-center gap-(--ow-space-2)">
      <button
        type="button"
        onClick={onPlay}
        disabled={playing}
        className="h-(--ow-size-control-h) rounded-control border border-border-strong bg-surface-raised px-(--ow-size-control-pad-x) text-label text-ink-1 disabled:opacity-(--ow-opacity-dimmed)"
      >
        {playing ? "Running…" : "Run digest"}
      </button>
      <button
        type="button"
        onClick={onReset}
        className="h-(--ow-size-control-h) rounded-control px-(--ow-size-control-pad-x) text-label text-ink-2"
      >
        Reset
      </button>
    </div>
  );
}
