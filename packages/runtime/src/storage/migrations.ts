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
  {
    version: 2,
    name: "sessions, runs, messages",
    sql: `
      create table sessions (
        id text primary key,
        agent_id text not null,
        title text not null,
        created_at text not null,
        archived_at text
      );
      create index sessions_agent on sessions (agent_id, created_at);
      create table runs (
        id text primary key,
        session_id text not null references sessions (id),
        agent_id text not null,
        state text not null,
        trigger text not null,
        model text not null,
        created_at text not null,
        started_at text,
        ended_at text,
        error text,
        steps integer not null default 0
      );
      create index runs_state on runs (state);
      create index runs_session on runs (session_id, created_at);
      create table messages (
        id text primary key,
        session_id text not null references sessions (id),
        run_id text references runs (id),
        position integer not null,
        message text not null,
        created_at text not null,
        unique (session_id, position)
      );
    `,
  },
];
