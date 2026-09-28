import { loadFixture } from "../../lib/ledger";
import { Gallery } from "./Gallery";

/** The gallery is regenerated per request like the dashboard; it always shows the fixture. */
export const dynamic = "force-dynamic";

/** Component gallery: the server loads the demo fixture (never a real ledger); the client-side Gallery renders every component in every state. */
export default function DevPage() {
  const { station, state } = loadFixture();
  return <Gallery station={station} state={state} />;
}
