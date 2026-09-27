import { loadLedger } from "../../lib/ledger";
import { Gallery } from "./Gallery";

/** The fixture's "as of" moment, so the gallery is deterministic for screenshots. */
const FIXTURE_AS_OF = "2026-09-27T15:00:00Z";

/** Component gallery: the server loads the fixture; the client-side Gallery renders every component in every state. */
export default function DevPage() {
  const { station, state } = loadLedger({ now: FIXTURE_AS_OF });
  return <Gallery station={station} state={state} />;
}
