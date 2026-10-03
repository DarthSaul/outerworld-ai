import { term } from "@darthsaul/outerworld-ai-core";
import { type FormEvent, useId, useMemo, useState } from "react";
import { Link } from "react-router";
import { ErrorNote } from "../components/ErrorNote.js";
import { formatWhen } from "../components/format.js";
import { previewCron } from "../lib/cron-preview.js";
import { zoneGroups, zoneLabel } from "../lib/time-zones.js";
import {
  type ScheduleFireItem,
  type ScheduleItem,
  useAddSchedule,
  useRemoveSchedule,
  useRunSchedule,
  useSchedules,
  useSettings,
  useUpdateSchedule,
} from "../queries.js";

const button =
  "cursor-pointer border-2 border-line bg-transparent px-2.5 py-1.5 font-display text-d7 text-panel-title uppercase hover:border-cyan disabled:cursor-not-allowed disabled:opacity-50";
const input = "min-w-0 border-2 border-line-soft bg-well px-2 py-1 font-body text-b19 text-fg-hi";
const textarea = "w-full border-2 border-line-soft bg-well p-2 font-body text-b19 text-fg-hi";
const label = "flex flex-col gap-1 font-display text-d7 text-fg-mute uppercase";

interface Draft {
  cron: string;
  timezone: string;
  prompt: string;
  catchUp: boolean;
}

/** Add or edit. An empty zone means the machine's: omitted on add, `null` when clearing one. */
/**
 * The zone picker: this computer's zone first (an empty value, so the schedule follows the
 * machine), then every zone grouped by region with its current offset.
 */
function ZonePicker({
  value,
  machineZone,
  onChange,
}: {
  readonly value: string;
  readonly machineZone: string;
  readonly onChange: (zone: string) => void;
}) {
  const groups = useMemo(() => zoneGroups(new Date(), value || undefined), [value]);
  return (
    <label className={label}>
      {term("schedule.timezone")}
      <select className={input} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">
          {term("schedule.timezone.machine")}: {zoneLabel(machineZone)}
        </option>
        {groups.map((g) => (
          <optgroup key={g.region} label={g.region}>
            {g.zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

/** What the cron means and when it runs next, as it is typed. */
function CronPreviewLine({
  id,
  cron,
  zone,
}: {
  readonly id: string;
  readonly cron: string;
  readonly zone: string;
}) {
  const preview = previewCron(cron, zone);
  return (
    <div id={id} aria-live="polite" className="flex flex-col gap-1.5">
      {preview === undefined ? (
        <p className="text-b17 text-fg-mute">{term("schedule.cron.hint")}</p>
      ) : preview.ok ? (
        <>
          <p className="m-0 text-b19 text-fg" data-cron-description>
            {preview.description}
          </p>
          <p className="text-b17 text-fg-mute">
            {term("schedule.preview.next")}:{" "}
            {preview.nextRuns.map((d) => formatWhen(d.toISOString(), zone)).join(" · ")}
          </p>
        </>
      ) : (
        <p className="text-b19 text-fg" data-cron-error>
          {term("schedule.preview.invalid")}: {preview.error}
        </p>
      )}
    </div>
  );
}

function ScheduleForm({
  title,
  machineZone,
  initial,
  pending,
  error,
  onSave,
  onCancel,
}: {
  readonly title: string;
  readonly machineZone: string;
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
    <form aria-label={title} onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
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
        <ZonePicker
          value={draft.timezone}
          machineZone={machineZone}
          onChange={(timezone) => set({ timezone })}
        />
      </div>
      <CronPreviewLine id={`${hint}-cron`} cron={draft.cron} zone={draft.timezone || machineZone} />
      <label className={label}>
        {term("schedule.prompt")}
        <textarea
          className={textarea}
          value={draft.prompt}
          required
          onChange={(e) => set({ prompt: e.target.value })}
        />
      </label>
      <label className="flex items-center gap-2 text-b19 text-fg">
        <input
          type="checkbox"
          checked={draft.catchUp}
          onChange={(e) => set({ catchUp: e.target.checked })}
        />
        {term("schedule.catchUp")}
      </label>
      <div className="flex flex-wrap gap-2">
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
    <li data-outcome={fire.outcome} className="text-b17 text-fg-mute">
      {formatWhen(fire.scheduledFor)} · {what}
      {fire.detail && fire.reason === "error" ? ` (${fire.detail})` : ""}
    </li>
  );
}

function ScheduleCard({
  agentId,
  schedule,
  machineZone,
}: {
  readonly agentId: string;
  readonly schedule: ScheduleItem;
  readonly machineZone: string;
}) {
  const preview = previewCron(schedule.cron, schedule.timezone);
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
      className="flex flex-col gap-2 border border-line-faint bg-well-2 p-2.5"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={titleId} className="m-0 font-display font-normal text-d8 text-fg-hi uppercase">
          {schedule.id}
        </h3>
        <label className="flex items-center gap-2 text-b19 text-fg">
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
          machineZone={machineZone}
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
          <p className="m-0 text-b19 text-fg">
            <span className="text-cyan">{schedule.cron}</span>
            {preview?.ok ? ` · ${preview.description}` : ""}
          </p>
          <p className="m-0 text-b19 text-fg">{schedule.prompt}</p>
          <p className="text-b17 text-fg-mute">
            {schedule.error
              ? schedule.error
              : schedule.nextRunAt
                ? `${term("schedule.next")}: ${formatWhen(schedule.nextRunAt, schedule.timezone)} (${schedule.timezone})`
                : term("schedule.off")}
          </p>
          <div className="flex flex-wrap gap-2">
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
                className="self-center font-display text-d7 uppercase"
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
        <div className="flex flex-col gap-1.5">
          <h4 className="m-0 font-display font-normal text-d7 text-fg-mute uppercase">
            {term("schedule.history")}
          </h4>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
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
  const settings = useSettings();
  const machineZone = settings.data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const add = useAddSchedule(agentId);
  const [adding, setAdding] = useState(false);
  const list = schedules.data ?? [];
  return (
    <section
      aria-labelledby="schedules-title"
      className="flex flex-col gap-2 border-2 border-line bg-panel p-3 shadow-panel"
    >
      <h2
        id="schedules-title"
        className="m-0 font-display font-normal text-d7 text-fg-mute uppercase"
      >
        {term("schedules")}
      </h2>
      <p className="text-b17 text-fg-mute">{term("schedule.hint")}</p>
      <ErrorNote error={schedules.error} />
      {schedules.isSuccess && list.length === 0 ? (
        <p className="m-0 text-b17 text-fg-mute">{term("schedule.none")}</p>
      ) : null}
      {list.map((s) => (
        <ScheduleCard key={s.id} agentId={agentId} schedule={s} machineZone={machineZone} />
      ))}
      {adding ? (
        <ScheduleForm
          title={term("schedule.add")}
          machineZone={machineZone}
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
