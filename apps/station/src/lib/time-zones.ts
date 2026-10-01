export interface ZoneOption {
  readonly id: string;
  readonly label: string;
}

export interface ZoneGroup {
  readonly region: string;
  readonly zones: readonly ZoneOption[];
}

const offset = (id: string, at: Date): string =>
  new Intl.DateTimeFormat("en", { timeZone: id, timeZoneName: "shortOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value ?? "";

/** "Stockholm (GMT+2)": the place without its region, and the offset at `at`. */
export function zoneLabel(id: string, at: Date = new Date()): string {
  if (id === "UTC") return "UTC";
  const place = (id.includes("/") ? id.slice(id.indexOf("/") + 1) : id)
    .replaceAll("_", " ")
    .replaceAll("/", " / ");
  const off = offset(id, at);
  return off ? `${place} (${off})` : place;
}

/**
 * Every IANA zone the browser knows, grouped by region (America, Europe, …) and sorted by
 * label, with UTC first. `keep` (a zone already saved, perhaps an old alias) is always offered.
 */
export function zoneGroups(at: Date = new Date(), keep?: string): ZoneGroup[] {
  const ids = new Set(Intl.supportedValuesOf("timeZone"));
  ids.delete("UTC");
  if (keep && keep !== "UTC") ids.add(keep);
  const byRegion = new Map<string, ZoneOption[]>();
  for (const id of ids) {
    const region = id.includes("/") ? id.slice(0, id.indexOf("/")) : "Other";
    const list = byRegion.get(region) ?? [];
    list.push({ id, label: zoneLabel(id, at) });
    byRegion.set(region, list);
  }
  const groups = [...byRegion]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([region, zones]) => ({
      region,
      zones: zones.sort((a, b) => a.label.localeCompare(b.label)),
    }));
  return [{ region: "UTC", zones: [{ id: "UTC", label: "UTC" }] }, ...groups];
}
