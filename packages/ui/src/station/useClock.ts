import { useEffect, useState } from "react";

/** True when the viewer asked for reduced motion. Updates if the setting changes. */
export function useReducedMotion(): boolean {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.(query).matches === true,
  );
  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return;
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

/**
 * Seconds since the clock started, advanced on animation frames while `running`. It holds still
 * (and keeps its value) when stopped, and never runs under reduced motion: the design's
 * lightweight clock for hallway packets.
 */
export function useAnimationClock(running: boolean): number {
  const reduced = useReducedMotion();
  const [t, setT] = useState(0);
  const active = running && !reduced;
  useEffect(() => {
    if (!active || typeof requestAnimationFrame === "undefined") return;
    let frame = 0;
    let last: number | undefined;
    const tick = (now: number) => {
      if (last !== undefined) {
        const dt = (now - last) / 1000;
        setT((prev) => prev + dt);
      }
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);
  return t;
}
