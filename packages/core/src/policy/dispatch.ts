import type { AgentConfig } from "../config/agent-config.js";
import type { StationConfig } from "../config/station-config.js";
import type { CrewMember } from "../config/station-crew.js";

/**
 * Dispatch policy (brief §7, ADR-0024), checked in one place.
 *
 * - The Overseer always has dispatch; a crew member has it when its `canDispatch` flag is on.
 * - The Overseer reaches every other crew member. A crew member reaches its roommates and every
 *   agent in a room a hallway leads to from its own room (hallways are directed, from → to). Crew
 *   never reach the Overseer: work flows down, and results come back as reports.
 * - A run at depth N may dispatch only while N < `maxDepth`.
 * - Guards for nesting: no cycles, a cap on dispatched runs per tree, and a cap on tree spend.
 */

/** Whether this agent is allowed to dispatch at all, before depth and reach. */
export function hasDispatch(agent: Pick<AgentConfig, "role" | "canDispatch">): boolean {
  return agent.role === "overseer" || agent.canDispatch === true;
}

/** How a dispatcher reaches a target: the Overseer reaches anyone, crew by room or by hallway. */
export type DispatchVia =
  | { readonly kind: "overseer" }
  | { readonly kind: "room" }
  | { readonly kind: "lane"; readonly laneId: string };

export interface DispatchReach {
  readonly agentId: string;
  readonly roomId: string;
  readonly via: DispatchVia;
}

/**
 * Who `from` may dispatch to, and how, in crew order. Empty when it has no dispatch or the
 * station turns delegation off. Depth is not considered here: it depends on the run.
 */
export function dispatchReach(
  from: string,
  station: StationConfig,
  crew: readonly CrewMember[],
): DispatchReach[] {
  const holder = crew.find((c) => c.id === from);
  if (!holder || !hasDispatch(holder.config) || station.dispatch.maxDepth < 1) return [];
  const others = crew.filter((c) => c.id !== from);
  if (holder.config.role === "overseer") {
    return others.map((c) => ({
      agentId: c.id,
      roomId: c.config.roomId,
      via: { kind: "overseer" },
    }));
  }
  const home = holder.config.roomId;
  const reach: DispatchReach[] = [];
  for (const c of others) {
    if (c.config.role === "overseer") continue;
    const roomId = c.config.roomId;
    if (roomId === home) {
      reach.push({ agentId: c.id, roomId, via: { kind: "room" } });
      continue;
    }
    const lane = station.lanes.find((l) => l.from === home && l.to === roomId);
    if (lane) reach.push({ agentId: c.id, roomId, via: { kind: "lane", laneId: lane.id } });
  }
  return reach;
}

/** The ids `from` may dispatch to (see `dispatchReach`). */
export function dispatchTargets(
  from: string,
  station: StationConfig,
  crew: readonly CrewMember[],
): string[] {
  return dispatchReach(from, station, crew).map((r) => r.agentId);
}

export type DispatchCheck = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** What the runtime knows about the tree the dispatching run belongs to. */
export interface DispatchTree {
  /** Dispatched runs already under the tree's root run (reviews do not count). */
  readonly dispatchedRuns: number;
  /** Summed spend of the root run and every run descended from it. */
  readonly spentUsd: number;
}

const usd = (n: number) => `$${n.toFixed(2)}`;

export function checkDispatch(input: {
  from: string;
  to: string;
  /** How deep the dispatching run already is: 0 for a run the Commander started. */
  depth: number;
  station: StationConfig;
  crew: readonly CrewMember[];
  /** Agent ids of the dispatching run and every run above it, nearest first. */
  chain: readonly string[];
  tree: DispatchTree;
}): DispatchCheck {
  const { from, to, depth, station, crew } = input;
  const refuse = (reason: string): DispatchCheck => ({ ok: false, reason });
  const holder = crew.find((c) => c.id === from);
  if (!holder || !hasDispatch(holder.config)) {
    return refuse(`${from} has not been given dispatch; report back instead`);
  }
  const { maxDepth, maxRunsPerTree } = station.dispatch;
  if (maxDepth < 1) return refuse("delegation is turned off for this station");
  if (depth >= maxDepth) {
    return refuse(
      `dispatch depth ${maxDepth} is the limit and this run is at depth ${depth}; do the work yourself or report back`,
    );
  }
  if (to === from) return refuse("an agent cannot dispatch to itself");

  const target = crew.find((c) => c.id === to);
  const targets = dispatchTargets(from, station, crew);
  if (!target) {
    return refuse(`no crew member "${to}"; choose one of: ${targets.join(", ") || "nobody"}`);
  }
  if (!targets.includes(to)) {
    if (target.config.role === "overseer") {
      return refuse("crew cannot dispatch to the Overseer; report back instead");
    }
    const roomName = (id: string) => station.rooms.find((r) => r.id === id)?.name ?? id;
    const here = roomName(holder.config.roomId);
    const there = roomName(target.config.roomId);
    const reverse = station.lanes.some(
      (l) => l.from === target.config.roomId && l.to === holder.config.roomId,
    );
    return refuse(
      reverse
        ? `the hallway between ${here} and ${there} only leads from ${there} to ${here}; a hallway from ${here} to ${there} is needed`
        : `no hallway from ${here} to ${there}; a hallway from ${here} to ${there} is needed, or ask the Overseer`,
    );
  }
  if (input.chain.includes(to)) {
    return refuse(`${to} is already working on this request above you; report back instead`);
  }
  if (input.tree.dispatchedRuns >= maxRunsPerTree) {
    return refuse(
      `this request has used ${input.tree.dispatchedRuns} dispatched runs, the station's limit of ${maxRunsPerTree}`,
    );
  }
  const cap = station.budgets.perTreeUsd;
  if (cap !== null && input.tree.spentUsd >= cap) {
    return refuse(
      `this request has spent ${usd(input.tree.spentUsd)} of its ${usd(cap)} budget; no more dispatches`,
    );
  }
  return { ok: true };
}
