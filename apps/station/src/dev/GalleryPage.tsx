import {
  type DashboardInput,
  parseAgentConfig,
  parseStationConfig,
} from "@darthsaul/outerworld-ai-core";
import quill from "../../../../fixtures/demo-station/agents/quill/agent.json";
import vesper from "../../../../fixtures/demo-station/agents/vesper/agent.json";
import wren from "../../../../fixtures/demo-station/agents/wren/agent.json";
import stationJson from "../../../../fixtures/demo-station/station.json";
import { Gallery } from "./Gallery.js";

/** The demo station (D25), bundled only into the lazily loaded gallery chunk. */
function demoInput(): DashboardInput {
  const station = parseStationConfig(stationJson);
  if (!station.ok) throw new Error(`demo station invalid: ${JSON.stringify(station.issues)}`);
  const agents = Object.entries({ quill, vesper, wren }).map(([id, json]) => {
    const config = parseAgentConfig(json);
    if (!config.ok) throw new Error(`demo agent ${id} invalid`);
    return { id, config: config.value };
  });
  return {
    station: station.value,
    agents,
    activity: {},
    runs: [],
    dispatches: [],
    activeRunCount: 0,
    pendingMemoryProposals: 0,
  };
}

/** Every component in every state, always from the fixture, never from the daemon. */
export default function GalleryPage() {
  return <Gallery input={demoInput()} />;
}
