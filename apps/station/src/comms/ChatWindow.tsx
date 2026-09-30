import {
  type ChatMessage,
  isTerminal,
  type RuntimeEvent,
  term,
} from "@darthsaul/outerworld-ai-core";
import { EmptyState } from "@darthsaul/outerworld-ai-ui";
import { type FormEvent, useEffect, useState } from "react";
import { ErrorNote } from "../components/ErrorNote.js";
import { formatUsd } from "../components/format.js";
import { useDaemon } from "../daemon-context.js";
import {
  type DispatchRecord,
  useCancelRun,
  useConsents,
  useSendMessage,
  useSession,
  useStationView,
  useSteer,
  useUpdateSession,
} from "../queries.js";
import { ConsentCard } from "./ConsentCard.js";

const button =
  "h-(--ow-size-control-h-dense) rounded-control border border-border-subtle px-(--ow-size-control-pad-x) text-label text-ink-1 disabled:text-ink-3";

/**
 * Text streamed for each run in this session, from ephemeral `run.delta` events. It is only a
 * preview: once the run ends, the stored transcript (refetched on the run event) replaces it.
 */
function useStreamingText(sessionId: string): Readonly<Record<string, string>> {
  const { subscribe } = useDaemon();
  const [streams, setStreams] = useState<Record<string, string>>({});
  useEffect(
    () =>
      subscribe((e: RuntimeEvent) => {
        if (e.sessionId !== sessionId || !e.runId) return;
        const runId = e.runId;
        if (e.type === "run.delta" && e.ephemeral) {
          setStreams((s) => ({ ...s, [runId]: (s[runId] ?? "") + e.payload.text }));
        } else if (
          e.type === "run.completed" ||
          e.type === "run.failed" ||
          e.type === "run.cancelled" ||
          e.type === "run.interrupted"
        ) {
          setStreams(({ [runId]: _done, ...rest }) => rest);
        }
      }),
    [subscribe, sessionId],
  );
  return streams;
}

/**
 * A dispatch made from this session (brief §7): who, what, and its live status. Watch opens the
 * worker's own session inline, live, where the Commander can also steer or cancel it.
 */
function DispatchCard({
  dispatch,
  workerName,
}: {
  readonly dispatch: DispatchRecord;
  readonly workerName: string;
}) {
  const [open, setOpen] = useState(false);
  const labelId = `dispatch-${dispatch.id}`;
  return (
    <li
      aria-labelledby={labelId}
      data-dispatch={dispatch.id}
      data-dispatch-status={dispatch.status}
      className="flex flex-col gap-(--ow-space-2) rounded-panel border border-border-subtle p-(--ow-space-3)"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-(--ow-space-2)">
        <p id={labelId} className="text-label text-ink-1">
          {term("dispatch.to")} {workerName}: {dispatch.task}
        </p>
        <div className="flex items-center gap-(--ow-space-2)">
          <span className="font-mono text-mono text-ink-2">
            {term(`dispatchStatus.${dispatch.status}`)}
          </span>
          <button
            type="button"
            className={button}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? term("dispatch.hide") : term("dispatch.watch")}
          </button>
        </div>
      </div>
      {open ? <ChatWindow sessionId={dispatch.workerSessionId} embedded /> : null}
    </li>
  );
}

function Message({
  message,
  agentName,
  nameOf,
  dispatches,
  fromOverseer = false,
}: {
  readonly message: ChatMessage;
  readonly agentName: string;
  readonly nameOf: (agentId: string) => string;
  readonly dispatches: readonly DispatchRecord[];
  /** The message opened a dispatched run: the task came from the Overseer, not the Commander. */
  readonly fromOverseer?: boolean;
}) {
  if (message.role === "tool") {
    const dispatchId = (message.output as { dispatchId?: unknown } | null)?.dispatchId;
    const dispatch = dispatches.find((d) => d.id === dispatchId);
    if (message.name === "dispatch" && dispatch) {
      return <DispatchCard dispatch={dispatch} workerName={nameOf(dispatch.workerAgentId)} />;
    }
    const outcome = message.isError ? term("comms.tool.error") : term("comms.tool.call");
    return (
      <li data-message="tool" className="font-mono text-mono text-ink-2">
        {message.name} {outcome}
        {message.isError ? `: ${String(message.output)}` : ""}
      </li>
    );
  }
  if (message.role === "report") {
    return (
      <li
        data-message="report"
        data-report-status={message.status}
        className="flex flex-col gap-(--ow-space-1) rounded-panel border border-border-subtle p-(--ow-space-3)"
      >
        <span className="font-mono text-eyebrow uppercase text-ink-3">
          {term("report.from")} {nameOf(message.from)} · {term(`dispatchStatus.${message.status}`)}
        </span>
        <p className="whitespace-pre-wrap text-body text-ink-1">{message.text}</p>
      </li>
    );
  }
  const who =
    message.role === "user"
      ? fromOverseer
        ? term("overseer.role")
        : term("user")
      : message.text
        ? agentName
        : undefined;
  return (
    <li data-message={message.role} className="flex flex-col gap-(--ow-space-1)">
      {who ? <span className="font-mono text-eyebrow uppercase text-ink-3">{who}</span> : null}
      {message.text ? (
        <p className="whitespace-pre-wrap text-body text-ink-1">{message.text}</p>
      ) : null}
      {message.role === "assistant" && message.toolCalls?.length ? (
        <p className="font-mono text-mono text-ink-2">
          → {message.toolCalls.map((c) => c.name).join(", ")}
        </p>
      ) : null}
    </li>
  );
}

