import {
  type ChatMessage,
  findModel,
  isTerminal,
  type RuntimeEvent,
  term,
} from "@darthsaul/outerworld-ai-core";
import { EmptyState, OutlineButton } from "@darthsaul/outerworld-ai-ui";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { ErrorNote } from "../components/ErrorNote.js";
import { formatUsd } from "../components/format.js";
import { Markdown } from "../components/Markdown.js";
import { ModelPicker } from "../components/ModelPicker.js";
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
      className="flex flex-col gap-2 border border-line-faint bg-well-2 px-2 py-1.5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p id={labelId} className="m-0 text-b17 text-fg">
          <span className="font-display text-cyan text-d7 uppercase">{term("dispatch.to")}</span>{" "}
          {workerName}: {dispatch.task}
        </p>
        <div className="flex items-center gap-2">
          <span className="font-display text-d7 text-fg-mute uppercase">
            {term(`dispatchStatus.${dispatch.status}`)}
          </span>
          <OutlineButton tone="line" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? term("dispatch.hide") : term("dispatch.watch")}
          </OutlineButton>
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
      <li data-message="tool" className="text-b15 text-fg-mute">
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
        className="flex flex-col gap-1 border border-dashed border-cyan bg-well-2 px-2 py-1.5"
      >
        <span className="font-display text-cyan text-d7 uppercase">
          {term("report.from")} {nameOf(message.from)} · {term(`dispatchStatus.${message.status}`)}
        </span>
        <Markdown text={message.text} className="text-b19 text-fg-hi" />
      </li>
    );
  }
  // The Commander's own messages sit on the right; everything the crew does stays on the left.
  const mine = message.role === "user" && !fromOverseer;
  const who =
    message.role === "user"
      ? fromOverseer
        ? term("overseer.role")
        : term("user")
      : message.text
        ? agentName
        : undefined;
  return (
    <li
      data-message={message.role}
      data-side={mine ? "right" : "left"}
      className={`flex flex-col gap-1 ${mine ? "max-w-[85%] items-end self-end" : "self-stretch"}`}
    >
      {who ? (
        <span
          className={`font-display text-d8 uppercase ${message.role === "user" ? "text-green" : "text-amber"}`}
        >
          {who}
        </span>
      ) : null}
      {message.text ? (
        mine ? (
          <p className="m-0 whitespace-pre-wrap border-2 border-line-faint bg-well-2 px-2 py-1.5 text-b19 text-fg-hi">
            {message.text}
          </p>
        ) : (
          <Markdown text={message.text} className="text-b19 text-fg-hi" />
        )
      ) : null}
      {message.role === "assistant" && message.toolCalls?.length ? (
        <p className="m-0 text-b15 text-fg-mute">
          → {message.toolCalls.map((c) => c.name).join(", ")}
        </p>
      ) : null}
    </li>
  );
}

/**
 * One session: transcript, live reply, run state, cancel, and the message box. While a run is
 * working, the box sends a direction to it instead (steer). `embedded` is a worker's session
 * shown inside a dispatch card: no close or archive. `fill` fits it to a panel of fixed height
 * (the Station's crew comms): no frame, the transcript scrolls and follows new lines. `onBack`
 * puts a back button before the title, focused when the chat opens.
 */
