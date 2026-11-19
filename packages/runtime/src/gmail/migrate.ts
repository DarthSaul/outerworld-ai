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

/**
 * Before ADR-0022, the `gmail` connector was Google's Gmail MCP server. Moves such a station onto
 * the Gmail API service, once, at daemon start before anything else writes station.json:
 * - station.json: the connector keeps its id (crew grants and the registered redirect URL hold)
 *   and gets the service's transport;
 * - keychain: the Commander's own OAuth app moves over, so they only sign in again. The MCP
 *   server's tokens and registration are deleted: they were issued for another resource.
 *
 * Returns whether anything moved. Matches the MCP server however its URL was spelled.
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
  if (connectors === station.connectors) return false;

  const before = station.connectors.find((c) => c.id === GMAIL_PRESET.id);
  const legacyServer = before?.transport.type === "http" ? before.transport.url : GMAIL_MCP_URL;
  const next = parseStationConfig({ ...station, connectors });
  if (!next.ok) return false;

  const key = (server: string, kind: "own" | "tokens" | "client") =>
    connectorSecretKey(GMAIL_PRESET.id, server, kind);
  const newServer = JSON.stringify(GMAIL_PRESET.transport);
  const own = await options.secrets.get(key(legacyServer, "own"));
  if (own && !(await options.secrets.get(key(newServer, "own")))) {
    await options.secrets.set(key(newServer, "own"), own);
  }
  await saveStationConfig(options.home, next.value);
  for (const kind of ["own", "tokens", "client"] as const) {
    await options.secrets.delete(key(legacyServer, kind));
  }
  options.events?.append({ type: "station.updated", payload: {} });
  return true;
}
