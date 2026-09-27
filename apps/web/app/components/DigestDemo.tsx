"use client";

import type { Station, StationState } from "@darthsaul/outerworld-ai-core";
import {
  MOTION_MS,
  RunDigestButton,
  StationView,
  Toast,
  ToastRegion,
  useTimeline,
} from "@darthsaul/outerworld-ai-ui";
import { useEffect, useState } from "react";

/**
 * The station view with the "Run digest" demo: the scripted timeline replays on top of whatever
 * state was loaded, through core's reducer. Reset returns to the loaded state.
 */
export function DigestDemo({
  station,
  initial,
  desktop,
}: {
  readonly station: Station;
  readonly initial: StationState;
  readonly desktop?: boolean;
}) {
  const t = useTimeline(station, initial, {
    stepMs: MOTION_MS.packet,
    now: initial.provenance.asOf,
  });
  const [toast, setToast] = useState<string | null>(null);
  const posted = t.state.overseer.lastOutwardPostAt;
  const postedInitially = initial.overseer.lastOutwardPostAt;
  useEffect(() => {
    if (posted && posted !== postedInitially) setToast(`Digest posted ${posted}`);
  }, [posted, postedInitially]);
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
