import { emptyState } from "../events.js";
import type { Issue } from "../schema/common.js";
import type { LedgerSections, RunSummary, StationState, TeamState } from "../schema/state.js";
import type { Schedule, Station } from "../schema/station.js";
import {
  type OverseerStatus,
  parseOverseerStatus,
  parseRunRecord,
  parseTeamStatus,
  type RunRecord,
  type TeamStatus,
} from "../schema/status.js";

/** Path (relative to the ledger root, any separator) → contents. core never reads the disk. */
export type LedgerFiles = Readonly<Record<string, string>>;

export interface ParseLedgerOptions {
  /** ISO timestamp used for health derivation and as the fallback provenance time. */
  readonly now: string;
  readonly sourcePath: string;
  readonly sourceRef?: string;
}

export const RECENT_RUNS = 6;
export const DEGRADED_AFTER_MS = 24 * 60 * 60 * 1000;
const STALL_FACTOR = 2;
const DEFAULT_INTERVAL_MS = DEGRADED_AFTER_MS;
const LEDGER_MARKER = /<!--\s*ow:ledger\s+v\d+/;

type Sections = { nextSteps: string[]; waitingOn: string[]; log: string[] };

const SECTION_KEYS: Record<string, keyof Sections> = {
  "next steps": "nextSteps",
  "waiting on": "waitingOn",
  log: "log",
};

const KNOWN_HEADING = /^##\s+(next steps|waiting on|log)\s*$/im;

/** Reads the three fixed sections of a team ledger. Undefined when neither the marker nor a known heading is present. */
export function parseLedgerMarkdown(text: string): LedgerSections | undefined {
  if (!LEDGER_MARKER.test(text) && !KNOWN_HEADING.test(text)) return undefined;
  const sections: Sections = { nextSteps: [], waitingOn: [], log: [] };
  let current: keyof Sections | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = /^##\s+(.+?)\s*$/.exec(line)?.[1];
    if (heading !== undefined) {
      current = SECTION_KEYS[heading.toLowerCase()];
      continue;
    }
    const bullet = /^[-*]\s+(.+)$/.exec(line)?.[1];
    if (bullet !== undefined && current) sections[current].push(bullet);
  }
  return sections;
}

