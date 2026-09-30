import { randomUUID } from "node:crypto";
import {
  ChatMessage,
  nextRunState,
  type RunEvent,
  type RunState,
} from "@darthsaul/outerworld-ai-core";
import type { Db } from "../storage/database.js";

export interface SessionRecord {
  readonly id: string;
  readonly agentId: string;
  readonly title: string;
  readonly createdAt: string;
  readonly archivedAt?: string;
}

export type RunTrigger = "user" | "dispatch" | "schedule" | "review";

export interface RunRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly state: RunState;
  readonly trigger: RunTrigger;
  readonly model: string;
  readonly createdAt: string;
  readonly startedAt?: string;
  readonly endedAt?: string;
  readonly error?: string;
  readonly steps: number;
}

export interface StoredMessage {
  readonly id: string;
  readonly sessionId: string;
  readonly runId?: string;
  readonly position: number;
  readonly message: ChatMessage;
  readonly createdAt: string;
}

type Row = Record<string, string | number | null>;
const str = (v: string | number | null | undefined) =>
  v === null || v === undefined ? undefined : String(v);

const toSession = (r: Row): SessionRecord => ({
  id: String(r.id),
  agentId: String(r.agent_id),
  title: String(r.title),
  createdAt: String(r.created_at),
  ...(r.archived_at !== null ? { archivedAt: String(r.archived_at) } : {}),
});

const toRun = (r: Row): RunRecord => {
  const optional = {
    startedAt: str(r.started_at),
    endedAt: str(r.ended_at),
    error: str(r.error),
  };
  return {
    id: String(r.id),
    sessionId: String(r.session_id),
    agentId: String(r.agent_id),
    state: r.state as RunState,
    trigger: r.trigger as RunTrigger,
    model: String(r.model),
    createdAt: String(r.created_at),
    steps: Number(r.steps),
    ...Object.fromEntries(Object.entries(optional).filter(([, v]) => v !== undefined)),
  };
};

const UNFINISHED: readonly RunState[] = ["queued", "running", "awaiting_consent"];

/**
 * Sessions, their messages, and runs in SQLite (brief §9). Every run state change goes through
 * core's state machine; an invalid transition throws and changes nothing. Pure storage: events
 * are the caller's job.
 */
export class SessionStore {
  readonly #db: Db;
  readonly #now: () => Date;

  constructor(db: Db, options: { now?: () => Date } = {}) {
    this.#db = db;
    this.#now = options.now ?? (() => new Date());
  }

  #at = () => this.#now().toISOString();

