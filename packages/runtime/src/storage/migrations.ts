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
  {
    version: 3,
    name: "memories, consents, spend, station state",
    sql: `
      create table memories (
        id text primary key,
        agent_id text not null,
        scope text not null check (scope in ('agent', 'station')),
        text text not null,
        status text not null check (status in ('proposed', 'approved', 'rejected')),
        source_run_id text,
        created_at text not null,
        decided_at text
      );
      create index memories_agent on memories (agent_id, status, created_at);
      create table consents (
        id text primary key,
        run_id text not null references runs (id),
        session_id text not null,
        agent_id text not null,
        tool_call_id text not null,
        tool text not null,
        input text not null,
        status text not null check (status in ('pending', 'approved', 'denied', 'expired')),
        created_at text not null,
        decided_at text
      );
      create index consents_status on consents (status, created_at);
      create table spend (
        id integer primary key autoincrement,
        run_id text not null references runs (id),
        session_id text not null,
        agent_id text not null,
        model text not null,
        input_tokens integer not null,
        output_tokens integer not null,
        cost_usd real,
        day text not null,
        at text not null
      );
      create index spend_run on spend (run_id);
      create index spend_agent_day on spend (agent_id, day);
      create index spend_day on spend (day);
      create table station_state (
        key text primary key,
        value text not null,
        updated_at text not null
      );
    `,
  },
  {
    version: 4,
    name: "dispatches, run depth",
    sql: `
      alter table runs add column depth integer not null default 0;
      alter table runs add column dispatch_id text;
      create table dispatches (
        id text primary key,
        lead_agent_id text not null,
        lead_session_id text not null references sessions (id),
        lead_run_id text not null references runs (id),
        worker_agent_id text not null,
        worker_session_id text not null references sessions (id),
        worker_run_id text references runs (id),
        task text not null,
        inputs text,
        status text not null check (status in ('running', 'completed', 'failed', 'cancelled', 'blocked', 'interrupted')),
        summary text,
        created_at text not null,
        ended_at text
      );
      create index dispatches_lead on dispatches (lead_session_id, created_at);
      create index dispatches_status on dispatches (status);
    `,
  },
  {
    version: 5,
    name: "schedule state and history",
    sql: `
      create table schedule_state (
        agent_id text not null,
        schedule_id text not null,
        signature text not null,
        last_scheduled_for text not null,
        session_id text references sessions (id),
        primary key (agent_id, schedule_id)
      );
      create table schedule_fires (
        id integer primary key autoincrement,
        agent_id text not null,
        schedule_id text not null,
        scheduled_for text not null,
        at text not null,
        outcome text not null check (outcome in ('fired', 'missed')),
        reason text,
        detail text,
        manual integer not null default 0,
        session_id text references sessions (id),
        run_id text references runs (id)
      );
      create index schedule_fires_by_schedule on schedule_fires (agent_id, schedule_id, id);
    `,
  },
];
