import { Cron } from "croner";
import cronstrue from "cronstrue";

export type CronPreview =
  | { readonly ok: true; readonly description: string; readonly nextRuns: readonly Date[] }
  | { readonly ok: false; readonly error: string };

/**
 * What a cron means, before it is saved: a plain-English description (cronstrue) and the next
 * runs in `timezone`. Validity comes from croner, the library the daemon runs schedules with, so
 * the preview and the daemon agree. Undefined for an empty field.
 */
export function previewCron(
  cron: string,
  timezone: string,
  from: Date = new Date(),
  count = 3,
): CronPreview | undefined {
  const pattern = cron.trim();
  if (!pattern) return undefined;
  try {
    const nextRuns = new Cron(pattern, { timezone }).nextRuns(count, from);
    const description = cronstrue.toString(pattern, {
      throwExceptionOnParseError: true,
      trimHoursLeadingZero: true,
    });
    return { ok: true, description, nextRuns };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
