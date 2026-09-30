import type { StationConfig } from "../config/station-config.js";
import type { CrewMember } from "../config/station-crew.js";

/**
 * Dispatch policy (brief §7), checked in one place. Only the Overseer dispatches; the depth limit
 * (v1: 1) means a dispatched run can never dispatch again; targets come from the station graph,
 * which in v1 is the Overseer to every other crew member. Hallways add edges in v2.
 */
export function dispatchTargets(
  from: string,
  station: StationConfig,
  crew: readonly CrewMember[],
): string[] {
  const holder = crew.find((c) => c.id === from);
  if (!holder || holder.config.role !== "overseer" || station.dispatch.maxDepth < 1) return [];
  return crew.filter((c) => c.id !== from).map((c) => c.id);
}

export type DispatchCheck = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export function checkDispatch(input: {
  from: string;
  to: string;
  /** How deep the dispatching run already is: 0 for a run the Commander started. */
  depth: number;
  station: StationConfig;
  crew: readonly CrewMember[];
}): DispatchCheck {
  const holder = input.crew.find((c) => c.id === input.from);
  if (holder?.config.role !== "overseer") {
    return { ok: false, reason: "only the Overseer can dispatch work" };
  }
  if (input.station.dispatch.maxDepth < 1) {
    return { ok: false, reason: "delegation is turned off for this station" };
  }
  if (input.depth >= input.station.dispatch.maxDepth) {
    return {
      ok: false,
      reason: `dispatch depth ${input.station.dispatch.maxDepth} is the limit; this run was itself dispatched`,
    };
  }
  const targets = dispatchTargets(input.from, input.station, input.crew);
  if (!targets.includes(input.to)) {
    return {
      ok: false,
      reason: `no crew member "${input.to}" can take work from ${input.from}; choose one of: ${targets.join(", ") || "nobody"}`,
    };
  }
  return { ok: true };
}
