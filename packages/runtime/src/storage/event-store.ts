import {
  type NewRuntimeEvent,
  parseRuntimeEvent,
  type RuntimeEvent,
} from "@darthsaul/outerworld-ai-core";
import type { Db } from "./database.js";

export type EventListener = (event: RuntimeEvent) => void;

interface Row {
  seq: number;
  type: string;
  at: string;
  agent_id: string | null;
  session_id: string | null;
  run_id: string | null;
  payload: string;
}

const toEvent = (row: Row): RuntimeEvent =>
  ({
    seq: row.seq,
    type: row.type,
    at: row.at,
    ...(row.agent_id !== null ? { agentId: row.agent_id } : {}),
    ...(row.session_id !== null ? { sessionId: row.session_id } : {}),
    ...(row.run_id !== null ? { runId: row.run_id } : {}),
    payload: JSON.parse(row.payload),
  }) as RuntimeEvent;

/**
 * The append-only event log (brief §10) over SQLite. `append` validates the event against the
 * core schema, assigns `seq` and `at`, commits, then notifies subscribers in-process. `since`
 * replays the log for SSE `Last-Event-ID` and restart recovery.
 */
export class EventStore {
  readonly #db: Db;
  readonly #now: () => Date;
  readonly #listeners = new Set<EventListener>();
  readonly #onListenerError: (error: unknown) => void;
  readonly #insert;
  readonly #since;
  readonly #latest;

  constructor(
    db: Db,
    options: { now?: () => Date; onListenerError?: (error: unknown) => void } = {},
  ) {
    this.#db = db;
    this.#now = options.now ?? (() => new Date());
    this.#onListenerError =
      options.onListenerError ?? ((error) => console.error("event listener failed:", error));
    this.#insert = db.prepare(
      "insert into events (type, at, agent_id, session_id, run_id, payload) values (@type, @at, @agentId, @sessionId, @runId, @payload)",
    );
    this.#since = db.prepare("select * from events where seq > ? order by seq limit ?");
    this.#latest = db.prepare("select coalesce(max(seq), 0) as seq from events");
  }

  append(event: NewRuntimeEvent): RuntimeEvent {
    const at = this.#now().toISOString();
    const candidate = { ...event, seq: this.latestSeq() + 1, at };
    const parsed = parseRuntimeEvent(candidate);
    if (!parsed.ok) {
      throw new Error(
        `invalid ${event.type} event: ${parsed.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`,
      );
    }
    const e = parsed.value;
    const { lastInsertRowid } = this.#insert.run({
      type: e.type,
      at,
      agentId: e.agentId ?? null,
      sessionId: e.sessionId ?? null,
      runId: e.runId ?? null,
      payload: JSON.stringify(e.payload),
    });
    const stored = { ...e, seq: Number(lastInsertRowid) } as RuntimeEvent;
    for (const listener of this.#listeners) {
      try {
        listener(stored);
      } catch (error) {
        // A broken listener must not break the log or the other listeners.
        this.#onListenerError(error);
      }
    }
    return stored;
  }

  /** Events with `seq` greater than the given one, oldest first. */
  since(seq: number, limit = 10_000): RuntimeEvent[] {
    return (this.#since.all(seq, limit) as Row[]).map(toEvent);
  }

  latestSeq(): number {
    return (this.#latest.get() as { seq: number }).seq;
  }

  subscribe(listener: EventListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  close(): void {
    this.#listeners.clear();
    this.#db.close();
  }
}
