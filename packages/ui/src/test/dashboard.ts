import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Dashboard,
  type DashboardInput,
  dashboardModel,
  parseAgentConfig,
  parseStationConfig,
} from "@darthsaul/outerworld-ai-core";

/** Test-only: the demo station (fixtures/demo-station) as dashboard input. */
const here = dirname(fileURLToPath(import.meta.url));
const home = join(here, "..", "..", "..", "..", "fixtures", "demo-station");
const read = (path: string) => JSON.parse(readFileSync(join(home, path), "utf8"));

export function demoInput(over: Partial<DashboardInput> = {}): DashboardInput {
  const station = parseStationConfig(read("station.json"));
  if (!station.ok) throw new Error("fixture station invalid");
  const agents = ["quill", "vesper", "wren"].map((id) => {
    const config = parseAgentConfig(read(`agents/${id}/agent.json`));
    if (!config.ok) throw new Error(`fixture agent ${id} invalid`);
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
    ...over,
  };
}

export function demoDashboard(over: Partial<DashboardInput> = {}): Dashboard {
  return dashboardModel(demoInput(over));
}
