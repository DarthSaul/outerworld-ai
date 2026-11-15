import { term } from "@darthsaul/outerworld-ai-core";
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
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
  /** Not on screen (another tab is shown): hold the message rather than move on unseen. */
  readonly paused?: boolean;
  /** Under the order box: the next order's model settings (the app supplies the control). */
  readonly orderFoot?: ReactNode;
  readonly className?: string;
}

/** The Overseer talking, approvals, and the order line, in a panel of its own. */
export function OverseerComms({ className = "", ...props }: OverseerCommsProps) {
  return (
    <Panel
      title={term("comms.title")}
      meta={<span aria-hidden="true" className="st-blink size-2 bg-red" />}
      className={className}
    >
      <OverseerCommsBody {...props} />
    </Panel>
  );
}

/**
 * What `OverseerComms` holds, without the panel: for a panel of tabs (the Station's comms card).
 * Fills a flex column; the message scrolls when the space is short.
 */
export function OverseerCommsBody({
  message,
  overseerLook,
  onApprove,
  onDeny,
  onNext,
  onOrder,
  busy = false,
  paused = false,
  orderFoot,
}: Omit<OverseerCommsProps, "className">) {
  const typed = useTypewriter(message?.key ?? "", message?.text ?? "");
  const finished = message !== undefined && typed.length >= message.text.length;
  const [order, setOrder] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);

  // Chatter and replies move on by themselves once typed, after the design's hold.
  useEffect(() => {
    if (
      paused ||
      !finished ||
      !message ||
      message.kind === "approval" ||
      message.streaming ||
      !onNext
    ) {
      return;
    }
    const hold = message.kind === "reply" ? STATION_MS["reply-hold"] : STATION_MS["chatter-hold"];
    const timer = setTimeout(onNext, hold);
    return () => clearTimeout(timer);
  }, [paused, finished, message, onNext]);

  /** The order line grows with its text up to three lines (its max height), then scrolls. */
  const growToText = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  // Enter sends, as a one-line field did; Shift+Enter starts a new line.
  const onOrderKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = order.trim();
    if (!text || busy) return;
    onOrder?.(text);
    setOrder("");
    // Back to one line once sent.
    if (field.current) field.current.style.height = "";
  };

  return (
    <>
      <div className="flex min-h-0 flex-1 gap-1.5 overflow-y-auto p-2.5">
        <div role="img" aria-label={term("comms.portrait")} className="flex shrink-0 items-start">
          {overseerLook === undefined ? null : <Sprite look={overseerLook} scale={1.5} />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5" aria-live="polite">
          <div className="font-display text-d8 text-amber uppercase">{message?.speaker ?? ""}</div>
          <p className="m-0 text-b19 text-fg-hi">
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
        <div className="flex shrink-0 gap-2.5 px-2.5 pb-2.5">
          <ChoiceButton glyph="A" tone="green" disabled={busy} onClick={onApprove}>
            {term("comms.approve")}
          </ChoiceButton>
          <ChoiceButton glyph="B" tone="red" disabled={busy} onClick={onDeny}>
            {term("comms.deny")}
          </ChoiceButton>
        </div>
      ) : (
        <div className="flex shrink-0 justify-end px-2.5 pb-2.5">
          <OutlineButton tone="line" className="text-d8" onClick={onNext}>
            {term("comms.next")}
          </OutlineButton>
        </div>
      )}
      {/* The order box, laid out like every composer: Send inside it, settings beneath. */}
      <div className="flex shrink-0 flex-col gap-1.5 border-line-faint border-t-2 p-2.5">
        <form
          onSubmit={submit}
          className="flex items-end gap-1.5 border-2 border-line-soft bg-input-row px-2.5 py-2 focus-within:border-cyan"
        >
          <textarea
            ref={field}
            rows={1}
            value={order}
            onChange={(e) => {
              setOrder(e.target.value);
              growToText(e.target);
            }}
            onKeyDown={onOrderKey}
            placeholder={term("comms.order")}
            aria-label={term("comms.order")}
            className="max-h-[3lh] min-w-0 flex-1 resize-none overflow-y-auto border-none bg-transparent p-0 font-body text-b19 text-fg-hi outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className="shrink-0 cursor-pointer border-none bg-green px-2.5 py-1.25 font-display text-d7 text-ink uppercase disabled:opacity-50"
          >
            {term("comms.send")}
          </button>
        </form>
        {orderFoot}
      </div>
    </>
  );
}
