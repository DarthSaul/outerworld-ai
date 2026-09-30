import type { Station, StationState } from "@darthsaul/outerworld-ai-core";
import {
  MOTION_MS,
  RunDigestButton,
  StationView,
  Toast,
  ToastRegion,
  useTimeline,
} from "@darthsaul/outerworld-ai-ui";
import { type ReactNode, useEffect, useState } from "react";

/**
 * The dashboard body: the station view over the loaded state. In demo mode (the fixture) the
 * "Run digest" timeline can replay on top of it through core's reducer; with a real ledger there
 * is no simulation, because the map must never show a state the ledger cannot prove.
 */
export function Dashboard({
  station,
  initial,
  demo,
  desktop,
  sidebar,
}: {
  readonly station: Station;
  readonly initial: StationState;
  /** True only for the fixture: enables the scripted timeline and its toast. */
  readonly demo: boolean;
  readonly desktop?: boolean;
  readonly sidebar?: ReactNode;
}) {
  const t = useTimeline(station, initial, {
    stepMs: MOTION_MS.packet,
    now: initial.provenance.asOf,
  });
  const [toast, setToast] = useState<string | null>(null);
  const posted = t.state.overseer.lastOutwardPostAt;
  const postedInitially = initial.overseer.lastOutwardPostAt;
  useEffect(() => {
    if (demo && posted && posted !== postedInitially) setToast(`Digest posted ${posted}`);
  }, [demo, posted, postedInitially]);
  const state = demo ? t.state : initial;
  const controls = demo ? (
    <div className="flex flex-wrap items-center gap-(--ow-space-3)" data-demo-controls>
      <RunDigestButton
        playing={t.playing}
        onPlay={t.play}
        onReset={() => {
          t.reset();
          setToast(null);
        }}
      />
      <span className="font-mono text-mono text-ink-3">step {t.step}</span>
    </div>
  ) : null;
  return (
    <>
      <StationView
        station={station}
        state={state}
        {...(desktop !== undefined ? { desktop } : {})}
        {...(sidebar
          ? {
              sidebar: (
                <>
                  {sidebar}
                  {controls}
                </>
              ),
            }
          : controls
            ? { toolbar: controls }
            : {})}
      />
      {demo ? (
        <ToastRegion>
          {toast ? <Toast id="digest" message={toast} onDismiss={() => setToast(null)} /> : null}
        </ToastRegion>
      ) : null}
    </>
  );
}
