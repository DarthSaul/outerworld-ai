import { term } from "@darthsaul/outerworld-ai-core";
import { type FormEvent, useId, useState } from "react";
import { Link } from "react-router";
import { ErrorNote } from "../components/ErrorNote.js";
import { formatWhen } from "../components/format.js";
import {
  type ScheduleFireItem,
  type ScheduleItem,
  useAddSchedule,
  useRemoveSchedule,
  useRunSchedule,
  useSchedules,
  useUpdateSchedule,
} from "../queries.js";

const button =
  "h-(--ow-size-control-h-dense) rounded-control border border-border-subtle px-(--ow-size-control-pad-x) text-label text-ink-1 disabled:text-ink-3";
const input =
  "h-(--ow-size-control-h-dense) min-w-0 rounded-control border border-border-subtle bg-surface-raised px-(--ow-space-2) font-mono text-mono text-ink-1";
const textarea =
  "min-h-(--ow-size-control-h) w-full rounded-control border border-border-subtle bg-surface-raised p-(--ow-space-2) text-body text-ink-1";
const label = "flex flex-col gap-(--ow-space-1) text-label text-ink-2";

interface Draft {
  cron: string;
  timezone: string;
  prompt: string;
  catchUp: boolean;
}

/** Add or edit. An empty zone means the machine's: omitted on add, `null` when clearing one. */
function ScheduleForm({
  title,
  initial,
  pending,
  error,
  onSave,
  onCancel,
}: {
  readonly title: string;
  readonly initial: Draft;
  readonly pending: boolean;
  readonly error: Error | null;
  readonly onSave: (draft: Draft) => void;
  readonly onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const hint = useId();
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave({ ...draft, cron: draft.cron.trim(), timezone: draft.timezone.trim() });
  };
  return (
    <form aria-label={title} onSubmit={submit} className="flex flex-col gap-(--ow-space-2)">
      <div className="flex flex-wrap gap-(--ow-space-2)">
        <label className={label}>
          {term("schedule.cron")}
          <input
            className={input}
            value={draft.cron}
            required
            aria-describedby={`${hint}-cron`}
            onChange={(e) => set({ cron: e.target.value })}
          />
        </label>
        <label className={label}>
          {term("schedule.timezone")}
          <input
            className={input}
            value={draft.timezone}
            aria-describedby={`${hint}-zone`}
            onChange={(e) => set({ timezone: e.target.value })}
          />
        </label>
      </div>
      <p id={`${hint}-cron`} className="text-label text-ink-2">
        {term("schedule.cron.hint")}
      </p>
      <p id={`${hint}-zone`} className="text-label text-ink-2">
        {term("schedule.timezone.hint")}
      </p>
      <label className={label}>
        {term("schedule.prompt")}
        <textarea
          className={textarea}
          value={draft.prompt}
          required
          onChange={(e) => set({ prompt: e.target.value })}
        />
      </label>
      <label className="flex items-center gap-(--ow-space-2) text-label text-ink-1">
        <input
          type="checkbox"
          checked={draft.catchUp}
          onChange={(e) => set({ catchUp: e.target.checked })}
        />
        {term("schedule.catchUp")}
      </label>
      <div className="flex flex-wrap gap-(--ow-space-2)">
        <button type="submit" className={button} disabled={pending}>
          {term("schedule.save")}
        </button>
        <button type="button" className={button} onClick={onCancel}>
          {term("schedule.cancel")}
        </button>
      </div>
      <ErrorNote error={error} />
    </form>
  );
}

function FireLine({ fire }: { readonly fire: ScheduleFireItem }) {
  const what =
    fire.outcome === "fired"
      ? `${term(fire.manual ? "schedule.manual" : "schedule.fired")}${fire.runState ? ` · ${fire.runState}` : ""}`
      : `${term("schedule.missed")}: ${fire.reason ? term(`schedule.missed.${fire.reason}`) : ""}`;
  return (
    <li data-outcome={fire.outcome} className="font-mono text-mono text-ink-2">
      {formatWhen(fire.scheduledFor)} · {what}
      {fire.detail && fire.reason === "error" ? ` (${fire.detail})` : ""}
    </li>
  );
}

