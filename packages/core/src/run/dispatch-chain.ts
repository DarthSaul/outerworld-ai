import type { RuntimeEvent } from "../runtime-events.js";

/** One link of a dispatch chain: an agent and the run it worked in. */
export interface ChainLink {
  readonly agentId: string;
  readonly runId: string;
}

/**
 * Who asked whom for a run (ADR-0025), read from events alone: `dispatch.started` names the lead's
 * run and the worker's run, and `run.queued` names the run a review continues. Returns the chain
 * from the root run down to `runId`; just the run itself when nothing dispatched it, and an empty
 * list when no event mentions it. Pure.
 */
export function dispatchChain(events: readonly RuntimeEvent[], runId: string): ChainLink[] {
  const agentOf = new Map<string, string>();
  const parentOf = new Map<string, string>();
  for (const e of events) {
    if (e.type === "run.queued") {
      agentOf.set(e.runId, e.agentId);
      if (e.payload.parentRunId && e.payload.parentRunId !== e.runId) {
        parentOf.set(e.runId, e.payload.parentRunId);
      }
    } else if (e.type === "dispatch.started") {
      agentOf.set(e.runId, e.agentId);
      const worker = e.payload.workerRunId;
      if (worker) {
        agentOf.set(worker, e.payload.to);
        parentOf.set(worker, e.runId);
      }
    }
  }
  const chain: ChainLink[] = [];
  const seen = new Set<string>();
  let at: string | undefined = runId;
  while (at && !seen.has(at)) {
    seen.add(at);
    const agentId = agentOf.get(at);
    if (!agentId) break;
    chain.unshift({ agentId, runId: at });
    at = parentOf.get(at);
  }
  return chain;
}
