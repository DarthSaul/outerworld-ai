import { term } from "@darthsaul/outerworld-ai-core";
import { type FormEvent, useEffect, useState } from "react";
import { STATION_MS } from "../tokens/tokens.js";
import { ChoiceButton, OutlineButton } from "./buttons.js";
import { Panel } from "./Panel.js";
import { Sprite } from "./Sprite.js";
import { useReducedMotion } from "./useClock.js";

/** What the Overseer is saying now. */
export interface CommsMessage {
  /** Changes when the message does, restarting the typewriter. */
  readonly key: string;
  readonly speaker: string;
  readonly text: string;
  /** An approval waits for A or B; a reply or chatter moves on by itself after a hold. */
  readonly kind: "approval" | "reply" | "chatter";
  /** A reply still streaming in: it never moves on by itself until the run ends. */
  readonly streaming?: boolean;
}

/**
 * Types `text` one character per tick, restarting when `key` changes. A text that grows (a
 * streamed reply) keeps typing from where it was. Under reduced motion the text shows at once.
 */
export function useTypewriter(key: string, text: string): string {
  const reduced = useReducedMotion();
  const [state, setState] = useState({ key, chars: 0 });
  const chars = state.key === key ? state.chars : 0;
  const done = chars >= text.length;
  useEffect(() => {
    if (reduced || done) return;
    const timer = setInterval(
      () => setState((s) => (s.key === key ? { key, chars: s.chars + 1 } : { key, chars: 1 })),
      STATION_MS["type-tick"],
    );
    return () => clearInterval(timer);
  }, [key, reduced, done]);
  return reduced ? text : text.slice(0, chars);
}

export interface OverseerCommsProps {
  readonly message?: CommsMessage;
  /** The Overseer's look, for the portrait slot (the final portrait is still to be designed). */
  readonly overseerLook?: number;
  readonly onApprove?: () => void;
  readonly onDeny?: () => void;
  /** Move on: the next approval, chatter line, or back from a reply. */
  readonly onNext?: () => void;
  /** Send an order to the Overseer. */
  readonly onOrder?: (text: string) => void;
  /** An approval or order is being sent. */
  readonly busy?: boolean;
  readonly className?: string;
}

/** Column 3, top: the Overseer talking, approvals, and the order line. */
export function OverseerComms({
  message,
  overseerLook,
  onApprove,
  onDeny,
  onNext,
  onOrder,
  busy = false,
  className = "",
}: OverseerCommsProps) {
  const typed = useTypewriter(message?.key ?? "", message?.text ?? "");
  const finished = message !== undefined && typed.length >= message.text.length;
  const [order, setOrder] = useState("");

  // Chatter and replies move on by themselves once typed, after the design's hold.
  useEffect(() => {
    if (!finished || !message || message.kind === "approval" || message.streaming || !onNext) {
      return;
    }
    const hold = message.kind === "reply" ? STATION_MS["reply-hold"] : STATION_MS["chatter-hold"];
    const timer = setTimeout(onNext, hold);
    return () => clearTimeout(timer);
  }, [finished, message, onNext]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = order.trim();
    if (!text || busy) return;
    onOrder?.(text);
    setOrder("");
  };

  return (
    <Panel
      title={term("comms.title")}
      meta={<span aria-hidden="true" className="st-blink size-2 bg-red" />}
      className={className}
    >
      <div className="flex gap-2.5 p-2.5">
        <div
          role="img"
          aria-label={term("comms.portrait")}
          className="flex h-24 w-21 shrink-0 items-end justify-center border-2 border-cyan p-1"
          style={{ background: "var(--st-portrait-stripes)" }}
        >
          {overseerLook === undefined ? null : <Sprite look={overseerLook} scale={3} />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5" aria-live="polite">
          <div className="font-display text-d8 text-amber uppercase">{message?.speaker ?? ""}</div>
          <p className="m-0 min-h-22 text-b19 text-fg-hi">
            <span aria-hidden="true">{typed}</span>
            <span className="sr-only">{message?.text}</span>
            <span
              aria-hidden="true"
              className="st-blink ml-0.5 inline-block h-3.75 w-2.25 bg-cyan align-[-2px]"
            />
          </p>
        </div>
      </div>
      {message?.kind === "approval" ? (
        <div className="flex gap-2.5 px-2.5 pb-2.5">
          <ChoiceButton glyph="A" tone="green" disabled={busy} onClick={onApprove}>
            {term("comms.approve")}
          </ChoiceButton>
          <ChoiceButton glyph="B" tone="red" disabled={busy} onClick={onDeny}>
            {term("comms.deny")}
          </ChoiceButton>
        </div>
      ) : (
        <div className="flex justify-end px-2.5 pb-2.5">
          <OutlineButton tone="line" className="text-d8" onClick={onNext}>
            {term("comms.next")}
          </OutlineButton>
        </div>
      )}
      <form
        onSubmit={submit}
        className="flex gap-1.5 border-line-faint border-t-2 bg-input-row p-2.5"
      >
        <span aria-hidden="true" className="self-center font-display text-d9 text-green">
          &gt;
        </span>
        <input
          value={order}
          onChange={(e) => setOrder(e.target.value)}
          placeholder={term("comms.order")}
          aria-label={term("comms.order")}
          className="min-w-0 flex-1 border-none bg-transparent font-body text-b19 text-fg-hi outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className="cursor-pointer border-none bg-green px-2 py-1.25 font-display text-d7 text-ink uppercase disabled:opacity-50"
        >
          {term("comms.send")}
        </button>
      </form>
    </Panel>
  );
}
