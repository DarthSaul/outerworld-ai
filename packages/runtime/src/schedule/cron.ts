import { Cron } from "croner";

/** Why croner would refuse this cron and zone, in words; undefined when it is fine. */
export function cronIssue(cron: string, timezone?: string): string | undefined {
  try {
    new Cron(cron, { ...(timezone ? { timezone } : {}) }).nextRun();
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
