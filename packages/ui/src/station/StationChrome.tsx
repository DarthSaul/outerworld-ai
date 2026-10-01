import { term, termWith } from "@darthsaul/outerworld-ai-core";
import { type ReactNode, useEffect, useState } from "react";
import { stVar } from "../tokens/tokens.js";
import { SegmentBar } from "./SegmentBar.js";
import { StatBox } from "./StatBox.js";

/** One line on the radio: when, who (in their room color), and what. */
export interface RadioEntry {
  readonly id: string | number;
  readonly at: string;
  readonly who: string;
  /** A var() reference: the speaker's room color. */
  readonly color: string;
  readonly text: string;
  /** Where to look, if anywhere: the line opens it. */
  readonly to?: string;
}

const clock = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "--:--:--" : d.toLocaleTimeString("en-GB");
};

function Line({ entry }: { readonly entry: RadioEntry }) {
  return (
    <>
      <time dateTime={entry.at} className="shrink-0 text-fg-dim">
        {clock(entry.at)}
      </time>
      <span className="shrink-0 uppercase" style={{ color: entry.color }}>
        {entry.who}
      </span>
      <span className="truncate text-fg-log">{entry.text}</span>
    </>
  );
}

/**
 * The header's chatter feed: newest on top, one line each, in a short scroll area. A line with a
 * place to look is a button (`onOpen`), which also lets the keyboard reach the scroll area.
 */
export function RadioChatter({
  entries,
  onOpen,
}: {
  readonly entries: readonly RadioEntry[];
  readonly onOpen?: (to: string) => void;
}) {
  const row = "flex w-full min-w-0 gap-2.5 whitespace-nowrap text-left text-b17";
  return (
    <section
      aria-label={term("radio.title")}
      className="flex min-w-0 max-w-130 flex-[1_1_300px] flex-col gap-1 border-2 border-line-soft bg-well px-2.5 py-1.5"
    >
      <div className="flex justify-between gap-2 font-display text-d7 text-fg-mute uppercase">
        <span>{term("radio.title")}</span>
        <span>{term("radio.channel")}</span>
      </div>
      <ol className="m-0 flex h-10 list-none flex-col gap-px overflow-auto p-0">
        {entries.length === 0 ? (
          <li className="text-b17 text-fg-dim">{term("radio.empty")}</li>
        ) : (
          entries.map((e) => (
            <li key={e.id}>
              {e.to && onOpen ? (
                <button
                  type="button"
                  className={`${row} cursor-pointer bg-transparent p-0 hover:bg-hover`}
                  onClick={() => e.to && onOpen(e.to)}
                >
                  <Line entry={e} />
                </button>
              ) : (
                <div className={row}>
                  <Line entry={e} />
                </div>
              )}
            </li>
          ))
        )}
      </ol>
    </section>
  );
}

/** STOP / RESUME: the kill switch as the design's pill button. Amber while running. */
export function StopButton({
  stopped,
  busy,
  onToggle,
}: {
  readonly stopped: boolean;
  readonly busy?: boolean;
  readonly onToggle: () => void;
}) {
  const color = stopped ? stVar("green") : stVar("amber");
  return (
    <button
      type="button"
      aria-pressed={stopped}
      disabled={busy}
      onClick={onToggle}
      className="flex cursor-pointer items-center gap-2 border-2 bg-well px-3.5 font-display text-d8 uppercase hover:bg-btn-hover disabled:opacity-50"
      style={{ borderColor: color, color }}
    >
      <span aria-hidden="true" className="h-2.5 w-6.5 rounded-pill" style={{ background: color }} />
      {term(stopped ? "station.resume" : "station.stop")}
    </button>
  );
}

/** The CRT scanline overlay switch (a per-viewer preference). */
export function CrtToggle({
  on,
  onToggle,
}: {
  readonly on: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={term("crt.label")}
      aria-label={term("crt.label")}
      onClick={onToggle}
      className={`cursor-pointer border-2 border-line-soft px-2 font-display text-d7 uppercase ${on ? "bg-line-soft text-fg-hi" : "bg-well text-fg-mute"}`}
    >
      {term("crt")}
    </button>
  );
}

export interface StationHeaderProps {
  readonly stationName: string;
  readonly rooms: number;
  readonly crew: number;
  /** The page tabs (router links styled with `tabClass`). */
  readonly tabs: ReactNode;
  readonly live: number;
  readonly alerts: number;
  readonly radio: readonly RadioEntry[];
  /** Open where a radio line points. */
  readonly onOpenRadio?: (to: string) => void;
  /** Right end: the stop button, CRT switch, connection status. */
  readonly controls: ReactNode;
}