  createSession(agentId: string, title: string): SessionRecord {
    const row = { id: randomUUID(), agent_id: agentId, title, created_at: this.#at() };
    this.#db
      .prepare(
        "insert into sessions (id, agent_id, title, created_at) values (@id, @agent_id, @title, @created_at)",
      )
      .run(row);
    return toSession({ ...row, archived_at: null });
  }

  getSession(id: string): SessionRecord | undefined {
    const row = this.#db.prepare("select * from sessions where id = ?").get(id) as Row | undefined;
    return row ? toSession(row) : undefined;
  }

  listSessions(agentId: string, options: { includeArchived?: boolean } = {}): SessionRecord[] {
    const archived = options.includeArchived ? "" : "and archived_at is null";
    return (
      this.#db
        .prepare(
          `select * from sessions where agent_id = ? ${archived} order by created_at desc, rowid desc`,
        )
        .all(agentId) as Row[]
    ).map(toSession);
  }

  renameSession(id: string, title: string): SessionRecord {
    return this.#updateSession(id, "update sessions set title = ? where id = ?", title);
  }

  archiveSession(id: string): SessionRecord {
    return this.#updateSession(id, "update sessions set archived_at = ? where id = ?", this.#at());
  }

  #updateSession(id: string, sql: string, value: string): SessionRecord {
    if (this.#db.prepare(sql).run(value, id).changes === 0) throw new Error(`no session "${id}"`);
    return this.getSession(id) as SessionRecord;
  }

  appendMessage(sessionId: string, runId: string | undefined, message: ChatMessage): StoredMessage {
    const parsed = ChatMessage.parse(message);
    const insert = this.#db.transaction(() => {
      const { next } = this.#db
        .prepare("select coalesce(max(position), 0) + 1 as next from messages where session_id = ?")
        .get(sessionId) as { next: number };
      const row = {
        id: randomUUID(),
        session_id: sessionId,
        run_id: runId ?? null,
        position: next,
        message: JSON.stringify(parsed),
        created_at: this.#at(),
      };
      this.#db
        .prepare(
          "insert into messages (id, session_id, run_id, position, message, created_at) values (@id, @session_id, @run_id, @position, @message, @created_at)",
        )
        .run(row);
      return row;
    });
    const row = insert();
    return {
      id: row.id,
      sessionId,
      ...(runId !== undefined ? { runId } : {}),
      position: row.position,
      message: parsed,
      createdAt: row.created_at,
    };
  }

  messages(sessionId: string): StoredMessage[] {
    return (
      this.#db
        .prepare("select * from messages where session_id = ? order by position")
        .all(sessionId) as Row[]
    ).map((r) => ({
      id: String(r.id),
      sessionId: String(r.session_id),
      ...(r.run_id !== null ? { runId: String(r.run_id) } : {}),
      position: Number(r.position),
      message: ChatMessage.parse(JSON.parse(String(r.message))),
      createdAt: String(r.created_at),
    }));
  }

  createRun(input: {
    sessionId: string;
    agentId: string;
    trigger: RunTrigger;
    model: string;
  }): RunRecord {
    const row = {
      id: randomUUID(),
      session_id: input.sessionId,
      agent_id: input.agentId,
      state: "queued",
      trigger: input.trigger,
      model: input.model,
      created_at: this.#at(),
    };
    this.#db
      .prepare(
        "insert into runs (id, session_id, agent_id, state, trigger, model, created_at) values (@id, @session_id, @agent_id, @state, @trigger, @model, @created_at)",
      )
      .run(row);
    return this.getRun(row.id) as RunRecord;
  }

  getRun(id: string): RunRecord | undefined {
    const row = this.#db.prepare("select * from runs where id = ?").get(id) as Row | undefined;
    return row ? toRun(row) : undefined;
  }

  runs(sessionId: string): RunRecord[] {
    return (
      this.#db
        .prepare("select * from runs where session_id = ? order by created_at desc, rowid desc")
        .all(sessionId) as Row[]
    ).map(toRun);
  }

  /** Applies a state-machine event. Throws, changing nothing, when the event is not allowed. */
  transition(id: string, event: RunEvent, details: { error?: string } = {}): RunRecord {
    const run = this.getRun(id);
    if (!run) throw new Error(`no run "${id}"`);
    const next = nextRunState(run.state, event);
    if (!next) throw new Error(`run ${id} is ${run.state}; ${event} is not allowed`);
    const at = this.#at();
    const ended = next !== "running" && next !== "awaiting_consent" && next !== "queued";
    this.#db
      .prepare(
        `update runs set state = @state,
           started_at = case when @started then coalesce(started_at, @at) else started_at end,
           ended_at = case when @ended then @at else ended_at end,
           error = coalesce(@error, error)
         where id = @id`,
      )
      .run({
        id,
        state: next,
        at,
        started: event === "start" ? 1 : 0,
        ended: ended ? 1 : 0,
        error: details.error ?? null,
      });
    return this.getRun(id) as RunRecord;
  }

  countStep(id: string): void {
    this.#db.prepare("update runs set steps = steps + 1 where id = ?").run(id);
  }

  /** Crash semantics (brief §8): every unfinished run becomes interrupted. Never resumed. */
  interruptUnfinished(): RunRecord[] {
    const placeholders = UNFINISHED.map(() => "?").join(", ");
    const open = (
      this.#db
        .prepare(`select id from runs where state in (${placeholders})`)
        .all(...UNFINISHED) as Row[]
    ).map((r) => String(r.id));
    return open.map((id) => this.transition(id, "interrupt"));
  }
}
