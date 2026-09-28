import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { parseStation, type Station } from "@darthsaul/outerworld-ai-core";
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

/** Flags that take a value; every other known flag is a boolean switch. */
const VALUE_FLAGS = new Set(["station", "out", "generated-at"]);
const BOOLEAN_FLAGS = new Set(["dry-run", "force"]);

type ParsedArgs = { command: string | undefined; flags: Map<string, string | true> };

/** Strict: unknown flags and value flags without a value are errors, so a typo never writes to disk. */
function parseArgs(argv: readonly string[]): ParsedArgs | { error: string } {
  const [command, ...rest] = argv;
  const flags = new Map<string, string | true>();
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === undefined) continue;
    if (!a.startsWith("--")) return { error: `unexpected argument "${a}"` };
    const name = a.slice(2);
    if (VALUE_FLAGS.has(name)) {
      const next = rest[i + 1];
      if (next === undefined || next.startsWith("--")) return { error: `--${name} needs a value` };
      flags.set(name, next);
      i++;
    } else if (BOOLEAN_FLAGS.has(name)) {
      flags.set(name, true);
    } else {
      return { error: `unknown flag --${name}` };
    }
  }
  return { command, flags };
}

function readStation(
  path: string,
  io: CliIo,
): { ok: true; station: Station } | { ok: false; code: 1 | 2 } {
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
  return { ok: true, station: parsed.value };
}

/**
 * Defense in depth for the writer: an emitted path must be relative and stay inside --out.
 * Core already constrains every id that becomes a path segment; this catches anything else.
 */
export function assertInsideOut(out: string, emittedPath: string): string {
  if (isAbsolute(emittedPath)) throw new Error(`refusing absolute emitted path "${emittedPath}"`);
  const target = resolve(out, emittedPath);
  const rel = relative(resolve(out), target);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`refusing emitted path "${emittedPath}": it escapes ${out}`);
  }
  return target;
}

/** The CLI, testable: takes argv (without node and script) and returns the exit code. */
export function runCli(argv: readonly string[], io: CliIo): number {
  const args = parseArgs(argv);
  if ("error" in args) {
    io.stderr(USAGE);
    io.stderr(args.error);
    return 1;
  }
  const { command, flags } = args;
  const stationPath = flags.get("station");
  if ((command !== "generate" && command !== "validate") || typeof stationPath !== "string") {
    io.stderr(USAGE);
    if (command === "generate" || command === "validate") io.stderr("missing --station <path>");
    return 1;
  }
  const read = readStation(stationPath, io);
  if (!read.ok) return read.code;
  const station = read.station;

  if (command === "validate") {
    io.stdout(
      `${stationPath}: valid (${station.teams.length} teams, ${station.agents.length} agents, ${station.handoffs.length} handoffs)`,
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
  const files = emitLedger(station, typeof generatedAt === "string" ? { generatedAt } : {});
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
      const target = assertInsideOut(out, f.path);
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
