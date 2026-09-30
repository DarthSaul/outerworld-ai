/**
 * Plain SQL migrations, applied in order and recorded in `schema_migrations`. Never edit a
 * shipped migration; add the next one. Kept in TypeScript so `tsc` ships them in `dist/`.
 */
export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "event log",
    sql: `
      create table events (
        seq integer primary key autoincrement,
        type text not null,
        at text not null,
        agent_id text,
        session_id text,
        run_id text,
        payload text not null
      );
      create index events_run on events (run_id, seq);
      create index events_session on events (session_id, seq);
      create trigger events_no_update before update on events
        begin select raise(abort, 'events are append-only'); end;
      create trigger events_no_delete before delete on events
        begin select raise(abort, 'events are append-only'); end;
    `,
  },
];
