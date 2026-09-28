import type { Grant, Schedule, Station, Team } from "@darthsaul/outerworld-ai-core";

/** "every 360 minutes (6 hours)" or "cron `0 9 * * 1-5` (UTC)". */
export function scheduleLabel(s: Schedule): string {
  if (s.kind === "cron") return `cron \`${s.expression}\` (${s.timezone})`;
  const hours = s.everyMinutes / 60;
  return Number.isInteger(hours)
    ? `every ${s.everyMinutes} minutes (${hours} hour${hours === 1 ? "" : "s"})`
    : `every ${s.everyMinutes} minutes`;
}

export function teamById(station: Station, id: string): Team | undefined {
  return station.teams.find((t) => t.id === id);
}

export function grantsOf(station: Station, teamId: string): Grant[] {
  return station.grants.filter((g) => g.teamId === teamId);
}

export function grantLabel(g: Grant): string {
  return `${g.label ?? g.tool} (${g.mode}, ${g.kind})`;
}

/** Markdown table from rows; every cell is escaped for pipes. */
export function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const esc = (s: string) => s.replace(/\|/g, "\\|");
  const line = (cells: readonly string[]) => `| ${cells.map(esc).join(" | ")} |`;
  return [line(header), `| ${header.map(() => "---").join(" | ")} |`, ...rows.map(line)].join("\n");
}

export function bullet(items: readonly string[]): string {
  return items.length ? items.map((i) => `- ${i}`).join("\n") : "- none";
}

/** Fenced JSON block for a contract example. */
export function json(value: unknown): string {
  return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}
