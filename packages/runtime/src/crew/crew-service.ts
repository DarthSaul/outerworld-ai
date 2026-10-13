import { lstat, rm } from "node:fs/promises";
import {
  type AgentConfig,
  type AgentDocumentName,
  type AgentSchedule,
  type AgentView,
  type Budgets,
  type Connector,
  type ConnectorToolCatalog,
  type CreateAgentInput,
  type CreateLaneInput,
  type CreateRoomInput,
  type CreateScheduleInput,
  type CrewTemplate,
  DEFAULT_BUDGETS,
  DEFAULT_MODEL,
  type Issue,
  type Lane,
  NOTION_PRESET,
  type OnboardInput,
  parseAgentConfig,
  parseStationConfig,
  type Room,
  resolveGrants,
  type StationConfig,
  type StationView,
  slugify,
  stationCrewIssues,
  type TemplateInput,
  type UpdateAgentInput,
  type UpdateBudgetsInput,
  type UpdateRoomInput,
  type UpdateScheduleInput,
} from "@darthsaul/outerworld-ai-core";
import { cronIssue } from "../schedule/cron.js";
import type { EventStore } from "../storage/event-store.js";
import {
  type LoadedAgent,
  type LoadedStation,
  loadStationDir,
  saveAgentConfig,
  saveAgentDocument,
  saveStationConfig,
  stationPaths,
} from "../storage/station-dir.js";
import {
  COMMAND_ROOM,
  OPERATIONS_ROOM,
  overseerDocuments,
  projectManagerConfig,
  projectManagerDocuments,
} from "./templates.js";

export class NotFoundError extends Error {}

/** The change would make the station invalid. `issues` says how. */
export class ConflictError extends Error {
  constructor(
    message: string,
    readonly issues: readonly Issue[] = [],
  ) {
    super(message);
  }
}

export interface CrewServiceOptions {
  readonly home: string;
  readonly events: EventStore;
  /** Tools each connector exposes; empty until connectors connect (Phase 6). */
  readonly connectorTools?: () => ConnectorToolCatalog;
}

/** An update's fields that were actually given; `undefined` never overwrites a stored value. */
const given = <T extends object>(input: T): { [K in keyof T]?: Exclude<T[K], undefined> } =>
  Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]?: Exclude<T[K], undefined>;
  };

const errorKeys = (issues: readonly Issue[]) =>
  new Set(issues.filter((i) => i.level === "error").map((i) => `${i.path}\n${i.message}`));

/**
 * Crew and rooms as documents (Phase 2). Reads from disk on every call, so hand edits made while
 * the daemon runs are honored. Writes run one at a time, are validated against the whole station,
 * go to disk atomically, and then emit `agent.updated` or `station.updated`. A change is refused
 * only for errors it would introduce, never for problems that were already there.
 */
