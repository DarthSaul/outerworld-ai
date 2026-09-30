/** USD for spend: cents normally, four decimals for sub-cent amounts, so small calls stay visible. */
export function formatUsd(amount: number): string {
  if (amount === 0) return "$0.00";
  return amount < 0.01 ? `$${amount.toFixed(4)}` : `$${amount.toFixed(2)}`;
}

/** A date and time for people, in `timeZone` when given (a schedule's own zone), else local. */
export function formatWhen(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(iso));
}
