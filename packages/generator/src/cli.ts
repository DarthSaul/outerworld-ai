import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseStation } from "@darthsaul/outerworld-ai-core";
import { emitLedger, protectedPaths } from "./emit/index.js";

export interface CliIo {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}

const USAGE = `usage:
  outerworld generate --station <station.json> --out <dir> [--dry-run] [--force] [--generated-at <ISO>]
  outerworld validate --station <station.json>

generate  emits the ledger repo files under --out. station.json, ledger/*.md, and status/** are
          never overwritten unless --force; everything else is regenerated.
validate  checks the station document and prints its issues.

exit codes: 0 ok · 1 invalid station or bad arguments · 2 could not read or write`;

function parseArgs(argv: readonly string[]): {
  command: string | undefined;
  flags: Map<string, string | true>;
} {
  const [command, ...rest] = argv;
  const flags = new Map<string, string | true>();
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a?.startsWith("--")) continue;
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags.set(a.slice(2), next);
      i++;
    } else flags.set(a.slice(2), true);
  }
  return { command, flags };
}

function readStation(
  path: string,
  io: CliIo,
): { ok: true; station: ReturnType<typeof parseStation> } | { ok: false; code: 1 | 2 } {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    io.stderr(`cannot read ${path}: ${(e as Error).message}`);
    return { ok: false, code: 2 };
  }
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch (e) {
    io.stderr(`${path} is not valid JSON: ${(e as Error).message}`);
    return { ok: false, code: 1 };
  }
  const parsed = parseStation(doc);
  for (const i of parsed.issues) io.stderr(`${i.level}: ${i.path}: ${i.message}`);
  if (!parsed.ok) return { ok: false, code: 1 };
  return { ok: true, station: parsed };
}

/** The CLI, testable: takes argv (without node and script) and returns the exit code. */
export function runCli(argv: readonly string[], io: CliIo): number {
  const { command, flags } = parseArgs(argv);
  const stationPath = flags.get("station");
  if ((command !== "generate" && command !== "validate") || typeof stationPath !== "string") {
    io.stderr(USAGE);
    if (command === "generate" || command === "validate") io.stderr("missing --station <path>");
    return 1;
  }
  const read = readStation(stationPath, io);
  if (!read.ok) return read.code;
  const parsed = read.station;
  if (!parsed.ok) return 1;

  if (command === "validate") {
    io.stdout(
      `${stationPath}: valid (${parsed.value.teams.length} teams, ${parsed.value.agents.length} agents, ${parsed.value.handoffs.length} handoffs)`,
    );
    return 0;
  }

  const out = flags.get("out");
  if (typeof out !== "string") {
    io.stderr(USAGE);
    io.stderr("missing --out <dir>");
    return 1;
  }
  const generatedAt = flags.get("generated-at");
  const files = emitLedger(parsed.value, typeof generatedAt === "string" ? { generatedAt } : {});
  const protectedSet = new Set(protectedPaths(files));
  const force = flags.get("force") === true;
  const dryRun = flags.get("dry-run") === true;

  if (dryRun) {
    for (const f of files) io.stdout(`${f.path.padEnd(40)} ${Buffer.byteLength(f.contents)} B`);
    io.stdout(`dry run: ${files.length} files, nothing written`);
    return 0;
  }

  let written = 0;
  let kept = 0;
  try {
    for (const f of files) {
      const target = join(out, f.path);
      if (!force && protectedSet.has(f.path) && existsSync(target)) {
        kept++;
        continue;
      }
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, f.contents);
      written++;
    }
  } catch (e) {
    io.stderr(`cannot write under ${out}: ${(e as Error).message}`);
    return 2;
  }
  io.stdout(
    `wrote ${written} files to ${out}${kept ? `, kept ${kept} existing (use --force to overwrite)` : ""}`,
  );
  return 0;
}
