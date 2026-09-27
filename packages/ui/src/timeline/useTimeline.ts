import { bindReducer, type Station, type StationState } from "@darthsaul/outerworld-ai-core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { runDigestTimeline } from "./runDigestTimeline.js";

export interface UseTimelineOptions {
  /** Milliseconds per step. The app passes a motion token (MOTION_MS.packet). */
  readonly stepMs: number;
  /** Timestamp the replay starts from; defaults to the initial state's as-of. */
  readonly now?: string;
}

export interface Timeline {
  readonly state: StationState;
  readonly playing: boolean;
  /** Steps applied so far. */
  readonly step: number;
  readonly play: () => void;
  readonly reset: () => void;
}

/**
 * Plays the Run digest timeline through core's reducer. Each step is a timer; unmounting or
 * resetting clears it. Pure state in, pure state out; nothing here touches the ledger.
 */
export function useTimeline(
  station: Station,
  initial: StationState,
  options: UseTimelineOptions,
): Timeline {
  const steps = useMemo(
    () => runDigestTimeline(station, options.now ?? initial.provenance.asOf),
    [station, options.now, initial.provenance.asOf],
  );
  const apply = useMemo(() => bindReducer(station), [station]);
  const [state, setState] = useState(initial);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => {
    if (!playing) return;
    const next = steps[index];
    if (!next) {
      setPlaying(false);
      return;
    }
    const prevStep = index === 0 ? 0 : (steps[index - 1]?.step ?? 0);
    timer.current = setTimeout(
      () => {
        setState((s) => apply(s, next.event));
        setIndex(index + 1);
      },
      Math.max(0, next.step - prevStep) * options.stepMs,
    );
    return clear;
  }, [playing, index, steps, apply, options.stepMs, clear]);

  const play = useCallback(() => {
    if (index >= steps.length) {
      setState(initial);
      setIndex(0);
    }
    setPlaying(true);
  }, [index, steps, initial]);

  const reset = useCallback(() => {
    clear();
    setPlaying(false);
    setState(initial);
    setIndex(0);
  }, [initial, clear]);

  return { state, playing, step: index, play, reset };
}
