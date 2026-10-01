import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RuntimeEvent } from "@darthsaul/outerworld-ai-core";
import { describe, expect, it } from "vitest";
import { reply, scripted, setup } from "../test/loop.js";
import { cronIssue } from "./cron.js";
import { type Clock, Scheduler } from "./scheduler.js";

/** A clock the test moves by hand; timers due on the way fire in order. */
class ManualClock implements Clock {
  #t: number;
  #timers: { at: number; fn: () => void }[] = [];
  constructor(start: string) {
    this.#t = Date.parse(start);
  }
  now() {
    return new Date(this.#t);
  }
  setTimer(fn: () => void, ms: number) {
    const timer = { at: this.#t + Math.max(0, ms), fn };
    this.#timers.push(timer);
    return () => {
      this.#timers = this.#timers.filter((t) => t !== timer);
    };
  }
  advanceTo(iso: string) {
    const target = Date.parse(iso);
    for (;;) {
      const due = this.#timers.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.#timers = this.#timers.filter((t) => t !== due);
      this.#t = due.at;
      due.fn();
    }
    this.#t = target;
  }
}

const schedule = (over: Record<string, unknown> = {}) => ({
  id: "briefing",
  cron: "0 9 * * *",
  timezone: "UTC",
  prompt: "Write the briefing.",
  catchUp: false,
  enabled: true,
  ...over,
});

const world = (start: string, schedules: unknown[], replies = 10) => {
  const t = setup(scripted(Array.from({ length: replies }, () => reply("Done."))));
  const clock = new ManualClock(start);
  const store = t.scheduleStore;
  const setSchedules = (list: unknown[]) => {
    const path = join(t.home, "agents", "quill", "agent.json");
    const config = JSON.parse(readFileSync(path, "utf8"));
    writeFileSync(path, JSON.stringify({ ...config, schedules: list }));
  };
  setSchedules(schedules);
  const make = () =>
    new Scheduler({
      home: t.home,
      runs: t.service,
      sessions: t.sessions,
      events: t.events,
      store,
      clock,
    });
  const scheduler = make();
  const of = <T extends RuntimeEvent["type"]>(type: T) =>
    t.events.since(0).filter((e) => e.type === type) as Extract<RuntimeEvent, { type: T }>[];
  /** Moves the clock, then waits for every fire and the runs they started. */
  const step = async (iso: string, s = scheduler) => {
    clock.advanceTo(iso);
    await s.idle();
    for (const e of of("schedule.fired")) if (e.runId) await t.service.settled(e.runId);
  };
  return { ...t, clock, store, scheduler, make, setSchedules, of, step };
};

describe("Scheduler", () => {
  it("runs the prompt at each occurrence in the schedule's own Scheduled session", async () => {
    const w = world("2026-10-05T08:00:00Z", [schedule()]);
    await w.scheduler.start();
    const [view] = await w.scheduler.view("quill");
    expect(view).toMatchObject({ id: "briefing", nextRunAt: "2026-10-05T09:00:00.000Z" });

    await w.step("2026-10-05T09:00:00Z");
    await w.step("2026-10-06T09:00:00Z");
    const fired = w.of("schedule.fired");
    expect(fired.map((e) => e.payload.scheduledFor)).toEqual([
      "2026-10-05T09:00:00.000Z",
      "2026-10-06T09:00:00.000Z",
    ]);
    const sessionId = fired[0]?.sessionId ?? "";
    expect(fired[1]?.sessionId).toBe(sessionId);
    expect(w.sessions.getSession(sessionId)?.title).toBe("Scheduled: briefing");
    const runs = w.sessions.runs(sessionId);
    expect(runs.map((r) => [r.trigger, r.state])).toEqual([
      ["schedule", "completed"],
      ["schedule", "completed"],
    ]);
    expect(w.sessions.messages(sessionId)[0]?.message).toEqual({
      role: "user",
      text: "Write the briefing.",
    });
    const [after] = await w.scheduler.view("quill");
    expect(after?.nextRunAt).toBe("2026-10-07T09:00:00.000Z");
    expect(after?.sessionId).toBe(sessionId);
    expect(after?.history.map((h) => [h.outcome, h.runState])).toEqual([
      ["fired", "completed"],
      ["fired", "completed"],
    ]);
    w.scheduler.stop();
  });

  it("keeps local time across DST: 9:00 New York is 14:00Z, then 13:00Z after the change", async () => {
    const w = world("2026-03-06T20:00:00Z", [schedule({ timezone: "America/New_York" })]);
    await w.scheduler.start();
    await w.step("2026-03-07T14:00:00Z");
    await w.step("2026-03-08T13:00:00Z");
    expect(w.of("schedule.fired").map((e) => e.payload.scheduledFor)).toEqual([
      "2026-03-07T14:00:00.000Z",
      "2026-03-08T13:00:00.000Z",
    ]);
    w.scheduler.stop();
  });

  it("runs a time the spring change skips once, and a time the autumn change repeats once", async () => {
    const spring = world("2026-03-07T12:00:00Z", [
      schedule({ cron: "30 2 * * *", timezone: "America/New_York" }),
    ]);
    await spring.scheduler.start();
    await spring.step("2026-03-08T12:00:00Z");
    await spring.step("2026-03-09T12:00:00Z");
    expect(spring.of("schedule.fired").map((e) => e.payload.scheduledFor)).toEqual([
      "2026-03-08T07:30:00.000Z",
      "2026-03-09T06:30:00.000Z",
    ]);
    spring.scheduler.stop();

    const autumn = world("2026-10-31T12:00:00Z", [
      schedule({ cron: "30 1 * * *", timezone: "America/New_York" }),
    ]);
    await autumn.scheduler.start();
    await autumn.step("2026-11-01T12:00:00Z");
    expect(autumn.of("schedule.fired").map((e) => e.payload.scheduledFor)).toEqual([
      "2026-11-01T05:30:00.000Z",
    ]);
    autumn.scheduler.stop();
  });

  it("records an occurrence missed while the daemon was down, once, without running it", async () => {
    const w = world("2026-10-05T08:00:00Z", [schedule()]);
    await w.scheduler.start();
    w.scheduler.stop();
    w.clock.advanceTo("2026-10-07T12:00:00Z");
    const again = w.make();
    await again.start();
    await again.idle();
    const missed = w.of("schedule.missed");
    expect(missed.map((e) => [e.payload.scheduledFor, e.payload.reason])).toEqual([
      ["2026-10-07T09:00:00.000Z", "down"],
    ]);
    expect(w.of("schedule.fired")).toEqual([]);
    // Restarting again does not report it twice.
    again.stop();
    const third = w.make();
    await third.start();
    expect(w.of("schedule.missed")).toHaveLength(1);
    third.stop();
  });

  it("with catch-up, runs the most recent missed occurrence once on startup", async () => {
    const w = world("2026-10-05T08:00:00Z", [schedule({ catchUp: true })]);
    await w.scheduler.start();
    w.scheduler.stop();
    w.clock.advanceTo("2026-10-07T12:00:00Z");
    const again = w.make();
    await again.start();
    await w.step("2026-10-07T12:00:00Z", again);
    expect(w.of("schedule.fired").map((e) => e.payload.scheduledFor)).toEqual([
      "2026-10-07T09:00:00.000Z",
    ]);
    expect(w.of("schedule.missed")).toEqual([]);
    again.stop();
  });

  it("never catches up on times before a schedule existed or was edited", async () => {
    const w = world("2026-10-05T12:00:00Z", [schedule({ catchUp: true })]);
    await w.scheduler.start();
    await w.scheduler.idle();
    expect(w.of("schedule.fired")).toEqual([]);
    // Edited at noon on the 6th to run at 10:00: restarting that afternoon catches nothing up.
    w.clock.advanceTo("2026-10-06T08:00:00Z");
    w.setSchedules([schedule({ catchUp: true, cron: "0 10 * * *" })]);
    await w.scheduler.reload();
    w.scheduler.stop();
    w.clock.advanceTo("2026-10-06T08:30:00Z");
    const again = w.make();
    await again.start();
    await again.idle();
    expect(w.of("schedule.fired")).toEqual([]);
    await w.step("2026-10-06T10:00:00Z", again);
    expect(w.of("schedule.fired").map((e) => e.payload.scheduledFor)).toEqual([
      "2026-10-06T10:00:00.000Z",
    ]);
    again.stop();
  });

  it("follows edits: a changed agent.json re-arms, and a disabled schedule never runs", async () => {
    const w = world("2026-10-05T08:00:00Z", [schedule()]);
    await w.scheduler.start();
    w.setSchedules([schedule({ enabled: false })]);
    w.events.append({ type: "agent.updated", agentId: "quill", payload: { change: "updated" } });
    await w.scheduler.idle();
    await w.step("2026-10-06T12:00:00Z");
    expect(w.of("schedule.fired")).toEqual([]);
    const [view] = await w.scheduler.view("quill");
    expect(view?.nextRunAt).toBeUndefined();
    w.scheduler.stop();
  });

  it("skips an occurrence while its session is busy or the kill switch is on, and says why", async () => {
    const w = world("2026-10-05T08:00:00Z", [schedule({ cron: "0 * * * *" })]);
    await w.scheduler.start();
    w.killSwitch.set(true);
    await w.step("2026-10-05T09:00:00Z");
    w.killSwitch.set(false);
    // A session with a run still going: the next occurrence does not stack another run on it.
    const [view] = await w.scheduler.view("quill");
    expect(view?.history[0]).toMatchObject({ outcome: "missed", reason: "stopped" });
    const fire = await w.scheduler.runNow("quill", "briefing");
    w.clock.advanceTo("2026-10-05T10:00:00Z");
    await w.scheduler.idle();
    expect(w.of("schedule.missed").map((e) => e.payload.reason)).toEqual(["stopped", "busy"]);
    await w.service.settled(fire.runId ?? "");
    w.scheduler.stop();
  });

  it("runs now on demand, marked manual, in the same session", async () => {
    const w = world("2026-10-05T08:00:00Z", [schedule({ enabled: false })]);
    await w.scheduler.start();
    const fire = await w.scheduler.runNow("quill", "briefing");
    expect(fire).toMatchObject({ outcome: "fired", manual: true });
    expect((await w.service.settled(fire.runId ?? "")).state).toBe("completed");
    expect(w.of("schedule.fired")[0]?.payload.manual).toBe(true);
    const [view] = await w.scheduler.view("quill");
    expect(view?.sessionId).toBe(fire.sessionId);
    await expect(w.scheduler.runNow("quill", "nope")).rejects.toThrow(/no schedule/);
    w.scheduler.stop();
  });

  it("uses the machine's zone when a schedule names none, and reports a cron croner refuses", async () => {
    const w = world("2026-10-05T08:00:00Z", [
      schedule({ timezone: undefined }),
      schedule({ id: "bad", cron: "61 * * * *" }),
    ]);
    const s = new Scheduler({
      home: w.home,
      runs: w.service,
      sessions: w.sessions,
      events: w.events,
      store: w.store,
      clock: w.clock,
      timezone: "Asia/Tokyo",
    });
    await s.start();
    const [tokyo, bad] = await s.view("quill");
    expect(tokyo).toMatchObject({ timezone: "Asia/Tokyo", timezoneSet: false });
    expect(tokyo?.nextRunAt).toBe("2026-10-06T00:00:00.000Z");
    expect(bad?.error).toMatch(/minute/);
    expect(bad?.nextRunAt).toBeUndefined();
    s.stop();
  });
});

describe("cronIssue", () => {
  it("accepts what croner runs and explains what it refuses", () => {
    expect(cronIssue("0 9 * * 1-5", "Europe/Stockholm")).toBeUndefined();
    expect(cronIssue("0 9 * * *")).toBeUndefined();
    expect(cronIssue("61 * * * *")).toMatch(/minute/);
  });
});
