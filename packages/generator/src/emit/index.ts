import type { Grant, Station } from "@darthsaul/outerworld-ai-core";
import { emitClaudeMd } from "./claude-md.js";
import {
  type EmittedFile,
  emitAgentPersona,
  emitGitkeeps,
  emitLedgerSkeleton,
  emitPostDigestScript,
  emitSkill,
  emitStationJson,
  emitStatusReadme,
} from "./files.js";
import { emitOverseerPrompt, emitRoutinePrompt } from "./prompts.js";

export type { EmittedFile } from "./files.js";
export {
  emitAgentPersona,
  emitClaudeMd,
  emitGitkeeps,
  emitLedgerSkeleton,
  emitOverseerPrompt,
  emitPostDigestScript,
  emitRoutinePrompt,
  emitSkill,
  emitStationJson,
  emitStatusReadme,
};

export interface EmitOptions {
  /** Stamped into CLAUDE.md. Defaults to now; the fixture snapshot passes a fixed value. */
  readonly generatedAt?: string;
}

/** Sorts by path so output is deterministic regardless of emit order. */
export function sortEmitted(files: readonly EmittedFile[]): EmittedFile[] {
  return [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** The whole ledger repo for a Station: pure, deterministic, sorted by path. */
export function emitLedger(station: Station, options: EmitOptions = {}): EmittedFile[] {
  const generatedAt = options.generatedAt ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const skillsByTool = new Map<string, Grant[]>();
  for (const g of station.grants) {
    if (g.kind !== "skill") continue;
    skillsByTool.set(g.tool, [...(skillsByTool.get(g.tool) ?? []), g]);
  }
  const files: EmittedFile[] = [
    emitClaudeMd(station, generatedAt),
    emitStationJson(station),
    ...station.agents.map((a) => emitAgentPersona(a, station)),
    ...[...skillsByTool.entries()].map(([tool, grants]) => emitSkill(tool, grants, station)),
    ...station.teams.map((t) => emitRoutinePrompt(t, station)),
    emitOverseerPrompt(station),
    ...station.teams.map((t) => emitLedgerSkeleton(t)),
    emitPostDigestScript(),
    emitStatusReadme(),
    ...emitGitkeeps(),
  ];
  return sortEmitted(files);
}

/** Files the CLI never overwrites without --force: the user's data and the Routines' output. */
export function protectedPaths(files: readonly EmittedFile[]): string[] {
  return files
    .map((f) => f.path)
    .filter((p) => p === "station.json" || p.startsWith("ledger/") || p.startsWith("status/"));
}
