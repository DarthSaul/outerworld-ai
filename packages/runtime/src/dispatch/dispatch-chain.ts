import { type ChainLink, dispatchChain, type RuntimeEvent } from "@darthsaul/outerworld-ai-core";
import type { EventStore } from "../storage/event-store.js";

/** Deeper than any chain policy allows (depth 3, plus reviews), so a bad log cannot loop. */
const MAX_HOPS = 16;

/**
 * Who asked whom for a run (ADR-0025), from the event log alone: each run's `run.queued` names
 * the run above it, so the chain is one indexed lookup per level. Core's `dispatchChain` turns
 * the events into links, root first.
 */
export function dispatchChainOf(events: EventStore, runId: string): ChainLink[] {
  const found: RuntimeEvent[] = [];
  const seen = new Set<string>();
  let at: string | undefined = runId;
  for (let hop = 0; at && !seen.has(at) && hop < MAX_HOPS; hop++) {
    seen.add(at);
    const queued = events.ofRun(at, ["run.queued"]).at(0);
    if (!queued || queued.type !== "run.queued") break;
    found.push(queued);
    at = queued.payload.parentRunId;
  }
  return dispatchChain(found, runId);
}
