import type { Agent, Grant, Handoff, Station, Team } from "@darthsaul/outerworld-ai-core";

/** What the map or panel currently has selected. One selection at a time (design spec §08). */
export type SelectionKind = "team" | "agent" | "grant" | "handoff" | "overseer";

export interface Selection {
  readonly kind: SelectionKind;
  readonly id: string;
}

export const isSelected = (
  selection: Selection | null | undefined,
  kind: SelectionKind,
  id: string,
): boolean => selection?.kind === kind && selection.id === id;

export const sameSelection = (
  a: Selection | null | undefined,
  b: Selection | null | undefined,
): boolean => a?.kind === b?.kind && a?.id === b?.id;

/** The entity a selection points at, resolved against the Station. */
export type ResolvedSelection =
  | { readonly kind: "team"; readonly team: Team }
  | { readonly kind: "agent"; readonly agent: Agent; readonly team: Team | undefined }
  | { readonly kind: "grant"; readonly grant: Grant; readonly team: Team | undefined }
  | {
      readonly kind: "handoff";
      readonly handoff: Handoff;
      readonly from: Team | undefined;
      readonly to: Team | undefined;
    }
  | { readonly kind: "overseer" };

/** Pure: undefined when the selection refers to something the Station no longer has. */
export function resolveSelection(
  station: Station,
  selection: Selection | null | undefined,
): ResolvedSelection | undefined {
  if (!selection) return undefined;
  const team = (id: string) => station.teams.find((t) => t.id === id);
  switch (selection.kind) {
    case "team": {
      const t = team(selection.id);
      return t ? { kind: "team", team: t } : undefined;
    }
    case "agent": {
      const agent = station.agents.find((a) => a.id === selection.id);
      return agent ? { kind: "agent", agent, team: team(agent.teamId) } : undefined;
    }
    case "grant": {
      const grant = station.grants.find((g) => g.id === selection.id);
      return grant ? { kind: "grant", grant, team: team(grant.teamId) } : undefined;
    }
    case "handoff": {
      const handoff = station.handoffs.find((h) => h.id === selection.id);
      return handoff
        ? { kind: "handoff", handoff, from: team(handoff.from), to: team(handoff.to) }
        : undefined;
    }
    case "overseer":
      return { kind: "overseer" };
  }
}

/** The team a selection belongs to (the writer for a handoff), or undefined for the overseer or nothing. */
export function teamOfSelection(
  station: Station,
  selection: Selection | null | undefined,
): string | undefined {
  const r = resolveSelection(station, selection);
  if (!r) return undefined;
  switch (r.kind) {
    case "team":
      return r.team.id;
    case "agent":
      return r.agent.teamId;
    case "grant":
      return r.grant.teamId;
    case "handoff":
      return r.handoff.from;
    case "overseer":
      return undefined;
  }
}
