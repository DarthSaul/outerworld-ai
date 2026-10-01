import {
  activityOf,
  CREW_ACTIVITY_EVENT_TYPES,
  type CrewActivityEntry,
  type CrewActivityState,
  foldCrewActivity,
} from "@darthsaul/outerworld-ai-core";
import type { EventStore } from "../storage/event-store.js";

/** How far back the fold reads; a run active longer ago than this was interrupted on restart. */
const WINDOW = 5000;

/**
 * What every crew member is doing now (D24), folded from the last run events in the log with
 * core's `foldCrewActivity`. Only crew that appear in the window are listed; the rest are idle.
 */
export function crewActivity(events: EventStore): Record<string, CrewActivityEntry> {
  const recent = events.ofTypes(CREW_ACTIVITY_EVENT_TYPES, { limit: WINDOW }).reverse();
  const state: CrewActivityState = recent.reduce(foldCrewActivity, {});
  return Object.fromEntries(Object.keys(state).map((id) => [id, activityOf(state, id)]));
}
