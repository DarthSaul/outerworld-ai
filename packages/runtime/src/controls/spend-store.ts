import { utcDay } from "@darthsaul/outerworld-ai-core";
import type { Db } from "../storage/database.js";

export interface SpendTotal {
  readonly costUsd: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly calls: number;
  /** Calls the provider reported no cost for (the fake model, or a provider without pricing). */
  readonly unpriced: number;
}

/**
 * Spend (brief §15): one row per model call with tokens and OpenRouter's reported cost in USD,
 * totalled per run, session, agent per UTC day, and station per UTC day.
 */
export class SpendStore {
  readonly #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  record(input: {
    runId: string;
    sessionId: string;
    agentId: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number | null;
    at: string;
  }): void {
    this.#db
      .prepare(
        "insert into spend (run_id, session_id, agent_id, model, input_tokens, output_tokens, cost_usd, day, at) values (@runId, @sessionId, @agentId, @model, @inputTokens, @outputTokens, @costUsd, @day, @at)",
      )
      .run({ ...input, day: utcDay(input.at) });
  }

  #total(where: string, ...args: string[]): SpendTotal {
    const r = this.#db
      .prepare(
        `select coalesce(sum(cost_usd), 0) as cost, coalesce(sum(input_tokens), 0) as input, coalesce(sum(output_tokens), 0) as output, count(*) as calls, coalesce(sum(case when cost_usd is null then 1 else 0 end), 0) as unpriced from spend where ${where}`,
      )
      .get(...args) as {
      cost: number;
      input: number;
      output: number;
      calls: number;
      unpriced: number;
    };
    return {
      costUsd: r.cost,
      inputTokens: r.input,
      outputTokens: r.output,
      calls: r.calls,
      unpriced: r.unpriced,
    };
  }

  forRun(runId: string): SpendTotal {
    return this.#total("run_id = ?", runId);
  }

  forSession(sessionId: string): SpendTotal {
    return this.#total("session_id = ?", sessionId);
  }

  agentDay(agentId: string, day: string): number {
    return this.#total("agent_id = ? and day = ?", agentId, day).costUsd;
  }

  stationDay(day: string): number {
    return this.#total("day = ?", day).costUsd;
  }

  /** Everything spent station-wide on one UTC day: cost, tokens, and calls. */
  stationDayTotal(day: string): SpendTotal {
    return this.#total("day = ?", day);
  }

  /** USD per agent for one UTC day. */
  byAgent(day: string): Record<string, number> {
    const rows = this.#db
      .prepare(
        "select agent_id, coalesce(sum(cost_usd), 0) as cost from spend where day = ? group by agent_id order by agent_id",
      )
      .all(day) as Array<{ agent_id: string; cost: number }>;
    return Object.fromEntries(rows.map((r) => [r.agent_id, r.cost]));
  }
}
