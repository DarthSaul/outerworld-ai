/** Display formatting for evidence: timestamps, windows, durations. All UTC, locale-free. */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;
const pad = (n: number) => String(n).padStart(2, "0");

/** "27 Sep 14:00" */
export function dateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "14:00:04" */
export function clockLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** "14:02" in UTC, or undefined when the input is missing or unreadable; the proof line carries the full value. */
export function timeLabel(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "2m 07s" for a closed window; "—" when it is still open or unreadable. */
export function durationLabel(startIso: string, endIso: string | undefined): string {
  if (!endIso) return "—";
  const ms = Date.parse(endIso) - Date.parse(startIso);
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${pad(s % 60)}s` : `${s}s`;
}

/** True only for an https URL, the one kind the dashboard renders as a link. */
export function isHttpsUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
