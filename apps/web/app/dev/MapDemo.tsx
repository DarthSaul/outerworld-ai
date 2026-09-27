"use client";

import type { Station, StationState } from "@darthsaul/outerworld-ai-core";
import { type Selection, StationMap } from "@darthsaul/outerworld-ai-ui";
import { useState } from "react";

/** Gallery-only wrapper: owns a selection so the map's states can be exercised by hand. */
export function MapDemo({
  station,
  state,
  stacked,
  zoom,
}: {
  readonly station: Station;
  readonly state: StationState;
  readonly stacked?: boolean;
  readonly zoom?: number;
}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  return (
    <div className="flex flex-col gap-(--ow-space-2)">
      <StationMap
        station={station}
        state={state}
        selection={selection}
        onSelect={(s) => setSelection(s)}
        {...(stacked ? { stacked: true } : {})}
        {...(zoom !== undefined ? { zoom } : {})}
      />
      <p className="font-mono text-mono text-ink-3">
        selection: {selection ? `${selection.kind} · ${selection.id}` : "none"}
      </p>
    </div>
  );
}
