import type { Station, StationEvent } from "@darthsaul/outerworld-ai-core";

export interface TimelineStep {
  /** Unitless tick; the player multiplies by a duration token. */
  readonly step: number;
  readonly event: StationEvent;
}

/**
 * The "Run digest" demo: the first team with agents completes a run, writes its ledger (so its
 * outbound handoffs carry a packet), finishes, and the overseer reconciles and posts the digest.
 * Timestamps advance one second per step from `startAt` so the proof line moves too.
 */
export function runDigestTimeline(station: Station, startAt: string): TimelineStep[] {
  const team =
    station.teams.find((t) => station.agents.some((a) => a.teamId === t.id)) ?? station.teams[0];
  if (!team) return [];
  const agents = station.agents.filter((a) => a.teamId === team.id);
  const lead = agents[0];
  const at = (step: number) =>
    new Date(Date.parse(startAt) + step * 1000).toISOString().replace(".000Z", "Z");
  const steps: TimelineStep[] = [
    { step: 1, event: { type: "run.started", teamId: team.id, at: at(1) } },
  ];
  if (lead) {
    steps.push({
      step: 2,
      event: {
        type: "agent.state",
        teamId: team.id,
        agentId: lead.id,
        state: "working",
        at: at(2),
        note: "reading the ledger",
      },
    });
  }
  steps.push({
    step: 4,
    event: { type: "ledger.written", teamId: team.id, at: at(4), linesAdded: 2, linesRemoved: 0 },
  });
  if (lead) {
    steps.push({
      step: 5,
      event: { type: "agent.state", teamId: team.id, agentId: lead.id, state: "done", at: at(5) },
    });
  }
  steps.push({
    step: 6,
    event: { type: "run.finished", teamId: team.id, at: at(6), outcome: "done" },
  });
  steps.push({ step: 7, event: { type: "overseer.state", state: "reconciling", at: at(7) } });
  steps.push({ step: 9, event: { type: "digest.posted", at: at(9) } });
  return steps;
}
