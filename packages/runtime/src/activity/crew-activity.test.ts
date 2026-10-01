import { describe, expect, it } from "vitest";
import { openDatabase } from "../storage/database.js";
import { EventStore } from "../storage/event-store.js";
import { crewActivity } from "./crew-activity.js";

describe("crewActivity", () => {
  it("folds the log, oldest first, into what each crew member is doing now", () => {
    const events = new EventStore(openDatabase(":memory:"));
    const run = (runId: string, agentId: string) => ({ agentId, sessionId: `s-${runId}`, runId });
    events.append({ type: "run.started", ...run("r1", "quill"), payload: { model: "m" } });
    events.append({
      type: "run.awaiting_consent",
      ...run("r1", "quill"),
      payload: { consentId: "k" },
    });
    events.append({ type: "run.started", ...run("r2", "vesper"), payload: { model: "m" } });
    events.append({ type: "run.completed", ...run("r2", "vesper"), payload: {} });
    events.append({ type: "station.kill_switch", payload: { engaged: false } });
    const now = crewActivity(events);
    expect(now.quill).toMatchObject({ state: "awaiting_consent", runs: 1, sessionId: "s-r1" });
    expect(now.vesper).toMatchObject({ state: "done", runs: 0 });
    expect(Object.keys(now).sort()).toEqual(["quill", "vesper"]);
  });
});