/** The design's header bar: arrowhead, station name, tabs; counts, radio, and controls. */
export function StationHeader(p: StationHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-line border-b-3 bg-bar px-4 py-3 shadow-bar-down">
      <div className="flex flex-wrap items-center gap-3">
        <div
          aria-hidden="true"
          className="size-8.5 bg-cyan [clip-path:polygon(50%_0,100%_100%,50%_78%,0_100%)]"
        />
        <div className="flex flex-col gap-1.5">
          <div className="font-display text-d14 text-title uppercase tracking-st-2">
            {p.stationName}
          </div>
          <div className="text-b17 text-subtitle uppercase tracking-st-1">
            {termWith("dashboard.subtitle", { rooms: String(p.rooms), crew: String(p.crew) })}
          </div>
        </div>
        <nav aria-label="Primary" className="ml-2">
          {p.tabs}
        </nav>
      </div>
      <div className="flex min-w-0 flex-auto flex-wrap items-stretch justify-end gap-2">
        <StatBox label={term("stat.live")} value={p.live} tone="green" />
        <StatBox label={term("stat.alerts")} value={p.alerts} tone="red" alert={p.alerts > 0} />
        <RadioChatter entries={p.radio} {...(p.onOpenRadio ? { onOpen: p.onOpenRadio } : {})} />
        {p.controls}
      </div>
    </header>
  );
}

/** `1.284M`, as the design writes tokens. */
export function formatTokens(tokens: number): string {
  return `${(tokens / 1e6).toFixed(3)}M`;
}

/** `03d 04:12:11` from a whole number of seconds. */
export function formatUptime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const pad = (v: number) => String(Math.floor(v)).padStart(2, "0");
  return `${pad(s / 86400)}d ${pad((s / 3600) % 24)}:${pad((s / 60) % 60)}:${pad(s % 60)}`;
}

/** Seconds since `startedAt`, ticking once a second. */
export function useUptime(startedAt: string | undefined, now: () => number = Date.now): number {
  const [tick, setTick] = useState(() => now());
  useEffect(() => {
    if (!startedAt) return;
    const timer = setInterval(() => setTick(now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt, now]);
  if (!startedAt) return 0;
  return (tick - Date.parse(startedAt)) / 1000;
}

export interface StationVitalsProps {
  readonly tokens?: number;
  readonly spendUsd?: number;
  /** The station's daily cap; without one, fuel shows spend alone. */
  readonly capUsd?: number;
  readonly startedAt?: string;
}

const usd = (n: number) => `$${n.toFixed(2)}`;

/** The footer: station vitals. Tokens and fuel are today's (UTC); uptime is this daemon's. */
export function StationVitals({ tokens, spendUsd, capUsd, startedAt }: StationVitalsProps) {
  const uptime = useUptime(startedAt);
  const spent = spendUsd ?? 0;
  const fuelLabel =
    capUsd === undefined
      ? termWith("vitals.fuelNoCap", { spent: usd(spent) })
      : termWith("vitals.fuel", { spent: usd(spent), cap: usd(capUsd) });
  return (
    <footer className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-line border-t-3 bg-bar px-4 py-3 shadow-bar-up">
      <div className="flex flex-col gap-1.5">
        <h2 className="m-0 font-display font-normal text-d10 text-title uppercase tracking-st-2">
          {term("vitals.title")}
        </h2>
        <div className="text-b17 text-subtitle uppercase tracking-st-1">
          {term("vitals.subtitle")}
        </div>
      </div>
      <div className="flex flex-wrap items-stretch justify-end gap-2">
        <StatBox
          label={term("vitals.tokens")}
          value={tokens === undefined ? "—" : formatTokens(tokens)}
          tone="cyan"
        />
        <StatBox label={fuelLabel} className="min-w-42.5 gap-1.5">
          {capUsd === undefined ? null : (
            <SegmentBar
              color={stVar("amber")}
              percent={(spent / capUsd) * 100}
              size="lg"
              label={fuelLabel}
            />
          )}
        </StatBox>
        <StatBox label={term("vitals.uptime")} value={startedAt ? formatUptime(uptime) : "—"} />
      </div>
    </footer>
  );
}
