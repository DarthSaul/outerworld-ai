import { lstat, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  AGENT_DOCUMENTS,
  type AgentConfig,
  type AgentDocumentName,
  type Issue,
  MAX_DOCUMENT_BYTES,
  parseAgentConfig,
  parseStationConfig,
  type StationConfig,
  stationCrewIssues,
} from "@darthsaul/outerworld-ai-core";
import { writeFileAtomic } from "./atomic-write.js";

export { AGENT_DOCUMENTS, type AgentDocumentName };

const ID = /^[a-z0-9][a-z0-9-]*$/;

/** Where everything lives inside `$OUTERWORLD_HOME` (brief §9). */
export function stationPaths(home: string) {
  return {
    home,
    stationJson: join(home, "station.json"),
    agentsDir: join(home, "agents"),
    agentDir: (id: string) => join(home, "agents", id),
    workspacesDir: join(home, "workspaces"),
    database: join(home, "station.db"),
    logsDir: join(home, "logs"),
    token: join(home, "daemon.token"),
  };
}

export interface LoadedAgent {
  readonly id: string;
  readonly config: AgentConfig;
  readonly documents: Readonly<Record<AgentDocumentName, string>>;
}

export interface LoadedStation {
  /** Undefined when station.json is missing or invalid; `issues` says why. */
  readonly station?: StationConfig;
  /** Valid agents only; an invalid agent is skipped with an issue so one bad file blocks nothing. */
  readonly agents: readonly LoadedAgent[];
  readonly issues: readonly Issue[];
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

const readJson = async (path: string, label: string): Promise<[unknown, Issue[]]> => {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return [
      undefined,
      [{ level: "error", path: label, message: code === "ENOENT" ? "missing" : String(error) }],
    ];
  }
  try {
    return [JSON.parse(text), []];
  } catch (error) {
    return [
      undefined,
      [{ level: "error", path: label, message: `not valid JSON: ${(error as Error).message}` }],
    ];
  }
};

const prefixed = (issues: readonly Issue[], prefix: string): Issue[] =>
  issues.map((i) => ({ ...i, path: i.path ? `${prefix}.${i.path}` : prefix }));

async function loadAgent(
  home: string,
  id: string,
): Promise<{ agent?: LoadedAgent; issues: Issue[] }> {
  const dir = stationPaths(home).agentDir(id);
  const [raw, readIssues] = await readJson(join(dir, "agent.json"), `agents/${id}/agent.json`);
  if (readIssues.length) return { issues: readIssues };
  const parsed = parseAgentConfig(raw);
  const issues = prefixed(parsed.issues, `agents/${id}/agent.json`);
  if (!parsed.ok) return { issues };
  const documents = {} as Record<AgentDocumentName, string>;
  for (const name of AGENT_DOCUMENTS) {
    let text = "";
    try {
      text = await readFile(join(dir, `${name}.md`), "utf8");
    } catch {
      // A missing document is an empty one; the editor creates it on first save.
    }
    if (Buffer.byteLength(text) > MAX_DOCUMENT_BYTES) {
      text = text.slice(0, MAX_DOCUMENT_BYTES);
      issues.push({
        level: "warn",
        path: `agents/${id}/${name}.md`,
        message: `longer than ${MAX_DOCUMENT_BYTES} bytes; truncated`,
      });
    }
    documents[name] = text;
  }
  return { agent: { id, config: parsed.value, documents }, issues };
}

/**
 * Reads station.json and every `agents/<id>/`. Never throws for bad data: everything it could not
 * prove becomes an issue. Symlinked agent directories are not followed.
 */
export async function loadStationDir(home: string): Promise<LoadedStation> {
  const paths = stationPaths(home);
  const issues: Issue[] = [];
  const [raw, readIssues] = await readJson(paths.stationJson, "station.json");
  let station: StationConfig | undefined;
  if (readIssues.length) issues.push(...readIssues);
  else {
    const parsed = parseStationConfig(raw);
    issues.push(...prefixed(parsed.issues, "station.json"));
    if (parsed.ok) station = parsed.value;
  }

  const agents: LoadedAgent[] = [];
  let entries: string[] = [];
  try {
    entries = (await readdir(paths.agentsDir)).sort();
  } catch {
    // No agents/ yet: a fresh station before onboarding.
  }
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    const info = await lstat(join(paths.agentsDir, name));
    if (info.isSymbolicLink()) {
      issues.push({ level: "warn", path: `agents/${name}`, message: "symbolic link not followed" });
      continue;
    }
    if (!info.isDirectory()) continue;
    if (!ID.test(name)) {
      issues.push({
        level: "error",
        path: `agents/${name}`,
        message: "agent directory must be a lowercase kebab id",
      });
      continue;
    }
    const { agent, issues: agentIssues } = await loadAgent(home, name);
    issues.push(...agentIssues);
    if (agent) agents.push(agent);
  }

  if (station) issues.push(...stationCrewIssues(station, agents));
  return { ...(station ? { station } : {}), agents, issues };
}

const assertValid = (issues: readonly Issue[], what: string) => {
  const errors = issues.filter((i) => i.level === "error");
  if (errors.length) {
    throw new Error(
      `${what} is invalid: ${errors.map((i) => `${i.path}: ${i.message}`).join("; ")}`,
    );
  }
};

/** Validates and atomically writes station.json. */
export async function saveStationConfig(home: string, station: StationConfig): Promise<void> {
  const parsed = parseStationConfig(station);
  assertValid(parsed.issues, "station.json");
  await writeFileAtomic(stationPaths(home).stationJson, json(station));
}

/** Validates and atomically writes `agents/<id>/agent.json`. */
export async function saveAgentConfig(
  home: string,
  id: string,
  config: AgentConfig,
): Promise<void> {
  if (!ID.test(id)) throw new Error(`agent id "${id}" must be a lowercase kebab id`);
  const parsed = parseAgentConfig(config);
  assertValid(parsed.issues, `agents/${id}/agent.json`);
  await writeFileAtomic(join(stationPaths(home).agentDir(id), "agent.json"), json(config));
}

/** Atomically writes one of the four agent documents. */
export async function saveAgentDocument(
  home: string,
  id: string,
  name: AgentDocumentName,
  text: string,
): Promise<void> {
  if (!ID.test(id)) throw new Error(`agent id "${id}" must be a lowercase kebab id`);
  if (!(AGENT_DOCUMENTS as readonly string[]).includes(name)) {
    throw new Error(`"${name}" is not an agent document`);
  }
  await writeFileAtomic(join(stationPaths(home).agentDir(id), `${name}.md`), text);
}
