import { randomUUID } from "node:crypto";
import { ConflictError, NotFoundError } from "../crew/crew-service.js";
import type { Db } from "../storage/database.js";

export type ConsentStatus = "pending" | "approved" | "denied" | "expired";

export interface ConsentRecord {
  readonly id: string;
  readonly runId: string;
  readonly sessionId: string;
  readonly agentId: string;
  readonly toolCallId: string;
  readonly tool: string;
  readonly input: unknown;
  readonly status: ConsentStatus;
  readonly createdAt: string;
  readonly decidedAt?: string;
}

type Row = Record<string, string | null>;

const toConsent = (r: Row): ConsentRecord => ({
  id: String(r.id),
  runId: String(r.run_id),
  sessionId: String(r.session_id),
  agentId: String(r.agent_id),
  toolCallId: String(r.tool_call_id),
  tool: String(r.tool),
  input: JSON.parse(String(r.input)),
  status: r.status as ConsentStatus,
  createdAt: String(r.created_at),
  ...(r.decided_at !== null ? { decidedAt: String(r.decided_at) } : {}),
});

/**
 * Consent requests (brief §6): a write-class call under *Ask first* waits here until the
 * Commander decides. A request never times out into approval; it is only ever approved, denied,
 * or expired (its run was cancelled or the daemon restarted).
 */
export class ConsentStore {
  readonly #db: Db;
  readonly #now: () => Date;

  constructor(db: Db, options: { now?: () => Date } = {}) {
    this.#db = db;
    this.#now = options.now ?? (() => new Date());
  }

  create(input: {
    runId: string;
    sessionId: string;
    agentId: string;
    toolCallId: string;
    tool: string;
    input: unknown;
  }): ConsentRecord {
    const row = {
      id: randomUUID(),
      run_id: input.runId,
      session_id: input.sessionId,
      agent_id: input.agentId,
      tool_call_id: input.toolCallId,
      tool: input.tool,
      input: JSON.stringify(input.input ?? null),
      status: "pending",
      created_at: this.#now().toISOString(),
    };
    this.#db
      .prepare(
        "insert into consents (id, run_id, session_id, agent_id, tool_call_id, tool, input, status, created_at) values (@id, @run_id, @session_id, @agent_id, @tool_call_id, @tool, @input, @status, @created_at)",
      )
      .run(row);
    return toConsent({ ...row, decided_at: null });
  }

  get(id: string): ConsentRecord | undefined {
    const row = this.#db.prepare("select * from consents where id = ?").get(id) as Row | undefined;
    return row ? toConsent(row) : undefined;
  }

  pending(): ConsentRecord[] {
    return (
      this.#db
        .prepare("select * from consents where status = 'pending' order by created_at, rowid")
        .all() as Row[]
    ).map(toConsent);
  }

  /** Approves or denies a pending request; anything else is a conflict. */
  decide(id: string, decision: "approved" | "denied"): ConsentRecord {
    const current = this.get(id);
    if (!current) throw new NotFoundError(`no consent "${id}"`);
    if (current.status !== "pending")
      throw new ConflictError(`consent is already ${current.status}`);
    this.#db
      .prepare("update consents set status = ?, decided_at = ? where id = ? and status = 'pending'")
      .run(decision, this.#now().toISOString(), id);
    return this.get(id) as ConsentRecord;
  }

  expireForRun(runId: string): ConsentRecord[] {
    return this.#expire("select id from consents where status = 'pending' and run_id = ?", runId);
  }

  expireAll(): ConsentRecord[] {
    return this.#expire("select id from consents where status = 'pending'");
  }

  #expire(sql: string, ...args: string[]): ConsentRecord[] {
    const ids = (this.#db.prepare(sql).all(...args) as Row[]).map((r) => String(r.id));
    const at = this.#now().toISOString();
    for (const id of ids) {
      this.#db
        .prepare("update consents set status = 'expired', decided_at = ? where id = ?")
        .run(at, id);
    }
    return ids.map((id) => this.get(id) as ConsentRecord);
  }
}
