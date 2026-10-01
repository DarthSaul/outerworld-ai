import type { Db } from "../storage/database.js";

const KEY = "kill_switch";

/**
 * The global kill switch (brief §11), persisted before it acts so a restart cannot quietly
 * resume work. The RunService consults it before starting anything.
 */
export class KillSwitch {
  readonly #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  engaged(): boolean {
    const row = this.#db.prepare("select value from station_state where key = ?").get(KEY) as
      | { value: string }
      | undefined;
    return row?.value === "on";
  }

  set(on: boolean): void {
    this.#db
      .prepare(
        "insert into station_state (key, value, updated_at) values (?, ?, ?) on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at",
      )
      .run(KEY, on ? "on" : "off", new Date().toISOString());
  }
}
