import type { AgentSchedule as Schedule } from "@darthsaul/outerworld-ai-core";
import { Cron } from "croner";
import { ConflictError, NotFoundError } from "../crew/crew-service.js";
import type { RunService } from "../run/run-service.js";
import type { SessionStore } from "../sessions/session-store.js";
import type { EventStore } from "../storage/event-store.js";
import { loadStationDir } from "../storage/station-dir.js";
import { cronIssue } from "./cron.js";
import type { MissedReason, ScheduleFire, ScheduleStore } from "./schedule-store.js";

/** Time and timers, so tests can drive the scheduler without waiting. */
export interface Clock {
  now(): Date;
  /** Calls `fn` after `ms`; returns a cancel function. */
  setTimer(fn: () => void, ms: number): () => void;
}

/** setTimeout caps a delay at about 24.8 days, so longer waits are chained. */
const MAX_DELAY = 2 ** 31 - 1;

export const systemClock: Clock = {
  now: () => new Date(),
  setTimer(fn, ms) {
    let handle: ReturnType<typeof setTimeout>;
    const wait = (left: number) => {
      handle = setTimeout(
        () => (left > MAX_DELAY ? wait(left - MAX_DELAY) : fn()),
        Math.min(left, MAX_DELAY),
      );
      handle.unref?.();
    };
    wait(Math.max(0, ms));
    return () => clearTimeout(handle);
  },
};

/** The machine's own zone, used when a schedule names none. */
export const machineTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** A schedule as the Commander sees it: its config, when it runs next, and what it did lately. */
export interface ScheduleView {
  readonly id: string;
  readonly cron: string;
  /** The zone it runs in: its own, or the machine's when it names none. */
  readonly timezone: string;
  readonly timezoneSet: boolean;
  readonly prompt: string;
  readonly enabled: boolean;
  readonly catchUp: boolean;
  readonly sessionId?: string;
  readonly nextRunAt?: string;
  /** Why it cannot run (a cron croner refuses). */
  readonly error?: string;
  readonly history: readonly ScheduleFire[];
}

interface Armed {
  readonly agentId: string;
  readonly schedule: Schedule;
  readonly cron: Cron;
  cancel?: () => void;
}

const key = (agentId: string, scheduleId: string) => `${agentId}/${scheduleId}`;

/**
 * The scheduler (brief §13): runs each enabled schedule's prompt in its session while the daemon
 * is up. On start, an occurrence missed while the daemon was down runs once when the schedule has
 * `catchUp`, and is recorded as missed otherwise. A new, edited, or re-enabled schedule counts
 * from the moment it is armed, so it never catches up on times before it existed. Scheduled runs
 * go through RunService like any other, so grants, approval mode, and budgets all apply.
 */
