import type { Agent, Station } from "./schema/station.js";

export type RigShoulder = "ball" | "pauldron";
export type RigAccessory = "antenna" | "thruster" | "plate" | "none" | "crest";

export interface DerivedRig {
  readonly shoulder: RigShoulder;
  readonly accessory: RigAccessory;
}

/**
 * Parts of an agent's rig that express configuration and cannot be chosen (design spec §07):
 * pauldron when the agent may write anything; antenna when its team reads an inbound handoff,
 * thruster when its team has repo access, plate when both. Pure.
 */
export function deriveRig(agent: Agent, station: Station): DerivedRig {
  const grants = new Map(station.grants.map((g) => [g.id, g]));
  const canWrite = agent.persona.allowlist.some((id) => grants.get(id)?.mode === "write");
  const team = station.teams.find((t) => t.id === agent.teamId);
  const readsInbound = station.handoffs.some((h) => h.to === agent.teamId);
  const hasRepo = (team?.scope.repos.length ?? 0) > 0;
  const accessory: RigAccessory =
    readsInbound && hasRepo ? "plate" : readsInbound ? "antenna" : hasRepo ? "thruster" : "none";
  return { shoulder: canWrite ? "pauldron" : "ball", accessory };
}

/** The overseer's rig is fixed and achromatic; only its glow follows run state. */
export function overseerRig(): DerivedRig & { readonly head: "crest"; readonly trace: "frame" } {
  return { head: "crest", trace: "frame", shoulder: "pauldron", accessory: "crest" };
}
