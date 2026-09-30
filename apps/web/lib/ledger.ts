import {
  type Dirent,
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import {
  type LedgerFiles,
  parseLedger,
  parseStation,
  type Station,
  type StationState,
} from "@darthsaul/outerworld-ai-core";

/**
 * Server-only: reads a ledger repo from disk into core's in-memory file map. The path comes from
 * OUTERWORLD_LEDGER_PATH or falls back to the demo fixture. No network, ever (docs/PRIVACY.md).
 */
const FIXTURE_ROOT = resolve(process.cwd(), "..", "..", "fixtures", "map-demo");
/** The fixture's own moment. Health is evaluated here for the fixture so the demo never rots into "stalled". */
export const FIXTURE_AS_OF = "2026-09-27T15:00:00Z";
/** Only `ledger/` and `status/` under the ledger root are read; nothing else is a ledger input. */
function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
export const MAX_FILE_BYTES = 1024 * 1024;
export const MAX_FILES = 2000;

interface Skipped {
  readonly path: string;
  readonly reason: string;
}

interface Walked {
  readonly files: LedgerFiles;
  readonly skipped: Skipped[];
}

/**
 * Reads `ledger/` and `status/` under the root: regular `.md`/`.json` files only, no symlinks,
 * capped per file and in total. Anything skipped is reported so the dashboard can show it.
 */
function walkLedger(root: string): Walked {
  const files: Record<string, string> = {};
  const skipped: Skipped[] = [];
  let count = 0;
  const visit = (dir: string) => {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      skipped.push({ path: relative(root, dir), reason: `cannot list: ${(e as Error).message}` });
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      const rel = relative(root, full);
      if (entry.isSymbolicLink()) {
        skipped.push({ path: rel, reason: "symbolic links are not read" });
        continue;
      }
      if (entry.isDirectory()) {
        visit(full);
        continue;
      }
      if (!entry.isFile() || !/\.(json|md)$/.test(entry.name)) continue;
      if (count >= MAX_FILES) {
        skipped.push({ path: rel, reason: `more than ${MAX_FILES} files; the rest were not read` });
        continue;
      }
      const size = statSync(full).size;
      if (size > MAX_FILE_BYTES) {
        skipped.push({
          path: rel,
          reason: `${size} bytes exceeds the ${MAX_FILE_BYTES}-byte limit`,
        });
        continue;
      }
      count++;
      files[rel] = readFileSync(full, "utf8");
    }
  };
  for (const dir of [join(root, "ledger"), join(root, "status")]) {
    if (isDirectory(dir)) visit(dir);
  }
  return { files, skipped };
}

/** Short HEAD sha of the ledger repo when it is a git checkout; undefined otherwise. */
function readHeadSha(root: string): { sha?: string; issue?: string } {
  const gitDir = join(root, ".git");
  if (!existsSync(gitDir)) return {};
  try {
    const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
    const ref = /^ref:\s*(.+)$/.exec(head)?.[1];
    if (!ref) return { sha: head.slice(0, 7) };
    const refPath = join(gitDir, ref);
    if (existsSync(refPath)) return { sha: readFileSync(refPath, "utf8").trim().slice(0, 7) };
    const packed = existsSync(join(gitDir, "packed-refs"))
      ? readFileSync(join(gitDir, "packed-refs"), "utf8")
      : "";
    const line = packed.split("\n").find((l) => l.endsWith(` ${ref}`));
    if (line) return { sha: line.slice(0, 7) };
    return { issue: `could not resolve ${ref} in .git` };
  } catch (e) {
    return { issue: `could not read .git/HEAD: ${(e as Error).message}` };
  }
}

export interface LoadedLedger {
  readonly station: Station;
  readonly state: StationState;
  readonly source: "fixture" | "ledger";
  readonly sourcePath: string;
  /** The clock health was evaluated against. */
  readonly now: string;
}

function readStation(stationPath: string, root: string): Station {
  let real: string;
  try {
    real = realpathSync(stationPath);
  } catch (e) {
    throw new Error(`cannot read station.json at ${stationPath}: ${(e as Error).message}`);
  }
  const rootReal = realpathSync(root);
  if (real !== join(rootReal, "station.json") && !real.startsWith(rootReal + sep)) {
    throw new Error(`station.json at ${stationPath} resolves outside the ledger root ${root}`);
  }
  let doc: unknown;
  try {
    doc = JSON.parse(readFileSync(real, "utf8"));
  } catch (e) {
    throw new Error(`cannot read station.json at ${stationPath}: ${(e as Error).message}`);
  }
  const parsed = parseStation(doc);
  if (!parsed.ok) {
    throw new Error(
      `station.json at ${stationPath} is invalid:\n${parsed.issues.map((i) => `${i.path}: ${i.message}`).join("\n")}`,
    );
  }
  return parsed.value;
}

function load(
  root: string,
  stationPath: string,
  source: "fixture" | "ledger",
  now: string,
): LoadedLedger {
  const station = readStation(stationPath, source === "fixture" ? FIXTURE_ROOT : root);
  const { files, skipped } = walkLedger(root);
  const head = source === "ledger" ? readHeadSha(root) : {};
  const state = parseLedger(station, files, {
    now,
    sourcePath: root,
    ...(head.sha !== undefined ? { sourceRef: head.sha } : {}),
  });
  const extra = [
    ...skipped.map((s) => ({ level: "warn" as const, path: s.path, message: s.reason })),
    ...(head.issue ? [{ level: "warn" as const, path: ".git/HEAD", message: head.issue }] : []),
  ];
  return {
    station,
    state: extra.length ? { ...state, issues: [...state.issues, ...extra] } : state,
    source,
    sourcePath: root,
    now,
  };
}

/** The demo fixture, always, evaluated at its own moment. The gallery uses this. */
export function loadFixture(): LoadedLedger {
  return load(
    join(FIXTURE_ROOT, "ledger"),
    join(FIXTURE_ROOT, "station.json"),
    "fixture",
    FIXTURE_AS_OF,
  );
}

/** The ledger at OUTERWORLD_LEDGER_PATH (resolved against the working directory), or the fixture. */
export function loadLedger(options: { readonly now?: string } = {}): LoadedLedger {
  const custom = process.env.OUTERWORLD_LEDGER_PATH;
  if (!custom)
    return options.now
      ? load(
          join(FIXTURE_ROOT, "ledger"),
          join(FIXTURE_ROOT, "station.json"),
          "fixture",
          options.now,
        )
      : loadFixture();
  const root = resolve(custom);
  // A real ledger repo keeps station.json at its root beside ledger/ and status/.
  return load(root, join(root, "station.json"), "ledger", options.now ?? new Date().toISOString());
}
