import { term, termWith } from "@darthsaul/outerworld-ai-core";

/** USD for spend: cents normally, four decimals for sub-cent amounts, so small calls stay visible. */
export function formatUsd(amount: number): string {
  if (amount === 0) return "$0.00";
  return amount < 0.01 ? `$${amount.toFixed(4)}` : `$${amount.toFixed(2)}`;
}

/**
 * How long ago, short: `just now`, `5m ago`, `3h ago`, `2d ago`; past a week, the date. In the
 * glossary's words.
 */
export function formatAgo(iso: string, now: number = Date.now()): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "";
  const minutes = Math.floor(Math.max(0, now - at) / 60_000);
  if (minutes < 1) return term("time.justNow");
  if (minutes < 60) return termWith("time.minutes", { n: String(minutes) });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return termWith("time.hours", { n: String(hours) });
  const days = Math.floor(hours / 24);
  if (days < 7) return termWith("time.days", { n: String(days) });
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(at));
}

/** A date and time for people, in `timeZone` when given (a schedule's own zone), else local. */
export function formatWhen(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(iso));
}