/**
 * One session: transcript, live reply, run state, cancel, and the message box. While a run is
 * working, the box sends a direction to it instead (steer). `embedded` is a worker's session
 * shown inside a dispatch card: no close or archive.
 */
export function ChatWindow({
  sessionId,
  onClose,
  embedded = false,
}: {
  readonly sessionId: string;
  readonly onClose?: () => void;
  readonly embedded?: boolean;
}) {
  const detail = useSession(sessionId);
  const station = useStationView();
  const consents = useConsents();
  const send = useSendMessage(sessionId);
  const cancel = useCancelRun();
  const update = useUpdateSession(sessionId);
  const steer = useSteer();
  const streams = useStreamingText(sessionId);
  const [text, setText] = useState("");

  if (detail.isPending) return <p className="text-body text-ink-2">Loading…</p>;
  if (detail.error) return <ErrorNote error={detail.error} />;
  const { session, messages, runs } = detail.data;
  const nameOf = (id: string) => station.data?.agents.find((a) => a.id === id)?.config.name ?? id;
  const agentName = nameOf(session.agentId);
  const latest = runs[0];
  const active = latest !== undefined && !isTerminal(latest.state);
  const live = latest ? streams[latest.id] : undefined;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    if (active && latest)
      steer.mutate({ runId: latest.id, text }, { onSuccess: () => setText("") });
    else send.mutate(text, { onSuccess: () => setText("") });
  };
  const titleId = `chat-${sessionId}`;

  return (
    <section
      aria-labelledby={titleId}
      data-session={sessionId}
      className="flex min-w-0 flex-1 flex-col gap-(--ow-space-3) rounded-panel border border-border-subtle p-(--ow-space-3)"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-(--ow-space-2)">
        <h2 id={titleId} className={embedded ? "text-label text-ink-1" : "text-heading text-ink-1"}>
          {agentName} · {session.title}
        </h2>
        {onClose && !embedded ? (
          <div className="flex gap-(--ow-space-2)">
            <button
              type="button"
              className={button}
              disabled={active}
              onClick={() => update.mutate({ archived: true }, { onSuccess: () => onClose?.() })}
            >
              {term("comms.archive")}
            </button>
            <button type="button" className={button} onClick={onClose}>
              {term("comms.close")}
            </button>
          </div>
        ) : null}
      </header>
      {messages.length === 0 && !live ? (
        <EmptyState title={term("comms.empty.title")} body={term("comms.empty.body")} />
      ) : (
        <ol aria-label="Transcript" className="flex flex-col gap-(--ow-space-3)">
          {messages.map((m) => (
            <Message
              key={m.id}
              message={m.message}
              agentName={agentName}
              nameOf={nameOf}
              dispatches={detail.data.dispatches}
              fromOverseer={
                m.message.role === "user" &&
                !m.message.text.startsWith("[Direction") &&
                runs.find((r) => r.id === m.runId)?.trigger === "dispatch"
              }
            />
          ))}
          {live ? (
            <li data-message="streaming" className="whitespace-pre-wrap text-body text-ink-1">
              {live}
            </li>
          ) : null}
        </ol>
      )}
      {consents.data
        ?.filter((c) => c.sessionId === sessionId)
        .map((c) => (
          <ConsentCard key={c.id} consent={c} agentName={agentName} />
        ))}
      {latest ? (
        <p className="flex flex-wrap items-center gap-(--ow-space-2) font-mono text-mono text-ink-2">
          <span role="status" aria-label="Run" data-run-state={latest.state}>
            {term(`runState.${latest.state}`)}
          </span>
          {latest.error ? <span>· {latest.error}</span> : null}
          <span data-session-spend>
            · {term("spend.session")} {formatUsd(detail.data.spend.costUsd)}
            {detail.data.spend.unpriced > 0 ? ` (${term("spend.unpriced")})` : ""}
          </span>
          {active ? (
            <button
              type="button"
              className={button}
              disabled={cancel.isPending}
              onClick={() => cancel.mutate(latest.id)}
            >
              {term("comms.cancel")}
            </button>
          ) : null}
        </p>
      ) : null}
      <form
        onSubmit={submit}
        className="flex items-end gap-(--ow-space-2)"
        aria-label={`Message ${agentName}`}
      >
        <label className="sr-only" htmlFor={`${titleId}-input`}>
          {term("comms.placeholder")}
        </label>
        <textarea
          id={`${titleId}-input`}
          rows={3}
          className="min-w-0 flex-1 rounded-control border border-border-subtle bg-surface-raised p-(--ow-space-2) text-body text-ink-1"
          placeholder={term("comms.placeholder")}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) submit(e);
          }}
        />
        <button
          type="submit"
          className={button}
          disabled={send.isPending || steer.isPending || !text.trim()}
        >
          {active ? term("comms.direct") : term("comms.send")}
        </button>
      </form>
      {active ? <p className="text-caption text-ink-2">{term("comms.direct.hint")}</p> : null}
      <ErrorNote error={send.error ?? steer.error ?? cancel.error ?? update.error} />
    </section>
  );
}
