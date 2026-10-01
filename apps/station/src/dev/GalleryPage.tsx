import { type LedgerFiles, parseLedger, parseStation } from "@darthsaul/outerworld-ai-core";
import stationJson from "../../../../fixtures/map-demo/station.json";
import { Gallery } from "./Gallery.js";

/** Milestone 1 map fixture (D14), bundled only into the lazily loaded gallery chunk. */
const ledgerFiles = import.meta.glob("../../../../fixtures/map-demo/ledger/**/*", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const PREFIX = "../../../../fixtures/map-demo/ledger/";
export const FIXTURE_AS_OF = "2026-09-27T15:00:00Z";

/** Every component in every state, always from the fixture, never from the daemon. */
export default function GalleryPage() {
  const parsed = parseStation(stationJson);
  if (!parsed.ok) throw new Error(`map fixture invalid: ${JSON.stringify(parsed.issues)}`);
  const files: LedgerFiles = Object.fromEntries(
    Object.entries(ledgerFiles).map(([path, text]) => [path.slice(PREFIX.length), text]),
  );
  const state = parseLedger(parsed.value, files, {
    now: FIXTURE_AS_OF,
    sourcePath: "fixtures/map-demo/ledger",
  });
  return <Gallery station={parsed.value} state={state} />;
}
