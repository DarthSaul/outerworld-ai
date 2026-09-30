import {
  type ChatMessage,
  isTerminal,
  type RuntimeEvent,
  term,
} from "@darthsaul/outerworld-ai-core";
import { EmptyState } from "@darthsaul/outerworld-ai-ui";
import { type FormEvent, useEffect, useState } from "react";
import { ErrorNote } from "../components/ErrorNote.js";
import { useDaemon } from "../daemon-context.js";
import {
  useCancelRun,
  useSendMessage,
  useSession,
  useStationView,
  useUpdateSession,
} from "../queries.js";

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

function Message({
  message,
  agentName,
}: {
  readonly message: ChatMessage;
  readonly agentName: string;
}) {
  if (message.role === "tool") {
    const outcome = message.isError ? term("comms.tool.error") : term("comms.tool.call");
    return (
      <li data-message="tool" className="font-mono text-mono text-ink-2">
        {message.name} {outcome}
        {message.isError ? `: ${String(message.output)}` : ""}
      </li>
    );
  }
  const who = message.role === "user" ? term("user") : message.text ? agentName : undefined;
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

/** One session: transcript, live reply, run state, cancel, and the message box. */
export function ChatWindow({
  sessionId,
  onClose,
}: {
  readonly sessionId: string;
  readonly onClose: () => void;
}) {
  const detail = useSession(sessionId);
  const station = useStationView();
  const send = useSendMessage(sessionId);
  const cancel = useCancelRun();
  const update = useUpdateSession(sessionId);
  const streams = useStreamingText(sessionId);
  const [text, setText] = useState("");

  if (detail.isPending) return <p className="text-body text-ink-2">Loading…</p>;
  if (detail.error) return <ErrorNote error={detail.error} />;
  const { session, messages, runs } = detail.data;
  const agentName =
    station.data?.agents.find((a) => a.id === session.agentId)?.config.name ?? session.agentId;
  const latest = runs[0];
  const active = latest !== undefined && !isTerminal(latest.state);
  const live = latest ? streams[latest.id] : undefined;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    send.mutate(text, { onSuccess: () => setText("") });
  };
  const titleId = `chat-${sessionId}`;

  return (
    <section
      aria-labelledby={titleId}
      data-session={sessionId}
      className="flex min-w-0 flex-1 flex-col gap-(--ow-space-3) rounded-panel border border-border-subtle p-(--ow-space-3)"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-(--ow-space-2)">
        <h2 id={titleId} className="text-heading text-ink-1">
          {agentName} · {session.title}
        </h2>
        <div className="flex gap-(--ow-space-2)">
          <button
            type="button"
            className={button}
            disabled={active}
            onClick={() => update.mutate({ archived: true }, { onSuccess: onClose })}
          >
            {term("comms.archive")}
          </button>
          <button type="button" className={button} onClick={onClose}>
            {term("comms.close")}
          </button>
        </div>
      </header>
      {messages.length === 0 && !live ? (
        <EmptyState title={term("comms.empty.title")} body={term("comms.empty.body")} />
      ) : (
        <ol aria-label="Transcript" className="flex flex-col gap-(--ow-space-3)">
          {messages.map((m) => (
            <Message key={m.id} message={m.message} agentName={agentName} />
          ))}
          {live ? (
            <li data-message="streaming" className="whitespace-pre-wrap text-body text-ink-1">
              {live}
            </li>
          ) : null}
        </ol>
      )}
      {latest ? (
        <p className="flex flex-wrap items-center gap-(--ow-space-2) font-mono text-mono text-ink-2">
          <span role="status" aria-label="Run" data-run-state={latest.state}>
            {term(`runState.${latest.state}`)}
          </span>
          {latest.error ? <span>· {latest.error}</span> : null}
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
            if (e.key === "Enter" && !e.shiftKey && !active) submit(e);
          }}
        />
        <button
          type="submit"
          className={button}
          disabled={active || send.isPending || !text.trim()}
        >
          {term("comms.send")}
        </button>
      </form>
      <ErrorNote error={send.error ?? cancel.error ?? update.error} />
    </section>
  );
}
