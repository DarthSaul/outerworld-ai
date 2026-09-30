import { randomUUID } from "node:crypto";
import type { Db } from "../storage/database.js";

export type DispatchStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "blocked"
  | "interrupted";

export interface DispatchRecord {
  readonly id: string;
  readonly leadAgentId: string;
  readonly leadSessionId: string;
  readonly leadRunId: string;
  readonly workerAgentId: string;
  readonly workerSessionId: string;
  readonly workerRunId?: string;
  readonly task: string;
  readonly inputs?: unknown;
  readonly status: DispatchStatus;
  readonly summary?: string;
  readonly createdAt: string;
  readonly endedAt?: string;
}

type Row = Record<string, string | null>;

const toDispatch = (r: Row): DispatchRecord => ({
  id: String(r.id),
  leadAgentId: String(r.lead_agent_id),
  leadSessionId: String(r.lead_session_id),
  leadRunId: String(r.lead_run_id),
  workerAgentId: String(r.worker_agent_id),
  workerSessionId: String(r.worker_session_id),
  task: String(r.task),
  status: r.status as DispatchStatus,
  createdAt: String(r.created_at),
  ...(r.worker_run_id !== null ? { workerRunId: String(r.worker_run_id) } : {}),
  ...(r.inputs !== null ? { inputs: JSON.parse(String(r.inputs)) } : {}),
  ...(r.summary !== null ? { summary: String(r.summary) } : {}),
  ...(r.ended_at !== null ? { endedAt: String(r.ended_at) } : {}),
});

/** Dispatches (brief §7): who handed what to whom, from which run, and how it ended. */
export class DispatchStore {
  readonly #db: Db;
  readonly #now: () => Date;

  constructor(db: Db, options: { now?: () => Date } = {}) {
    this.#db = db;
    this.#now = options.now ?? (() => new Date());
  }

  create(input: {
    leadAgentId: string;
    leadSessionId: string;
    leadRunId: string;
    workerAgentId: string;
    workerSessionId: string;
    task: string;
    inputs?: unknown;
  }): DispatchRecord {
    const row = {
      id: randomUUID(),
      lead_agent_id: input.leadAgentId,
      lead_session_id: input.leadSessionId,
      lead_run_id: input.leadRunId,
      worker_agent_id: input.workerAgentId,
      worker_session_id: input.workerSessionId,
      task: input.task,
      inputs: input.inputs === undefined ? null : JSON.stringify(input.inputs),
      status: "running",
      created_at: this.#now().toISOString(),
    };
    this.#db
      .prepare(
        "insert into dispatches (id, lead_agent_id, lead_session_id, lead_run_id, worker_agent_id, worker_session_id, task, inputs, status, created_at) values (@id, @lead_agent_id, @lead_session_id, @lead_run_id, @worker_agent_id, @worker_session_id, @task, @inputs, @status, @created_at)",
      )
      .run(row);
    return this.get(row.id) as DispatchRecord;
  }

  setWorkerRun(id: string, runId: string): void {
    this.#db.prepare("update dispatches set worker_run_id = ? where id = ?").run(runId, id);
  }

  finish(id: string, status: Exclude<DispatchStatus, "running">, summary: string): DispatchRecord {
    this.#db
      .prepare(
        "update dispatches set status = ?, summary = ?, ended_at = ? where id = ? and status = 'running'",
      )
      .run(status, summary, this.#now().toISOString(), id);
    return this.get(id) as DispatchRecord;
  }

  get(id: string): DispatchRecord | undefined {
    const row = this.#db.prepare("select * from dispatches where id = ?").get(id) as
      | Row
      | undefined;
    return row ? toDispatch(row) : undefined;
  }

  /** Dispatches made from one lead session, oldest first. */
  forLeadSession(sessionId: string): DispatchRecord[] {
    return (
      this.#db
        .prepare("select * from dispatches where lead_session_id = ? order by created_at, rowid")
        .all(sessionId) as Row[]
    ).map(toDispatch);
  }

  running(): DispatchRecord[] {
    return (
      this.#db
        .prepare("select * from dispatches where status = 'running' order by created_at, rowid")
        .all() as Row[]
    ).map(toDispatch);
  }
}