export class CrewService {
  readonly #home: string;
  readonly #events: EventStore;
  readonly #connectorTools: () => ConnectorToolCatalog;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(options: CrewServiceOptions) {
    this.#home = options.home;
    this.#events = options.events;
    this.#connectorTools = options.connectorTools ?? (() => ({}));
  }

  async view(): Promise<StationView> {
    const loaded = await loadStationDir(this.#home);
    return {
      ...(loaded.station ? { station: loaded.station } : {}),
      agents: loaded.agents.map((a) => ({ id: a.id, config: a.config })),
      issues: loaded.issues,
    };
  }

  async agent(id: string): Promise<AgentView | undefined> {
    const loaded = await loadStationDir(this.#home);
    const agent = loaded.agents.find((a) => a.id === id);
    return agent && loaded.station ? this.#agentView(agent, loaded.station) : undefined;
  }

  createAgent(input: CreateAgentInput): Promise<AgentView> {
    return this.#serial(async () => {
      const loaded = await this.#loadWithStation();
      const id = slugify(
        input.name,
        loaded.agents.map((a) => a.id),
      );
      const config: AgentConfig = {
        schemaVersion: 1,
        name: input.name,
        roomId: input.roomId,
        role: input.role ?? "crew",
        model: input.model ?? DEFAULT_MODEL,
        approvalMode: input.approvalMode ?? "ask",
        connectorGrants: [],
        schedules: [],
      };
      this.#checkCrew(loaded, { id, config });
      await saveAgentConfig(this.#home, id, config);
      await saveAgentDocument(this.#home, id, "identity", `# ${input.name}\n`);
      this.#events.append({ type: "agent.updated", agentId: id, payload: { change: "created" } });
      return this.#required(id);
    });
  }

  updateAgent(id: string, input: UpdateAgentInput): Promise<AgentView> {
    return this.#serial(async () => {
      const loaded = await this.#loadWithStation();
      const current = this.#find(loaded, id);
      const config = parseAgentConfig({ ...current.config, ...given(input) });
      if (!config.ok) throw new ConflictError("agent.json would be invalid", config.issues);
      this.#checkCrew(loaded, { id, config: config.value });
      await saveAgentConfig(this.#home, id, config.value);
      this.#events.append({ type: "agent.updated", agentId: id, payload: { change: "updated" } });
      return this.#required(id);
    });
  }

  /** Adds a schedule to agent.json; its id comes from the first words of the prompt. */
  addSchedule(agentId: string, input: CreateScheduleInput): Promise<AgentSchedule> {
    return this.#serial(async () => {
      const loaded = await this.#loadWithStation();
      const current = this.#find(loaded, agentId);
      const schedules = current.config.schedules;
      const id = slugify(
        input.prompt.split(/\s+/).slice(0, 4).join(" "),
        schedules.map((s) => s.id),
      );
      const schedule: AgentSchedule = {
        id,
        cron: input.cron,
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        prompt: input.prompt,
        catchUp: input.catchUp ?? false,
        enabled: input.enabled ?? true,
      };
      await this.#saveSchedules(loaded, current, [...schedules, schedule]);
      return schedule;
    });
  }

  updateSchedule(
    agentId: string,
    scheduleId: string,
    input: UpdateScheduleInput,
  ): Promise<AgentSchedule> {
    return this.#serial(async () => {
      const loaded = await this.#loadWithStation();
      const current = this.#find(loaded, agentId);
      const existing = this.#findSchedule(current, scheduleId);
      const { timezone, ...rest } = given(input);
      const { timezone: _dropped, ...withoutZone } = existing;
      const schedule: AgentSchedule = {
        ...(timezone === null ? withoutZone : existing),
        ...rest,
        ...(typeof timezone === "string" ? { timezone } : {}),
      };
      await this.#saveSchedules(
        loaded,
        current,
        current.config.schedules.map((s) => (s.id === scheduleId ? schedule : s)),
      );
      return schedule;
    });
  }

  removeSchedule(agentId: string, scheduleId: string): Promise<void> {
    return this.#serial(async () => {
      const loaded = await this.#loadWithStation();
      const current = this.#find(loaded, agentId);
      this.#findSchedule(current, scheduleId);
      await this.#saveSchedules(
        loaded,
        current,
        current.config.schedules.filter((s) => s.id !== scheduleId),
      );
    });
  }

  #findSchedule(agent: LoadedAgent, scheduleId: string): AgentSchedule {
    const found = agent.config.schedules.find((s) => s.id === scheduleId);
    if (!found) throw new NotFoundError(`no schedule "${scheduleId}" for "${agent.id}"`);
    return found;
  }

  /** Saves the schedules if agent.json stays valid and croner accepts every cron. */
  async #saveSchedules(
    loaded: LoadedStation & { station: StationConfig },
    agent: LoadedAgent,
    schedules: AgentSchedule[],
  ): Promise<void> {
    const config = parseAgentConfig({ ...agent.config, schedules });
    if (!config.ok) throw new ConflictError("agent.json would be invalid", config.issues);
    const cronIssues: Issue[] = config.value.schedules.flatMap((s, i) => {
      const problem = cronIssue(s.cron, s.timezone);
      return problem
        ? [{ level: "error" as const, path: `schedules.${i}.cron`, message: problem }]
        : [];
    });
    if (cronIssues.length) throw new ConflictError("the schedule's cron cannot run", cronIssues);
    this.#checkCrew(loaded, { id: agent.id, config: config.value });
    await saveAgentConfig(this.#home, agent.id, config.value);
    this.#events.append({
      type: "agent.updated",
      agentId: agent.id,
      payload: { change: "updated" },
    });
  }

  putDocument(id: string, name: AgentDocumentName, text: string): Promise<void> {
    return this.#serial(async () => {
      this.#find(await loadStationDir(this.#home), id);
      await saveAgentDocument(this.#home, id, name, text);
      this.#events.append({ type: "agent.updated", agentId: id, payload: { change: "updated" } });
    });
  }

  /** Removes `agents/<id>/`. The agent's workspace files stay on disk. */
  deleteAgent(id: string): Promise<void> {
    return this.#serial(async () => {
      this.#find(await loadStationDir(this.#home), id);
      const dir = stationPaths(this.#home).agentDir(id);
      if ((await lstat(dir)).isSymbolicLink()) throw new ConflictError(`agents/${id} is a link`);
      await rm(dir, { recursive: true });
      this.#events.append({ type: "agent.updated", agentId: id, payload: { change: "deleted" } });
    });
  }

  /**
   * Onboarding (brief §17): on a station with no station.json yet, writes one with the Command
   * room and the default budgets (D22), and creates the Overseer there. Refused once a station
   * exists.
   */
  onboard(input: OnboardInput): Promise<AgentView> {
    return this.#serial(async () => {
      const loaded = await loadStationDir(this.#home);
      if (loaded.station) throw new ConflictError("this station is already set up");
      const station: StationConfig = {
        schemaVersion: 1,
        name: input.stationName ?? "My Station",
        rooms: [COMMAND_ROOM],
        lanes: [],
        connectors: [],
        budgets: { ...DEFAULT_BUDGETS },
        dispatch: { maxDepth: 1, autoReview: true },
      };
      const parsed = parseStationConfig(station);
      if (!parsed.ok) throw new ConflictError("station.json would be invalid", parsed.issues);
      const id = slugify(
        input.overseerName,
        loaded.agents.map((a) => a.id),
      );
      const config: AgentConfig = {
        schemaVersion: 1,
        name: input.overseerName,
        roomId: COMMAND_ROOM.id,
        role: "overseer",
        model: DEFAULT_MODEL,
        approvalMode: "ask",
        connectorGrants: [],
        schedules: [],
      };
      await saveStationConfig(this.#home, parsed.value);
      await this.#writeAgent(id, config, overseerDocuments(input.overseerName, input.tone));
      this.#events.append({ type: "station.updated", payload: {} });
      this.#events.append({ type: "agent.updated", agentId: id, payload: { change: "created" } });
      return this.#required(id);
    });
  }

  /**
   * Adds a crew member from a template (brief §17). The Project Manager brings what it needs:
   * the Operations room (with a hallway to Command when that room exists) and the Notion
   * connector, each only when missing. Its daily briefing starts disabled.
   */
  addFromTemplate(template: CrewTemplate, input: TemplateInput): Promise<AgentView> {
    return this.#serial(async () => {
      if (template !== "project-manager") throw new NotFoundError(`no template "${template}"`);
      const loaded = await this.#loadWithStation();
      const station = loaded.station;
      const name = input.name ?? "Project Manager";
      const rooms = station.rooms.some((r) => r.id === OPERATIONS_ROOM.id)
        ? station.rooms
        : [...station.rooms, OPERATIONS_ROOM];
      const addLane =
        !station.rooms.some((r) => r.id === OPERATIONS_ROOM.id) &&
        station.rooms.some((r) => r.id === COMMAND_ROOM.id);
      const lanes = addLane
        ? [
            ...station.lanes,
            { id: "operations-to-command", from: OPERATIONS_ROOM.id, to: COMMAND_ROOM.id },
          ]
        : station.lanes;
      const connectors = station.connectors.some((c) => c.id === NOTION_PRESET.id)
        ? station.connectors
        : [...station.connectors, NOTION_PRESET];
      const id = slugify(
        name,
        loaded.agents.map((a) => a.id),
      );
      const config = projectManagerConfig(name, DEFAULT_MODEL);
      const next = { ...station, rooms, lanes, connectors };
      if (rooms !== station.rooms || lanes !== station.lanes || connectors !== station.connectors) {
        await this.#saveStation(loaded, next);
      }
      this.#checkCrew({ ...loaded, station: next }, { id, config });
      await this.#writeAgent(id, config, projectManagerDocuments(name));
      this.#events.append({ type: "agent.updated", agentId: id, payload: { change: "created" } });
      return this.#required(id);
    });
  }

  async #writeAgent(
    id: string,
    config: AgentConfig,
    documents: Record<AgentDocumentName, string>,
  ): Promise<void> {
    await saveAgentConfig(this.#home, id, config);
    for (const [name, text] of Object.entries(documents) as [AgentDocumentName, string][]) {
      if (text) await saveAgentDocument(this.#home, id, name, text);
    }
  }

  createRoom(input: CreateRoomInput): Promise<Room> {
    return this.#serial(async () => {
      const loaded = await this.#loadWithStation();
      const station = loaded.station;
      const room: Room = {
        id: slugify(
          input.name,
          station.rooms.map((r) => r.id),
        ),
        name: input.name,
        ...(input.description !== undefined ? { description: input.description } : {}),
        props: input.props ?? [],
      };
      await this.#saveStation(loaded, { ...station, rooms: [...station.rooms, room] });
      return room;
    });
  }

  updateRoom(id: string, input: UpdateRoomInput): Promise<Room> {
    return this.#serial(async () => {
      const loaded = await this.#loadWithStation();
      const station = loaded.station;
      const current = station.rooms.find((r) => r.id === id);
      if (!current) throw new NotFoundError(`no room "${id}"`);
      const room: Room = { ...current, ...given(input) };
      await this.#saveStation(loaded, {
        ...station,
        rooms: station.rooms.map((r) => (r.id === id ? room : r)),
      });
      return room;
    });
  }

  /** Refused while crew live in the room or a hallway touches it. */
  deleteRoom(id: string): Promise<void> {
    return this.#serial(async () => {
      const loaded = await this.#loadWithStation();
      const station = loaded.station;
      if (!station.rooms.some((r) => r.id === id)) throw new NotFoundError(`no room "${id}"`);
      const crew = loaded.agents.filter((a) => a.config.roomId === id).map((a) => a.id);
      if (crew.length) throw new ConflictError(`room "${id}" still has crew: ${crew.join(", ")}`);
      const lanes = station.lanes.filter((l) => l.from === id || l.to === id).map((l) => l.id);
      if (lanes.length)
        throw new ConflictError(`room "${id}" still has hallways: ${lanes.join(", ")}`);
      await this.#saveStation(loaded, {
        ...station,
        rooms: station.rooms.filter((r) => r.id !== id),
      });
    });
  }

  /**
   * Opens a hallway between two rooms (ADR-0013 #8). Config only: hallways are drawn in v1 and
   * enforced in v2. Refused when the rooms are the same or already linked in either direction.
   */
  createLane(input: CreateLaneInput): Promise<Lane> {
    return this.#serial(async () => {
      const loaded = await this.#loadWithStation();
      const station = loaded.station;
      for (const end of [input.from, input.to]) {
        if (!station.rooms.some((r) => r.id === end)) throw new NotFoundError(`no room "${end}"`);
      }
      if (input.from === input.to) throw new ConflictError("a hallway needs two different rooms");
      const linked = station.lanes.find(
        (l) =>
          (l.from === input.from && l.to === input.to) ||
          (l.from === input.to && l.to === input.from),
      );
      if (linked) throw new ConflictError(`rooms already linked by hallway "${linked.id}"`);
      const lane: Lane = {
        id: slugify(
          `${input.from} to ${input.to}`,
          station.lanes.map((l) => l.id),
        ),
        from: input.from,
        to: input.to,
        ...(input.note !== undefined ? { note: input.note } : {}),
      };
      await this.#saveStation(loaded, { ...station, lanes: [...station.lanes, lane] });
      return lane;
    });
  }

  /** Closes a hallway. */
  deleteLane(id: string): Promise<void> {
    return this.#serial(async () => {
      const loaded = await this.#loadWithStation();
      const station = loaded.station;
      if (!station.lanes.some((l) => l.id === id)) throw new NotFoundError(`no hallway "${id}"`);
      await this.#saveStation(loaded, {
        ...station,
        lanes: station.lanes.filter((l) => l.id !== id),
      });
    });
  }

  /** Sets each cap given; `null` removes it. Takes effect before the next model call. */
  updateBudgets(input: UpdateBudgetsInput): Promise<Budgets> {
    return this.#serial(async () => {
      const loaded = await this.#loadWithStation();
      const budgets: Record<string, unknown> = { ...loaded.station.budgets };
      for (const [k, v] of Object.entries(input)) {
        if (v === null) delete budgets[k];
        else if (v !== undefined) budgets[k] = v;
      }
      await this.#saveStation(loaded, { ...loaded.station, budgets: budgets as Budgets });
      return budgets as Budgets;
    });
  }

  addConnector(connector: Connector): Promise<Connector> {
    return this.#serial(async () => {
      const loaded = await this.#loadWithStation();
      const station = loaded.station;
      if (station.connectors.some((c) => c.id === connector.id)) {
        throw new ConflictError(`connector "${connector.id}" is already installed`);
      }
      await this.#saveStation(loaded, {
        ...station,
        connectors: [...station.connectors, connector],
      });
      return connector;
    });
  }

  updateConnector(id: string, input: { url?: string; name?: string }): Promise<Connector> {
    return this.#serial(async () => {
      const loaded = await this.#loadWithStation();
      const station = loaded.station;
      const current = station.connectors.find((c) => c.id === id);
      if (!current) throw new NotFoundError(`no connector "${id}"`);
      const next: Connector = {
        ...current,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.url !== undefined
          ? { transport: { type: "http" as const, url: input.url } }
          : {}),
      };
      await this.#saveStation(loaded, {
        ...station,
        connectors: station.connectors.map((c) => (c.id === id ? next : c)),
      });
      return next;
    });
  }

  /** Refused while any crew member is still granted it (their agent.json would break). */
  removeConnector(id: string): Promise<void> {
    return this.#serial(async () => {
      const loaded = await this.#loadWithStation();
      const station = loaded.station;
      if (!station.connectors.some((c) => c.id === id))
        throw new NotFoundError(`no connector "${id}"`);
      const users = loaded.agents
        .filter((a) => a.config.connectorGrants.includes(id))
        .map((a) => a.id);
      if (users.length) {
        throw new ConflictError(`connector "${id}" is still granted to: ${users.join(", ")}`);
      }
      await this.#saveStation(loaded, {
        ...station,
        connectors: station.connectors.filter((c) => c.id !== id),
      });
    });
  }

  /** Takes a connector away from every crew member who has it. */
  async removeConnectorGrants(id: string): Promise<void> {
    const loaded = await loadStationDir(this.#home);
    for (const a of loaded.agents) {
      if (!a.config.connectorGrants.includes(id)) continue;
      await this.updateAgent(a.id, {
        connectorGrants: a.config.connectorGrants.filter((g) => g !== id),
      });
    }
  }

  /** Runs `task` after every earlier write has settled, so read-modify-write never interleaves. */
  #serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.#queue.then(task, task);
    this.#queue = run.catch(() => undefined);
    return run;
  }

  async #loadWithStation(): Promise<LoadedStation & { station: StationConfig }> {
    const loaded = await loadStationDir(this.#home);
    if (!loaded.station) {
      throw new ConflictError("no valid station.json yet; onboarding creates it", loaded.issues);
    }
    return loaded as LoadedStation & { station: StationConfig };
  }

  #find(loaded: LoadedStation, id: string): LoadedAgent {
    const agent = loaded.agents.find((a) => a.id === id);
    if (!agent) throw new NotFoundError(`no agent "${id}"`);
    return agent;
  }

  #checkCrew(
    loaded: LoadedStation & { station: StationConfig },
    next: { id: string; config: AgentConfig },
  ) {
    const before = stationCrewIssues(loaded.station, loaded.agents);
    const crew = [...loaded.agents.filter((a) => a.id !== next.id), next];
    const after = stationCrewIssues(loaded.station, crew);
    const known = errorKeys(before);
    const introduced = after.filter(
      (i) => i.level === "error" && !known.has(`${i.path}\n${i.message}`),
    );
    if (introduced.length) {
      throw new ConflictError(introduced.map((i) => i.message).join("; "), introduced);
    }
  }

  async #saveStation(loaded: LoadedStation, station: StationConfig) {
    const parsed = parseStationConfig(station);
    const known = errorKeys(
      loaded.issues.map((i) => ({ ...i, path: i.path.replace(/^station\.json\./, "") })),
    );
    const introduced = parsed.issues.filter(
      (i) => i.level === "error" && !known.has(`${i.path}\n${i.message}`),
    );
    if (introduced.length) {
      throw new ConflictError(
        introduced.map((i) => `${i.path}: ${i.message}`).join("; "),
        introduced,
      );
    }
    await saveStationConfig(this.#home, station);
    this.#events.append({ type: "station.updated", payload: {} });
  }

  async #required(id: string): Promise<AgentView> {
    const view = await this.agent(id);
    if (!view) throw new NotFoundError(`no agent "${id}"`);
    return view;
  }

  #agentView(agent: LoadedAgent, station: StationConfig): AgentView {
    return {
      id: agent.id,
      config: agent.config,
      documents: agent.documents,
      tools: resolveGrants(agent.config, station, this.#connectorTools()),
    };
  }
}
