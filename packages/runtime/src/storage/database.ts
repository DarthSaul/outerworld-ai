import Database from "better-sqlite3";
import { MIGRATIONS, type Migration } from "./migrations.js";

export type Db = Database.Database;

/**
 * Opens (or creates) the station database, turns on WAL and foreign keys, and applies any
 * migration not yet recorded, each in its own transaction. `":memory:"` is for tests.
 */
export function openDatabase(path: string, migrations: readonly Migration[] = MIGRATIONS): Db {
  const db = new Database(path);
  if (path !== ":memory:") db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(
    "create table if not exists schema_migrations (version integer primary key, name text not null, applied_at text not null)",
  );
  const applied = new Set(
    db
      .prepare("select version from schema_migrations")
      .all()
      .map((row) => (row as { version: number }).version),
  );
  const record = db.prepare(
    "insert into schema_migrations (version, name, applied_at) values (?, ?, ?)",
  );
  for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
    if (applied.has(m.version)) continue;
    db.transaction(() => {
      db.exec(m.sql);
      record.run(m.version, m.name, new Date().toISOString());
    })();
  }
  return db;
}
