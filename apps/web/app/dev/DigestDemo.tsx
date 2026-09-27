"use client";

import { emptyState, type Station, type StationState } from "@darthsaul/outerworld-ai-core";
import {
  MOTION_MS,
  RunDigestButton,
  StationView,
  Toast,
  ToastRegion,
  useTimeline,
} from "@darthsaul/outerworld-ai-ui";
import { useEffect, useMemo, useState } from "react";

/**
 * The "Run digest" demo: the full StationView driven by the scripted timeline through core's
 * reducer. Starts from an empty state (everything idle) so every transition is visible.
 */
export function DigestDemo({
  station,
  startAt,
  desktop,
}: {
  readonly station: Station;
  readonly startAt: string;
  readonly desktop?: boolean;
}) {
  const initial = useMemo<StationState>(
    () => emptyState(station, { now: startAt, sourcePath: "demo" }),
    [station, startAt],
  );
  const t = useTimeline(station, initial, { stepMs: MOTION_MS.packet, now: startAt });
  const [toast, setToast] = useState<string | null>(null);
  const posted = t.state.overseer.lastOutwardPostAt;
  useEffect(() => {
    if (posted) setToast(`Digest posted ${posted}`);
  }, [posted]);
  return (
    <>
      <StationView
        station={station}
        state={t.state}
        {...(desktop !== undefined ? { desktop } : {})}
        toolbar={
          <>
            <RunDigestButton
              playing={t.playing}
              onPlay={t.play}
              onReset={() => {
                t.reset();
                setToast(null);
              }}
            />
            <span className="font-mono text-mono text-ink-3">step {t.step}</span>
          </>
        }
      />
      <ToastRegion>
        {toast ? <Toast id="digest" message={toast} onDismiss={() => setToast(null)} /> : null}
      </ToastRegion>
    </>
  );
}
