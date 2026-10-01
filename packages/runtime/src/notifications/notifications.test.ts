import { describe, expect, it } from "vitest";
import { openDatabase } from "../storage/database.js";
import { EventStore } from "../storage/event-store.js";
import { NotificationService } from "./notification-service.js";

const setup = () => {
  const db = openDatabase(":memory:");
  const events = new EventStore(db);
  const service = new NotificationService({ events, db });
  const run = { agentId: "quill", sessionId: "s1", runId: "r1" };
  const failed = () =>
    events.append({ type: "run.failed", ...run, payload: { error: "HTTP 500" } });
  const chatter = () => events.append({ type: "run.started", ...run, payload: { model: "m" } });
  const routine = () =>
    events.append({ type: "run.completed", ...run, payload: { trigger: "user" } });
  return { db, events, service, run, failed, chatter, routine };
};

describe("NotificationService", () => {
  it("lists notifications newest first, skipping events that project to none", () => {
    const t = setup();
    t.failed();
    t.chatter();
    t.routine();
    t.events.append({ type: "station.kill_switch", payload: { engaged: true } });
    const page = t.service.page();
    expect(page.items.map((n) => n.kind)).toEqual(["kill_switch", "run_failed"]);
    expect(page.unread).toBe(2);
    expect(page.readSeq).toBe(0);
    expect(page.nextBefore).toBeUndefined();
  });

  it("pages back with `before`, even past long stretches of events that project to none", () => {
    const t = setup();
    for (let i = 0; i < 5; i++) t.failed();
    for (let i = 0; i < 450; i++) t.routine();
    const first = t.service.page({ limit: 3 });
    expect(first.items).toHaveLength(3);
    expect(first.nextBefore).toBe(first.items[2]?.seq);
    const second = t.service.page({ limit: 3, before: first.nextBefore ?? 0 });
    expect(second.items.map((n) => n.seq)).toEqual([2, 1]);
    expect(second.nextBefore).toBeUndefined();
  });

  it("keeps one read marker that only moves forward and survives a restart", () => {
    const t = setup();
    t.failed();
    const second = t.failed();
    t.failed();
    expect(t.service.markRead(second.seq)).toBe(second.seq);
    expect(t.service.unread()).toBe(1);
    expect(t.service.markRead(1)).toBe(second.seq);
    expect(t.service.markRead(10_000)).toBe(3);
    const again = new NotificationService({ events: t.events, db: t.db });
    expect(again.readSeq()).toBe(3);
    expect(again.unread()).toBe(0);
  });
});