export class Scheduler {
  readonly #o: {
    home: string;
    runs: RunService;
    sessions: SessionStore;
    events: EventStore;
    store: ScheduleStore;
    clock: Clock;
    timezone: string;
  };
  readonly #armed = new Map<string, Armed>();
  readonly #inFlight = new Set<Promise<void>>();
  #loading: Promise<void> = Promise.resolve();
  #unsubscribe: (() => void) | undefined;
  #stopped = false;

  constructor(options: {
    home: string;
    runs: RunService;
    sessions: SessionStore;
    events: EventStore;
    store: ScheduleStore;
    clock?: Clock;
    /** Defaults to the machine's zone. */
    timezone?: string;
  }) {
    this.#o = {
      ...options,
      clock: options.clock ?? systemClock,
      timezone: options.timezone ?? machineTimeZone(),
    };
  }

  /** Accounts for occurrences missed while down, arms every schedule, and follows config edits. */
  async start(): Promise<void> {
    this.#stopped = false;
    await this.#load({ catchUp: true });
    this.#unsubscribe = this.#o.events.subscribe((e) => {
      if (e.type === "agent.updated" || e.type === "station.updated") void this.reload();
    });
  }

  /** Re-reads every agent.json and re-arms; called on config changes. */
  reload(): Promise<void> {
    return this.#load({ catchUp: false });
  }

  stop(): void {
    this.#stopped = true;
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    for (const a of this.#armed.values()) a.cancel?.();
    this.#armed.clear();
  }

  /** Resolves once every fire in progress has finished (tests; shutdown). */
  async idle(): Promise<void> {
    await this.#loading;
    while (this.#inFlight.size) await Promise.all([...this.#inFlight]);
  }

  async view(agentId: string): Promise<ScheduleView[]> {
    const loaded = await loadStationDir(this.#o.home);
    const agent = loaded.agents.find((a) => a.id === agentId);
    if (!agent) throw new NotFoundError(`no agent "${agentId}"`);
    const now = this.#o.clock.now();
    return agent.config.schedules.map((s) => {
      const timezone = s.timezone ?? this.#o.timezone;
      const error = cronIssue(s.cron, timezone);
      const next = !error && s.enabled ? new Cron(s.cron, { timezone }).nextRun(now) : null;
      const sessionId = this.#sessionOf(agentId, s);
      return {
        id: s.id,
        cron: s.cron,
        timezone,
        timezoneSet: s.timezone !== undefined,
        prompt: s.prompt,
        enabled: s.enabled,
        catchUp: s.catchUp,
        ...(sessionId ? { sessionId } : {}),
        ...(next ? { nextRunAt: next.toISOString() } : {}),
        ...(error ? { error } : {}),
        history: this.#o.store.history(agentId, s.id),
      };
    });
  }

  /** Run now: fires the schedule's prompt once, outside its timetable. */
  async runNow(agentId: string, scheduleId: string): Promise<ScheduleFire> {
    const loaded = await loadStationDir(this.#o.home);
    const schedule = loaded.agents
      .find((a) => a.id === agentId)
      ?.config.schedules.find((s) => s.id === scheduleId);
    if (!schedule) throw new NotFoundError(`no schedule "${scheduleId}" for "${agentId}"`);
    const fire = await this.#fire(agentId, schedule, this.#o.clock.now(), { manual: true });
    if (fire.outcome === "missed")
      throw new ConflictError(fire.detail ?? "the schedule did not run");
    return fire;
  }

  #load(options: { catchUp: boolean }): Promise<void> {
    this.#loading = this.#loading.then(() => this.#arm(options)).catch(() => undefined);
    return this.#loading;
  }

  async #arm({ catchUp }: { catchUp: boolean }): Promise<void> {
    if (this.#stopped) return;
    const loaded = await loadStationDir(this.#o.home);
    for (const a of this.#armed.values()) a.cancel?.();
    this.#armed.clear();
    const now = this.#o.clock.now();
    for (const agent of loaded.agents) {
      for (const schedule of agent.config.schedules) {
        const timezone = schedule.timezone ?? this.#o.timezone;
        if (cronIssue(schedule.cron, timezone)) continue;
        const signature = `${schedule.cron}|${timezone}|${schedule.enabled}`;
        const state = this.#o.store.state(agent.id, schedule.id);
        const cron = new Cron(schedule.cron, { timezone });
        if (!schedule.enabled || !state || state.signature !== signature) {
          // New, edited, disabled, or re-enabled: count from now, never from before.
          this.#o.store.mark(agent.id, schedule.id, signature, now);
          if (!schedule.enabled) continue;
        } else if (catchUp) {
          const missed = cron.previousRuns(1, now)[0];
          if (missed && missed > new Date(state.lastScheduledFor)) {
            this.#o.store.mark(agent.id, schedule.id, signature, missed);
            if (schedule.catchUp) this.#track(this.#fire(agent.id, schedule, missed, {}));
            else this.#missed(agent.id, schedule, missed, "down", {});
          }
        }
        const armed: Armed = { agentId: agent.id, schedule, cron };
        this.#armed.set(key(agent.id, schedule.id), armed);
        this.#schedule(armed, now, signature);
      }
    }
  }

  #schedule(armed: Armed, from: Date, signature: string): void {
    const next = armed.cron.nextRun(from);
    if (!next) return;
    armed.cancel = this.#o.clock.setTimer(() => {
      if (this.#armed.get(key(armed.agentId, armed.schedule.id)) !== armed) return;
      this.#o.store.mark(armed.agentId, armed.schedule.id, signature, next);
      const now = this.#o.clock.now();
      this.#schedule(armed, now > next ? now : next, signature);
      this.#track(this.#fire(armed.agentId, armed.schedule, next, {}));
    }, next.getTime() - this.#o.clock.now().getTime());
  }

  #track(p: Promise<unknown>): void {
    const done: Promise<void> = p.then(
      () => undefined,
      () => undefined,
    );
    this.#inFlight.add(done);
    void done.then(() => this.#inFlight.delete(done));
  }

  /** The configured session if it is usable, else the schedule's own "Scheduled" session. */
  #sessionOf(agentId: string, schedule: Schedule): string | undefined {
    if (schedule.sessionId) {
      const s = this.#o.sessions.getSession(schedule.sessionId);
      if (s && s.agentId === agentId && !s.archivedAt) return s.id;
    }
    const own = this.#o.store.state(agentId, schedule.id)?.sessionId;
    const s = own ? this.#o.sessions.getSession(own) : undefined;
    return s && !s.archivedAt ? s.id : undefined;
  }

  async #fire(
    agentId: string,
    schedule: Schedule,
    scheduledFor: Date,
    options: { manual?: boolean },
  ): Promise<ScheduleFire> {
    const manual = options.manual === true;
    if (this.#o.runs.killSwitchEngaged()) {
      return this.#missed(agentId, schedule, scheduledFor, "stopped", {
        manual,
        detail: "the kill switch is on",
      });
    }
    let sessionId = this.#sessionOf(agentId, schedule);
    if (!sessionId) {
      sessionId = this.#o.runs.createSession(agentId, `Scheduled: ${schedule.id}`).id;
      if (!this.#o.store.state(agentId, schedule.id)) {
        this.#o.store.mark(agentId, schedule.id, "manual", scheduledFor);
      }
      this.#o.store.setSession(agentId, schedule.id, sessionId);
    }
    if (this.#o.runs.hasActiveRun(sessionId)) {
      return this.#missed(agentId, schedule, scheduledFor, "busy", {
        manual,
        sessionId,
        detail: "its session was still running",
      });
    }
    try {
      const { runId } = await this.#o.runs.send(sessionId, schedule.prompt, {
        trigger: "schedule",
      });
      const fire: ScheduleFire = {
        scheduledFor: scheduledFor.toISOString(),
        at: this.#o.clock.now().toISOString(),
        outcome: "fired",
        manual,
        sessionId,
        runId,
      };
      this.#o.store.record(agentId, schedule.id, fire);
      this.#o.events.append({
        type: "schedule.fired",
        agentId,
        sessionId,
        runId,
        payload: {
          scheduleId: schedule.id,
          scheduledFor: fire.scheduledFor,
          ...(manual ? { manual } : {}),
        },
      });
      return fire;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const reason: MissedReason = this.#o.runs.killSwitchEngaged() ? "stopped" : "error";
      return this.#missed(agentId, schedule, scheduledFor, reason, { manual, sessionId, detail });
    }
  }

  #missed(
    agentId: string,
    schedule: Schedule,
    scheduledFor: Date,
    reason: MissedReason,
    extra: { manual?: boolean; sessionId?: string; detail?: string },
  ): ScheduleFire {
    const fire: ScheduleFire = {
      scheduledFor: scheduledFor.toISOString(),
      at: this.#o.clock.now().toISOString(),
      outcome: "missed",
      reason,
      manual: extra.manual === true,
      ...(extra.sessionId ? { sessionId: extra.sessionId } : {}),
      ...(extra.detail ? { detail: extra.detail } : {}),
    };
    this.#o.store.record(agentId, schedule.id, fire);
    this.#o.events.append({
      type: "schedule.missed",
      agentId,
      ...(extra.sessionId ? { sessionId: extra.sessionId } : {}),
      payload: {
        scheduleId: schedule.id,
        scheduledFor: fire.scheduledFor,
        reason,
        ...(extra.detail ? { detail: extra.detail } : {}),
      },
    });
    return fire;
  }
}