function ScheduleCard({
  agentId,
  schedule,
}: {
  readonly agentId: string;
  readonly schedule: ScheduleItem;
}) {
  const update = useUpdateSchedule(agentId);
  const remove = useRemoveSchedule(agentId);
  const run = useRunSchedule(agentId);
  const [editing, setEditing] = useState(false);
  const titleId = `schedule-${schedule.id}`;
  const sessionId = schedule.sessionId ?? schedule.history.find((h) => h.sessionId)?.sessionId;

  return (
    <section
      aria-labelledby={titleId}
      data-schedule={schedule.id}
      className="flex flex-col gap-(--ow-space-2) rounded-panel border border-border-subtle p-(--ow-space-3)"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-(--ow-space-2)">
        <h3 id={titleId} className="font-mono text-mono text-ink-1">
          {schedule.id}
        </h3>
        <label className="flex items-center gap-(--ow-space-2) text-label text-ink-1">
          <input
            type="checkbox"
            checked={schedule.enabled}
            disabled={update.isPending}
            onChange={(e) =>
              update.mutate({ id: schedule.id, input: { enabled: e.target.checked } })
            }
          />
          {term("schedule.enabled")}
        </label>
      </header>
      {editing ? (
        <ScheduleForm
          title={term("schedule.edit")}
          initial={{
            cron: schedule.cron,
            timezone: schedule.timezoneSet ? schedule.timezone : "",
            prompt: schedule.prompt,
            catchUp: schedule.catchUp,
          }}
          pending={update.isPending}
          error={update.error}
          onCancel={() => setEditing(false)}
          onSave={(d) =>
            update.mutate(
              {
                id: schedule.id,
                input: {
                  cron: d.cron,
                  prompt: d.prompt,
                  catchUp: d.catchUp,
                  ...(d.timezone
                    ? { timezone: d.timezone }
                    : schedule.timezoneSet
                      ? { timezone: null }
                      : {}),
                },
              },
              { onSuccess: () => setEditing(false) },
            )
          }
        />
      ) : (
        <>
          <p className="font-mono text-mono text-ink-1">{schedule.cron}</p>
          <p className="text-body text-ink-1">{schedule.prompt}</p>
          <p className="text-label text-ink-2">
            {schedule.error
              ? schedule.error
              : schedule.nextRunAt
                ? `${term("schedule.next")}: ${formatWhen(schedule.nextRunAt, schedule.timezone)} (${schedule.timezone})`
                : term("schedule.off")}
          </p>
          <div className="flex flex-wrap gap-(--ow-space-2)">
            <button
              type="button"
              className={button}
              disabled={run.isPending}
              onClick={() => run.mutate(schedule.id)}
            >
              {term("schedule.runNow")}
            </button>
            <button type="button" className={button} onClick={() => setEditing(true)}>
              {term("schedule.edit")}
            </button>
            <button
              type="button"
              className={button}
              disabled={remove.isPending}
              onClick={() => remove.mutate(schedule.id)}
            >
              {term("schedule.remove")}
            </button>
            {sessionId ? (
              <Link
                className="self-center text-label text-ink-1 underline"
                to={`/comms?agent=${encodeURIComponent(agentId)}&open=${encodeURIComponent(sessionId)}`}
              >
                {term("schedule.session")}
              </Link>
            ) : null}
          </div>
          <ErrorNote error={update.error ?? run.error ?? remove.error} />
        </>
      )}
      {schedule.history.length > 0 ? (
        <div className="flex flex-col gap-(--ow-space-1)">
          <h4 className="font-mono text-eyebrow uppercase text-ink-3">
            {term("schedule.history")}
          </h4>
          <ul className="flex flex-col gap-(--ow-space-1)">
            {schedule.history.map((f) => (
              <FireLine key={`${f.at}-${f.scheduledFor}`} fire={f} />
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/** A crew member's schedules (brief §13): what runs when, next run, recent fires, and editing. */
export function SchedulesSection({ agentId }: { readonly agentId: string }) {
  const schedules = useSchedules(agentId);
  const add = useAddSchedule(agentId);
  const [adding, setAdding] = useState(false);
  const list = schedules.data ?? [];
  return (
    <section aria-labelledby="schedules-title" className="flex flex-col gap-(--ow-space-2)">
      <h2 id="schedules-title" className="font-mono text-eyebrow uppercase text-ink-3">
        {term("schedules")}
      </h2>
      <p className="text-label text-ink-2">{term("schedule.hint")}</p>
      <ErrorNote error={schedules.error} />
      {schedules.isSuccess && list.length === 0 ? (
        <p className="text-body text-ink-2">{term("schedule.none")}</p>
      ) : null}
      {list.map((s) => (
        <ScheduleCard key={s.id} agentId={agentId} schedule={s} />
      ))}
      {adding ? (
        <ScheduleForm
          title={term("schedule.add")}
          initial={{ cron: "", timezone: "", prompt: "", catchUp: false }}
          pending={add.isPending}
          error={add.error}
          onCancel={() => setAdding(false)}
          onSave={(d) =>
            add.mutate(
              {
                cron: d.cron,
                prompt: d.prompt,
                catchUp: d.catchUp,
                ...(d.timezone ? { timezone: d.timezone } : {}),
              },
              { onSuccess: () => setAdding(false) },
            )
          }
        />
      ) : (
        <button type="button" className={`${button} self-start`} onClick={() => setAdding(true)}>
          {term("schedule.add")}
        </button>
      )}
    </section>
  );
}
