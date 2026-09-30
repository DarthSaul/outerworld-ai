import { term } from "@darthsaul/outerworld-ai-core";
import { useKillSwitch, useSetKillSwitch, useSpend } from "../queries.js";
import { ErrorNote } from "./ErrorNote.js";
import { formatUsd } from "./format.js";

const button =
  "h-(--ow-size-control-h-dense) rounded-control border border-health-attention px-(--ow-size-control-pad-x) text-label text-ink-1 disabled:text-ink-3";

/**
 * Header controls: today's station spend and the kill switch (brief §11). Stopping takes one
 * click; while it is on, a banner says nothing runs until you resume.
 */
export function StationControls() {
  const kill = useKillSwitch();
  const set = useSetKillSwitch();
  const spend = useSpend();
  const engaged = kill.data?.engaged ?? false;
  return (
    <div className="flex flex-wrap items-center gap-(--ow-space-3)">
      {spend.data ? (
        <span className="font-mono text-mono text-ink-2" data-spend-today>
          {term("spend.today")} {formatUsd(spend.data.stationUsd)}
        </span>
      ) : null}
      <button
        type="button"
        className={button}
        aria-pressed={engaged}
        disabled={kill.isPending || set.isPending}
        onClick={() => set.mutate(!engaged)}
      >
        {engaged ? term("killSwitch.clear") : term("killSwitch.engage")}
      </button>
      <ErrorNote error={set.error} />
    </div>
  );
}

export function KillSwitchBanner() {
  const kill = useKillSwitch();
  if (!kill.data?.engaged) return null;
  return (
    <p
      role="alert"
      className="rounded-panel border border-health-attention bg-surface-panel px-(--ow-space-4) py-(--ow-space-2) text-label text-ink-1"
    >
      {term("killSwitch.on")}
    </p>
  );
}