export function ChatWindow({
  sessionId,
  onClose,
  onBack,
  embedded = false,
  fill = false,
  headerAction,
}: {
  readonly sessionId: string;
  readonly onClose?: () => void;
  readonly onBack?: () => void;
  readonly embedded?: boolean;
  readonly fill?: boolean;
  /** A control at the end of the title strip (the Overseer's "Give a new order"). */
  readonly headerAction?: ReactNode;
}) {
  const detail = useSession(sessionId);
  const station = useStationView();
  const consents = useConsents();
  const send = useSendMessage(sessionId);
  const cancel = useCancelRun();
  const update = useUpdateSession(sessionId);
  const steer = useSteer();
  const streams = useStreamingText(sessionId);
  const client = useQueryClient();
  const [text, setText] = useState("");
  const section = useRef<HTMLElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const loaded = !detail.isPending;
  const lines = detail.data?.messages.length ?? 0;
  const streamed = Object.values(streams).join("").length;
  // Whether there is a way back, not the callback: a parent's new arrow each render must not
  // pull focus off the message box.
  const canGoBack = onBack !== undefined;

  // The back button takes focus once, when the chat has loaded, so the keyboard lands in the
  // chat; never again on a later render, which would pull focus out of the message box.
  const focusedBack = useRef(false);
  useEffect(() => {
    if (!canGoBack || !loaded || focusedBack.current) return;
    focusedBack.current = true;
    section.current?.querySelector<HTMLElement>("[data-back]")?.focus();
  }, [canGoBack, loaded]);

  // The transcript scrolls inside the window: keep the newest line in view as messages and the
  // reply arrive.
  useEffect(() => {
    const el = scroller.current;
    if (el && lines + streamed >= 0) el.scrollTop = el.scrollHeight;
  }, [lines, streamed]);

  if (detail.isPending || detail.error) {
    const note = detail.error ? (
      <ErrorNote error={detail.error} />
    ) : (
      <p className="m-0 text-b17 text-fg-mute">Loading…</p>
    );
    if (!onBack) return note;
    // In a panel, Back stays available while the chat loads or after it fails to.
    return (
      <section ref={section} className="flex min-h-0 min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex items-center gap-2 border-line-faint border-b-2 px-2.5 py-1.5">
          <OutlineButton tone="line" data-back onClick={onBack}>
            {term("comms.back")}
          </OutlineButton>
        </div>
        <div className="px-2.5">{note}</div>
      </section>
    );
  }
  const { session, messages, runs } = detail.data;
  const nameOf = (id: string) => station.data?.agents.find((a) => a.id === id)?.config.name ?? id;
  const agentName = nameOf(session.agentId);
  const agentModel = station.data?.agents.find((a) => a.id === session.agentId)?.config.model ?? "";
  const latest = runs[0];
  const active = latest !== undefined && !isTerminal(latest.state);
  const live = latest ? streams[latest.id] : undefined;

  const titleId = `chat-${sessionId}`;
  /** Empties the box, and in a panel shrinks it back to one line. */
  const clear = () => {
    setText("");
    const box = document.getElementById(`${titleId}-input`);
    if (box) box.style.height = "";
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    if (active && latest) steer.mutate({ runId: latest.id, text }, { onSuccess: clear });
    else send.mutate(text, { onSuccess: clear });
  };

  return (
    <section
      ref={section}
      aria-labelledby={titleId}
      data-session={sessionId}
      className={`flex min-w-0 flex-1 flex-col ${
        fill
          ? // A compact panel: no gaps (the strips' borders separate them), so the transcript fits.
            "min-h-0"
          : `gap-2.5 border-2 border-line bg-panel ${embedded ? "max-h-[50dvh]" : "max-h-[78dvh] shadow-panel desktop:max-h-none desktop:min-h-0"}`
      }`}
    >
      <header
        className={`flex flex-wrap items-center gap-2 border-line border-b-2 px-2.5 ${fill ? "border-line-faint py-1.5" : "justify-between bg-panel-head py-2"}`}
      >
        {onBack ? (
          <OutlineButton tone="line" data-back onClick={onBack}>
            {term("comms.back")}
          </OutlineButton>
        ) : null}
        <h2
          id={titleId}
          className={`m-0 font-display font-normal text-d9 text-panel-title uppercase tracking-st-1 ${fill ? "min-w-0 flex-1 truncate" : ""}`}
        >
          {agentName} · {session.title}
        </h2>
        {headerAction}
        {onClose && !embedded ? (
          <div className="flex gap-2">
            <OutlineButton
              tone="line"
              disabled={active}
              onClick={() => update.mutate({ archived: true }, { onSuccess: () => onClose?.() })}
            >
              {term("comms.archive")}
            </OutlineButton>
            <OutlineButton tone="line" onClick={onClose}>
              {term("comms.close")}
            </OutlineButton>
          </div>
        ) : null}
      </header>
      <div
        ref={scroller}
        data-transcript
        className={`flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto overscroll-y-contain px-2.5 ${fill ? "min-h-12 py-2" : ""}`}
      >
        {messages.length === 0 && !live ? (
          <EmptyState title={term("comms.empty.title")} body={term("comms.empty.body")} />
        ) : (
          <ol aria-label="Transcript" className="m-0 flex list-none flex-col gap-3 p-0">
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
              <li data-message="streaming" data-side="left" className="text-b19 text-fg-hi">
                <Markdown text={live} />
                <span
                  aria-hidden="true"
                  className="st-blink ml-0.5 inline-block h-3.75 w-2.25 bg-cyan align-[-2px]"
                />
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
          <p className="m-0 flex flex-wrap items-center gap-2 text-b15 text-fg-mute">
            <span role="status" aria-label="Run" data-run-state={latest.state}>
              {term(`runState.${latest.state}`)}
            </span>
            <span data-run-model={latest.model}>
              · {findModel(latest.model)?.label ?? latest.model}
              {latest.provider && latest.provider !== "auto"
                ? ` ${term("model.via")} ${term(`model.provider.${latest.provider}`)}`
                : ""}
              {latest.reasoning && latest.reasoning !== "default"
                ? ` · ${term("model.reasoning")} ${term(`model.reasoning.${latest.reasoning}`)}`
                : ""}
            </span>
            {latest.error ? <span>· {latest.error}</span> : null}
            <span data-session-spend>
              · {term("spend.session")} {formatUsd(detail.data.spend.costUsd)}
              {detail.data.spend.unpriced > 0 ? ` (${term("spend.unpriced")})` : ""}
            </span>
            {active ? (
              <OutlineButton
                tone="amber"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate(latest.id)}
              >
                {term("comms.cancel")}
              </OutlineButton>
            ) : null}
          </p>
        ) : null}
      </div>
      {/* The composer (a chat app's layout): the message box with Send inside it, then this
          conversation's model, reasoning, and key in a row beneath. */}
      <div
        className={`flex shrink-0 flex-col border-line-faint border-t-2 ${fill ? "gap-1 px-2.5 py-2" : "gap-1.5 p-2.5"}`}
      >
        <form
          onSubmit={submit}
          className={`flex border-2 border-line-soft bg-input-row px-2.5 focus-within:border-cyan ${
            // In a compact panel the box is one line with Send beside it, to leave the transcript room.
            fill ? "items-end gap-1.5 py-1.5" : "flex-col gap-1.5 py-2"
          }`}
          aria-label={`Message ${agentName}`}
        >
          <label className="sr-only" htmlFor={`${titleId}-input`}>
            {term("comms.placeholder")}
          </label>
          <textarea
            id={`${titleId}-input`}
            rows={fill ? 1 : 3}
            className={`min-w-0 border-none bg-transparent p-0 font-body text-b19 text-fg-hi outline-none ${fill ? "max-h-[3lh] flex-1 resize-none overflow-y-auto" : "resize-y"}`}
            placeholder={term("comms.placeholder")}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              // In a panel, the box grows with its text to three lines, then scrolls.
              if (fill) {
                e.target.style.height = "auto";
                e.target.style.height = `${e.target.scrollHeight}px`;
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) submit(e);
            }}
          />
          <div className={`flex items-center justify-between gap-2 ${fill ? "shrink-0" : ""}`}>
            <span
              className={`min-w-0 truncate text-b15 text-fg-mute ${active && !fill ? "" : fill ? "sr-only" : "invisible"}`}
            >
              {active ? term("comms.direct.hint") : ""}
            </span>
            <button
              type="submit"
              className="shrink-0 cursor-pointer border-none bg-green px-2.5 py-1.25 font-display text-d7 text-ink uppercase disabled:cursor-not-allowed disabled:opacity-50"
              disabled={send.isPending || steer.isPending || !text.trim()}
            >
              {active ? term("comms.direct") : term("comms.send")}
            </button>
          </div>
        </form>
        {embedded ? null : (
          <ModelPicker
            compact={fill}
            value={session.modelSettings}
            agentModel={agentModel}
            onChange={(modelSettings) =>
              update.mutate(
                { modelSettings },
                {
                  onSuccess: () =>
                    void client.invalidateQueries({ queryKey: ["session", sessionId] }),
                },
              )
            }
          />
        )}
        {active && !embedded ? <p className="sr-only">{term("model.applies")}</p> : null}
      </div>
      <ErrorNote error={send.error ?? steer.error ?? cancel.error ?? update.error} />
    </section>
  );
}
