import type { GlossaryKey } from "../glossary.js";

/**
 * The Overseer's ambient chatter (ADR-0013 #14): lines filled from live runtime state, plus tips
 * that claim nothing. Every stateful line is only produced when the snapshot proves it, so the
 * chatter never asserts what the runtime cannot show. The ui cycles through the lines, asking
 * again for each next one so a line is never stale.
 */

export interface ChatterSnapshot {
  /** Runs queued, running, or waiting for consent, newest first. */
  readonly live: readonly {
    readonly agent: string;
    readonly room: string;
    readonly title: string;
  }[];
  /** Crew members waiting on the Commander. */
  readonly waiting: readonly string[];
  /** The most recently finished run, if any. */
  readonly lastDone?: { readonly agent: string; readonly title: string };
  /** Station spend today, and the station's daily cap when one is set. */
  readonly spendUsd: number;
  readonly capUsd?: number;
}

export interface ChatterLine {
  readonly key: GlossaryKey;
  readonly vars: Readonly<Record<string, string>>;
}

const usd = (n: number) => `$${n.toFixed(2)}`;

export function chatterLines(s: ChatterSnapshot): ChatterLine[] {
  const lines: ChatterLine[] = [];
  const [first] = s.live;
  if (first) {
    lines.push({
      key: s.live.length === 1 ? "chatter.live.one" : "chatter.live.many",
      vars: {
        count: String(s.live.length),
        agent: first.agent,
        room: first.room,
        title: first.title,
      },
    });
  } else {
    lines.push({ key: "chatter.quiet", vars: {} });
  }
  const [waiting] = s.waiting;
  if (waiting) lines.push({ key: "chatter.waiting", vars: { agent: waiting } });
  if (s.lastDone) {
    lines.push({ key: "chatter.done", vars: { agent: s.lastDone.agent, title: s.lastDone.title } });
  }
  if (s.capUsd !== undefined) {
    lines.push({ key: "chatter.spend", vars: { spent: usd(s.spendUsd), cap: usd(s.capUsd) } });
  }
  lines.push({ key: "chatter.tip.order", vars: {} });
  lines.push({ key: "chatter.tip.scan", vars: {} });
  return lines;
}
