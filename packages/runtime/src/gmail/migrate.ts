import {
  GMAIL_MCP_URL,
  GMAIL_PRESET,
  legacyGmailServer,
  migrateLegacyGmail,
  parseStationConfig,
} from "@darthsaul/outerworld-ai-core";
import { connectorSecretKey } from "../mcp/oauth-provider.js";
import type { SecretStore } from "../secrets/store.js";
import type { EventStore } from "../storage/event-store.js";
import { loadStationDir, saveStationConfig } from "../storage/station-dir.js";

type Kind = "own" | "tokens" | "client";
const key = (server: string, kind: Kind) => connectorSecretKey(GMAIL_PRESET.id, server, kind);
const NEW_SERVER = JSON.stringify(GMAIL_PRESET.transport);

/**
 * The Gmail MCP sign-in under the `gmail` id, moved to the Gmail service: its OAuth app is copied
 * over unless one is there already, then the MCP server's entries are deleted (its tokens were
 * issued for another resource). Safe to run again: it only touches entries that still exist.
 */
async function moveLegacySecrets(secrets: SecretStore, legacyServer: string): Promise<void> {
  const own = await secrets.get(key(legacyServer, "own"));
  if (own && !(await secrets.get(key(NEW_SERVER, "own")))) {
    await secrets.set(key(NEW_SERVER, "own"), own);
  }
  for (const kind of ["own", "tokens", "client"] as const) {
    if (await secrets.get(key(legacyServer, kind))) await secrets.delete(key(legacyServer, kind));
  }
}

interface Options {
  home: string;
  secrets: SecretStore;
  events?: EventStore;
}

/** Drops the `migratedFrom` record from the `gmail` connector once its old sign-in is gone. */
async function clearRecord(options: Options): Promise<void> {
  const station = (await loadStationDir(options.home)).station;
  if (!station) return;
  const connectors = station.connectors.map((c) => {
    if (c.id !== GMAIL_PRESET.id || legacyGmailServer(c) === undefined) return c;
    const { migratedFrom: _done, ...rest } = c;
    return rest;
  });
  const next = parseStationConfig({ ...station, connectors });
  if (!next.ok) return;
  await saveStationConfig(options.home, next.value);
  options.events?.append({ type: "station.updated", payload: {} });
}

/**
 * Before ADR-0022, the `gmail` connector was Google's Gmail MCP server. Moves such a station onto
 * the Gmail API service, at daemon start before anything else writes station.json:
 * - station.json: the connector keeps its id (crew grants and the registered redirect URL hold)
 *   and gets the service's transport, with the exact old URL recorded as `migratedFrom`;
 * - keychain: the Commander's own OAuth app moves over, so they only sign in again, and the MCP
 *   server's entries (keyed by that exact URL) are deleted;
 * - then the `migratedFrom` record is dropped.
 *
 * A cleanup that fails part-way is finished on a later start under the recorded URL. A station
 * moved before the record existed is cleaned under the MCP server's usual URL. Returns whether
 * station.json was moved.
 */
export async function migrateLegacyGmailConnector(options: Options): Promise<boolean> {
  const loaded = await loadStationDir(options.home);
  const station = loaded.station;
  if (!station) return false;
  const connectors = migrateLegacyGmail(station.connectors);
  const gmail = station.connectors.find((c) => c.id === GMAIL_PRESET.id);

  if (connectors === station.connectors) {
    // Already moved (or never there): finish any keychain cleanup an earlier start left behind.
    if (gmail?.transport.type !== "builtin") return false;
    const recorded = legacyGmailServer(gmail);
    await moveLegacySecrets(options.secrets, recorded ?? GMAIL_MCP_URL);
    if (recorded !== undefined) await clearRecord(options);
    return false;
  }

  const legacyServer = gmail?.transport.type === "http" ? gmail.transport.url : GMAIL_MCP_URL;
  const next = parseStationConfig({ ...station, connectors });
  if (!next.ok) return false;
  // The OAuth app is copied before station.json changes, so a failure here leaves nothing lost.
  const own = await options.secrets.get(key(legacyServer, "own"));
  if (own && !(await options.secrets.get(key(NEW_SERVER, "own")))) {
    await options.secrets.set(key(NEW_SERVER, "own"), own);
  }
  // Saved with `migratedFrom`, so a later start can retry the cleanup under this exact URL.
  await saveStationConfig(options.home, next.value);
  options.events?.append({ type: "station.updated", payload: {} });
  await moveLegacySecrets(options.secrets, legacyServer);
  await clearRecord(options);
  return true;
}
