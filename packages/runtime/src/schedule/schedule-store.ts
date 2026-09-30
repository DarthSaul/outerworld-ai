import type { Db } from "../storage/database.js";

export type MissedReason = "down" | "busy" | "stopped" | "error";

/** One entry in a schedule's history: a run it started, or an occurrence that did not run. */
export interface ScheduleFire {
  readonly scheduledFor: string;
  readonly at: string;
  readonly outcome: "fired" | "missed";
  readonly reason?: MissedReason;
  readonly detail?: string;
  readonly manual: boolean;
  readonly sessionId?: string;
  readonly runId?: string;
  /** The run's state now, for a fired entry. */
  readonly runState?: string;
}

export interface ScheduleState {
  readonly signature: string;
  readonly lastScheduledFor: string;
  readonly sessionId?: string;
}

type Row = Record<string, string | number | null>;

const toFire = (r: Row): ScheduleFire => ({
  scheduledFor: String(r.scheduled_for),
  at: String(r.at),
  outcome: r.outcome as ScheduleFire["outcome"],
  manual: r.manual === 1,
  ...(r.reason !== null ? { reason: r.reason as MissedReason } : {}),
  ...(r.detail !== null ? { detail: String(r.detail) } : {}),
  ...(r.session_id !== null ? { sessionId: String(r.session_id) } : {}),
  ...(r.run_id !== null ? { runId: String(r.run_id) } : {}),
  ...(r.run_state !== null && r.run_state !== undefined ? { runState: String(r.run_state) } : {}),
});

/**
 * What the scheduler must remember across restarts (brief §13): per schedule, the last occurrence
 * it accounted for (to find one missed while the daemon was down), the config it was armed with,
 * and its dedicated session; plus a history of what each occurrence did.
 */
export class ScheduleStore {
  readonly #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  state(agentId: string, scheduleId: string): ScheduleState | undefined {
    const r = this.#db
      .prepare("select * from schedule_state where agent_id = ? and schedule_id = ?")
      .get(agentId, scheduleId) as Row | undefined;
    if (!r) return undefined;
    return {
      signature: String(r.signature),
      lastScheduledFor: String(r.last_scheduled_for),
      ...(r.session_id !== null ? { sessionId: String(r.session_id) } : {}),
    };
  }

  /** Records the occurrence accounted for and the config it belongs to; keeps the session. */
  mark(agentId: string, scheduleId: string, signature: string, lastScheduledFor: Date): void {
    this.#db
      .prepare(
        `insert into schedule_state (agent_id, schedule_id, signature, last_scheduled_for)
         values (?, ?, ?, ?)
         on conflict (agent_id, schedule_id)
         do update set signature = excluded.signature, last_scheduled_for = excluded.last_scheduled_for`,
      )
      .run(agentId, scheduleId, signature, lastScheduledFor.toISOString());
  }

  setSession(agentId: string, scheduleId: string, sessionId: string): void {
    this.#db
      .prepare("update schedule_state set session_id = ? where agent_id = ? and schedule_id = ?")
      .run(sessionId, agentId, scheduleId);
  }

  record(agentId: string, scheduleId: string, fire: Omit<ScheduleFire, "runState">): void {
    this.#db
      .prepare(
        `insert into schedule_fires
           (agent_id, schedule_id, scheduled_for, at, outcome, reason, detail, manual, session_id, run_id)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        agentId,
        scheduleId,
        fire.scheduledFor,
        fire.at,
        fire.outcome,
        fire.reason ?? null,
        fire.detail ?? null,
        fire.manual ? 1 : 0,
        fire.sessionId ?? null,
        fire.runId ?? null,
      );
  }

  /** Newest first. */
  history(agentId: string, scheduleId: string, limit = 10): ScheduleFire[] {
    return (
      this.#db
        .prepare(
          `select f.*, r.state as run_state from schedule_fires f
           left join runs r on r.id = f.run_id
           where f.agent_id = ? and f.schedule_id = ?
           order by f.id desc limit ?`,
        )
        .all(agentId, scheduleId, limit) as Row[]
    ).map(toFire);
  }
}
