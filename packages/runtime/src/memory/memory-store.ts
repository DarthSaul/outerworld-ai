import { randomUUID } from "node:crypto";
import type { Db } from "../storage/database.js";

export type MemoryScope = "agent" | "station";
export type MemoryStatus = "proposed" | "approved" | "rejected";

export interface MemoryRecord {
  readonly id: string;
  readonly agentId: string;
  readonly scope: MemoryScope;
  readonly text: string;
  readonly status: MemoryStatus;
  readonly sourceRunId?: string;
  readonly createdAt: string;
  readonly decidedAt?: string;
}

type Row = Record<string, string | null>;

const toMemory = (r: Row): MemoryRecord => ({
  id: String(r.id),
  agentId: String(r.agent_id),
  scope: r.scope as MemoryScope,
  text: String(r.text),
  status: r.status as MemoryStatus,
  createdAt: String(r.created_at),
  ...(r.source_run_id !== null ? { sourceRunId: String(r.source_run_id) } : {}),
  ...(r.decided_at !== null ? { decidedAt: String(r.decided_at) } : {}),
});

/**
 * Memory (brief §14): agents propose; nothing becomes a belief without the Commander. Phase 4
 * records proposals; Phase 7 adds approve, edit, reject, and the prompt read path.
 */
export class MemoryStore {
  readonly #db: Db;
  readonly #now: () => Date;

  constructor(db: Db, options: { now?: () => Date } = {}) {
    this.#db = db;
    this.#now = options.now ?? (() => new Date());
  }

  propose(input: {
    agentId: string;
    scope: MemoryScope;
    text: string;
    sourceRunId?: string;
  }): MemoryRecord {
    const row = {
      id: randomUUID(),
      agent_id: input.agentId,
      scope: input.scope,
      text: input.text,
      status: "proposed",
      source_run_id: input.sourceRunId ?? null,
      created_at: this.#now().toISOString(),
    };
    this.#db
      .prepare(
        "insert into memories (id, agent_id, scope, text, status, source_run_id, created_at) values (@id, @agent_id, @scope, @text, @status, @source_run_id, @created_at)",
      )
      .run(row);
    return toMemory({ ...row, decided_at: null });
  }

  get(id: string): MemoryRecord | undefined {
    const row = this.#db.prepare("select * from memories where id = ?").get(id) as Row | undefined;
    return row ? toMemory(row) : undefined;
  }

  decide(id: string, status: "approved" | "rejected", text?: string): MemoryRecord {
    this.#db
      .prepare(
        "update memories set status = ?, text = coalesce(?, text), decided_at = ? where id = ?",
      )
      .run(status, text ?? null, this.#now().toISOString(), id);
    return this.get(id) as MemoryRecord;
  }

  setText(id: string, text: string): MemoryRecord {
    this.#db.prepare("update memories set text = ? where id = ?").run(text, id);
    return this.get(id) as MemoryRecord;
  }

  remove(id: string): void {
    this.#db.prepare("delete from memories where id = ?").run(id);
  }

  /** Approved beliefs for an agent: its own plus every station-wide one, newest decision first. */
  beliefsFor(agentId: string): MemoryRecord[] {
    return (
      this.#db
        .prepare(
          "select * from memories where status = 'approved' and (agent_id = ? or scope = 'station') order by decided_at desc, rowid desc",
        )
        .all(agentId) as Row[]
    ).map(toMemory);
  }

  /** An agent's memories, newest first. */
  list(agentId: string): MemoryRecord[] {
    return (
      this.#db
        .prepare("select * from memories where agent_id = ? order by created_at desc, rowid desc")
        .all(agentId) as Row[]
    ).map(toMemory);
  }
}
