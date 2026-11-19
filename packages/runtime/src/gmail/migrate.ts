import {
  GMAIL_MCP_URL,
  GMAIL_PRESET,
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

/**
 * Before ADR-0022, the `gmail` connector was Google's Gmail MCP server. Moves such a station onto
 * the Gmail API service, at daemon start before anything else writes station.json:
 * - station.json: the connector keeps its id (crew grants and the registered redirect URL hold)
 *   and gets the service's transport;
 * - keychain: the Commander's own OAuth app moves over, so they only sign in again, and the MCP
 *   server's entries are deleted.
 *
 * The keychain step also runs on later starts once station.json is moved, so a cleanup that
 * failed part-way is finished next time (for the MCP server's usual URL; station.json no longer
 * records another spelling). Returns whether station.json was moved. Matches the MCP server
 * however its URL was spelled.
 */
export async function migrateLegacyGmailConnector(options: {
  home: string;
  secrets: SecretStore;
  events?: EventStore;
}): Promise<boolean> {
  const loaded = await loadStationDir(options.home);
  const station = loaded.station;
  if (!station) return false;
  const connectors = migrateLegacyGmail(station.connectors);
  const gmail = station.connectors.find((c) => c.id === GMAIL_PRESET.id);

  if (connectors === station.connectors) {
    // Already moved (or never there): finish any keychain cleanup an earlier start left behind.
    if (gmail?.transport.type === "builtin")
      await moveLegacySecrets(options.secrets, GMAIL_MCP_URL);
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
  await saveStationConfig(options.home, next.value);
  options.events?.append({ type: "station.updated", payload: {} });
  await moveLegacySecrets(options.secrets, legacyServer);
  return true;
}