const normalize = (p: string) => p.replace(/\\/g, "/").replace(/^\.?\//, "");

function summarize(run: RunRecord): RunSummary {
  return {
    startedAt: run.startedAt,
    ...(run.endedAt !== undefined ? { endedAt: run.endedAt } : {}),
    ...(run.outcome !== undefined ? { outcome: run.outcome } : {}),
    ...(run.sessionUrl !== undefined ? { sessionUrl: run.sessionUrl } : {}),
    grantsUsed: run.grantsUsed,
    ledger: run.ledger,
    ...(run.error !== undefined ? { error: run.error } : {}),
  };
}

function intervalMs(schedule: Schedule, runs: readonly RunRecord[]): number {
  if (schedule.kind === "interval") return schedule.everyMinutes * 60 * 1000;
  const [latest, previous] = runs;
  if (latest && previous) {
    return Math.max(Date.parse(latest.startedAt) - Date.parse(previous.startedAt), 60 * 1000);
  }
  return DEFAULT_INTERVAL_MS;
}

/**
 * Derives the dashboard's state from the files of a ledger repo. Never throws: anything it
 * cannot read becomes an issue and the affected team is marked `attention`.
 */
export function parseLedger(
  station: Station,
  files: LedgerFiles,
  options: ParseLedgerOptions,
): StationState {
  const state = structuredClone(
    emptyState(station, {
      now: options.now,
      sourcePath: options.sourcePath,
      ...(options.sourceRef !== undefined ? { sourceRef: options.sourceRef } : {}),
    }),
  ) as { -readonly [K in keyof StationState]: StationState[K] };
  const issues: { level: Issue["level"]; path: string; message: string }[] = [];
  const nowMs = Date.parse(options.now);
  let newest = Number.NEGATIVE_INFINITY;
  const seen = (ts: string | undefined) => {
    if (ts !== undefined) newest = Math.max(newest, Date.parse(ts));
  };

  const byPath = new Map<string, string>();
  for (const [p, contents] of Object.entries(files)) byPath.set(normalize(p), contents);

  const runsByTeam = new Map<string, RunRecord[]>();
  const teamStatus = new Map<string, TeamStatus>();
  const malformedTeams = new Set<string>();
  let overseer: OverseerStatus | undefined;

  /** Warnings from a successful parse keep their field path; a failed parse is one issue per file. */
  const report = (
    path: string,
    kind: string,
    parsed: { ok: boolean; issues: readonly Issue[] },
  ) => {
    if (parsed.ok) {
      issues.push(
        ...parsed.issues.map((i) => ({ ...i, level: "warn" as const, path: `${path}#${i.path}` })),
      );
      return;
    }
    const detail = parsed.issues.map((i) => `${i.path}: ${i.message}`).join("; ");
    issues.push({ level: "warn", path, message: `invalid ${kind}: ${detail}` });
  };

  const readJson = (path: string, contents: string): unknown => {
    try {
      return JSON.parse(contents);
    } catch (e) {
      issues.push({ level: "warn", path, message: `not valid JSON: ${(e as Error).message}` });
      return undefined;
    }
  };

  for (const [path, contents] of byPath) {
    const runTeamId = /^status\/runs\/([^/]+)\/[^/]+\.json$/.exec(path)?.[1];
    if (runTeamId !== undefined) {
      const teamId = runTeamId;
      const raw = readJson(path, contents);
      if (raw === undefined) {
        malformedTeams.add(teamId);
        continue;
      }
      const parsed = parseRunRecord(raw);
      report(path, "run record", parsed);
      if (!parsed.ok) {
        malformedTeams.add(teamId);
        continue;
      }
      if (!state.teams[parsed.value.teamId]) {
        issues.push({
          level: "warn",
          path,
          message: `unknown team "${parsed.value.teamId}"; run ignored`,
        });
        continue;
      }
      const list = runsByTeam.get(parsed.value.teamId) ?? [];
      list.push(parsed.value);
      runsByTeam.set(parsed.value.teamId, list);
      continue;
    }
    const statusTeamId = /^status\/teams\/([^/]+)\.json$/.exec(path)?.[1];
    if (statusTeamId !== undefined) {
      const raw = readJson(path, contents);
      if (raw === undefined) {
        malformedTeams.add(statusTeamId);
        continue;
      }
      const parsed = parseTeamStatus(raw);
      report(path, "team status", parsed);
      if (!parsed.ok) {
        malformedTeams.add(statusTeamId);
        continue;
      }
      teamStatus.set(parsed.value.teamId, parsed.value);
      continue;
    }
    if (path === "status/overseer.json") {
      const raw = readJson(path, contents);
      if (raw === undefined) continue;
      const parsed = parseOverseerStatus(raw);
      report(path, "overseer status", parsed);
      if (parsed.ok) overseer = parsed.value;
    }
  }

  for (const team of station.teams) {
    const t = state.teams[team.id] as { -readonly [K in keyof TeamState]: TeamState[K] };
    const runs = (runsByTeam.get(team.id) ?? []).sort(
      (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt),
    );
    const latest = runs[0];
    const ledgerText = byPath.get(`ledger/${team.id}.md`);
    const sections = ledgerText !== undefined ? parseLedgerMarkdown(ledgerText) : undefined;
    t.ledger = {
      path: `ledger/${team.id}.md`,
      exists: ledgerText !== undefined,
      ...(sections ? { sections } : {}),
      changedInLastRun: latest?.ledger.changed ?? false,
    };
    t.recentRuns = runs.slice(0, RECENT_RUNS).map(summarize);
    if (latest) {
      t.lastRun = summarize(latest);
      seen(latest.startedAt);
      seen(latest.endedAt);
    }

    const interval = intervalMs(team.schedule, runs);
    const sinceStartMs = latest ? nowMs - Date.parse(latest.startedAt) : Number.POSITIVE_INFINITY;
    const stalled = latest ? sinceStartMs > STALL_FACTOR * interval : t.ledger.exists;
    const open = latest !== undefined && latest.endedAt === undefined;

    t.run = !latest ? "idle" : open ? (stalled ? "idle" : "working") : (latest.outcome ?? "idle");
    t.degraded = latest !== undefined && sinceStartMs > DEGRADED_AFTER_MS;

    const overseerFlag = overseer?.attention.find((a) => a.teamId === team.id);
    if (stalled) {
      t.health = "stalled";
      t.healthReason = latest
        ? `no run since ${latest.startedAt}; expected every ${Math.round(interval / 60000)} min`
        : "ledger exists but no run has been recorded";
    } else if (latest?.outcome === "failed") {
      t.health = "attention";
      t.healthReason = `last run failed: ${latest.error ?? "no error given"}`;
    } else if (overseerFlag) {
      t.health = "attention";
      t.healthReason = `overseer: ${overseerFlag.reason}`;
    } else if (malformedTeams.has(team.id)) {
      t.health = "attention";
      t.healthReason = "a status file for this team could not be read";
    } else {
      t.health = "ok";
      t.healthReason = undefined;
    }

    // Agent states: the team status file wins when it is newer than the latest run's start.
    const status = teamStatus.get(team.id);
    seen(status?.updatedAt);
    const fromStatus =
      status && (!latest || Date.parse(status.updatedAt) >= Date.parse(latest.startedAt));
    const agentStates = fromStatus ? status.agents : (latest?.agents ?? []);
    for (const a of agentStates) {
      if (state.agents[a.agentId]) {
        state.agents[a.agentId] = {
          state: a.state,
          ...(a.note !== undefined ? { note: a.note } : {}),
        };
      }
    }
    for (const h of station.handoffs) {
      if (h.from === team.id) state.handoffs[h.id] = { carrying: t.ledger.changedInLastRun };
    }
  }

  if (overseer) {
    seen(overseer.updatedAt);
    const digest = byPath.get(overseer.digestPath);
    state.overseer = {
      state: overseer.state,
      ...(overseer.lastRunStartedAt !== undefined
        ? { lastRunStartedAt: overseer.lastRunStartedAt }
        : {}),
      ...(overseer.lastOutwardPostAt !== undefined
        ? { lastOutwardPostAt: overseer.lastOutwardPostAt }
        : {}),
      reconciled: overseer.reconciled,
      attention: overseer.attention,
      ...(digest !== undefined ? { digest } : {}),
    };
  }

  state.provenance = {
    ...state.provenance,
    asOf: Number.isFinite(newest)
      ? new Date(newest).toISOString().replace(".000Z", "Z")
      : options.now,
  };
  state.issues = issues;
  return state;
}
