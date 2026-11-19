import {
  AGENT_DOCUMENTS,
  type AgentConfig,
  type AgentDocumentName,
  type AgentView,
  type ApprovalMode,
  abilityDisplay,
  characterById,
  connectorDisplay,
  type EffectiveTool,
  findModel,
  lookFor,
  type StationConfig,
  term,
  termWith,
  toolDisplay,
} from "@darthsaul/outerworld-ai-core";
import {
  Checkbox,
  CrewSelect,
  type CrewSelectAgent,
  Panel,
  PanelTabs,
  PixelIcon,
  roomColorVar,
  Sprite,
  stVar,
  Tag,
} from "@darthsaul/outerworld-ai-ui";
import { type FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { AbilityLogo } from "../components/AbilityLogo.js";
import { ErrorNote } from "../components/ErrorNote.js";
import { Markdown } from "../components/Markdown.js";
import { ScrollArea } from "../components/ScrollArea.js";
import { ROUTES } from "../lib/routes.js";
import {
  useAgent,
  useConnectors,
  useDeleteAgent,
  useModels,
  useSaveDocument,
  useSetLook,
  useStationView,
  useUpdateAgent,
} from "../queries.js";
import { useDashboard } from "../station/use-dashboard.js";
import { AgentMemory } from "./MemoryPage.js";
import { SchedulesBrief, SchedulesSection } from "./Schedules.js";

/** The design's quiet outline button, as a class so submit buttons can use it too. */
const button =
  "cursor-pointer border-2 border-line bg-transparent px-2.5 py-1.5 font-display text-d7 text-panel-title uppercase hover:border-cyan disabled:cursor-not-allowed disabled:opacity-50";
const input = "border-2 border-line-soft bg-well px-2 py-1 font-body text-b19 text-fg-hi";
const field = "flex flex-col gap-1 font-display text-d7 text-fg-mute uppercase";
const label = "font-display text-d7 text-fg-mute uppercase";
/** A panel around one part of the page. */
const panel = "flex flex-col gap-3 border-2 border-line bg-panel p-3 shadow-panel";

const sourceLabel = (t: EffectiveTool) => {
  switch (t.source.kind) {
    case "role":
      return term("tools.source.role");
    case "prop":
      return `${term("grant")}: ${term(`prop.${t.source.prop}`)}`;
    case "connector":
      return `${term("connector")}: ${t.source.connectorId}`;
    case "skill":
      return term("tools.source.skill");
  }
};

/** A granted connector's tools, together: a grant is all of a connector's tools (ADR-0012). */
const connectorGroups = (tools: readonly EffectiveTool[]) => {
  const groups = new Map<string, EffectiveTool[]>();
  for (const t of tools) {
    if (t.source.kind !== "connector") continue;
    groups.set(t.source.connectorId, [...(groups.get(t.source.connectorId) ?? []), t]);
  }
  return [...groups].map(([id, list]) => ({ id, tools: list }));
};

/** A tool's class, as a tag: write is amber, since it waits for consent on Ask first. */
function ClassChip({ toolClass }: { readonly toolClass: EffectiveTool["class"] }) {
  return <Tag tone={toolClass === "write" ? "amber" : "mute"}>{term(`grant.${toolClass}`)}</Tag>;
}

const item = "flex min-w-0 items-start gap-2.5 border-2 border-line-faint bg-well p-2";
const iconBox = "flex shrink-0 border-2 border-line-soft bg-tile p-1.5 text-cyan";

/** One built-in tool: its readable name and what it does, then its class, code name, and source. */
function ToolItem({ tool }: { readonly tool: EffectiveTool }) {
  const shown = toolDisplay(tool.name);
  return (
    <li data-tool={tool.name} data-class={tool.class} className={item}>
      <span className={iconBox}>
        <PixelIcon name={shown.icon} />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-b19 text-fg-hi" data-tool-title>
            {shown.title}
          </span>
          <ClassChip toolClass={tool.class} />
        </div>
        {shown.description ? (
          <p className="m-0 text-b16 text-fg-soft">{shown.description}</p>
        ) : null}
        <p className="m-0 text-b15 text-fg-mute" data-tool-source>
          <code>{tool.name}</code> · {sourceLabel(tool)}
        </p>
      </div>
    </li>
  );
}

/**
 * One granted connector: full access, how many tools and of which class, and its tools on request
 * in a box that scrolls (a connector can offer dozens).
 */
function ConnectorItem({
  name,
  tools,
}: {
  readonly name: string;
  readonly tools: readonly EffectiveTool[];
}) {
  const shown = connectorDisplay(name);
  const writes = tools.filter((t) => t.class === "write").length;
  return (
    <li data-connector-tools={name} className={item}>
      <span className={iconBox}>
        <PixelIcon name={shown.icon} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-b19 text-fg-hi">
            {term("connector")}: {shown.title}
          </span>
          <Tag tone="cyan">{term("tools.connector.full")}</Tag>
        </div>
        <p className="m-0 text-b16 text-fg-soft">
          {termWith("tools.connector.count", {
            count: String(tools.length),
            read: String(tools.length - writes),
            write: String(writes),
          })}
        </p>
        <details>
          <summary className="cursor-pointer font-display text-cyan text-d7 uppercase">
            {term("tools.connector.show")}
          </summary>
          <ul className="m-0 mt-1 flex max-h-40 list-none flex-col gap-0.5 overflow-y-auto overscroll-y-contain border border-line-faint bg-well-2 p-2 text-b16 text-fg-soft">
            {tools.map((t) => (
              <li key={t.name} data-tool={t.name} data-class={t.class}>
                {t.name} · {term(`grant.${t.class}`)}
              </li>
            ))}
          </ul>
        </details>
      </div>
    </li>
  );
}

/** Granted connectors that contribute no tools yet (not connected), by display name. */
const pendingConnectors = (a: AgentView, station: StationConfig) =>
  a.config.connectorGrants
    .filter(
      (id) => !a.tools.some((t) => t.source.kind === "connector" && t.source.connectorId === id),
    )
    .map((id) => station.connectors.find((c) => c.id === id)?.name ?? id);

/** One markdown document with its own save state, so editing one never loses another. */
function DocumentEditor({
  agentId,
  name,
  saved,
}: {
  readonly agentId: string;
  readonly name: AgentDocumentName;
  readonly saved: string;
}) {
  const save = useSaveDocument(agentId);
  // null until edited: an unedited editor always shows the latest saved text (from this tab,
  // another tab, or a hand edit on disk); an edit in progress is never overwritten.
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? saved;
  const dirty = draft !== null && draft !== saved;
  const id = `doc-${name}`;
  return (
    <div className="flex flex-col gap-1.5" data-document={name}>
      <label htmlFor={id} className={label}>
        {term(`document.${name}`)}
      </label>
      <textarea
        id={id}
        className="border-2 border-line-soft bg-well p-2 font-body text-b17 text-fg-hi"
        value={text}
        rows={8}
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={button}
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate({ name, text }, { onSuccess: () => setDraft(null) })}
        >
          Save {term(`document.${name}`).toLowerCase()}
        </button>
        <span className="text-b17 text-fg-mute" aria-live="polite">
          {save.isPending ? "saving…" : dirty ? "unsaved" : "saved"}
        </span>
      </div>
      <ErrorNote error={save.error} />
    </div>
  );
}

/** The config fields this form edits; each is present only once the Commander changed it. */
type Draft = Partial<Pick<AgentConfig, "name" | "roomId" | "role" | "model" | "approvalMode">>;

/**
 * Config's Connectors: every connector installed on the station, one full-width row each with its
 * logo, name, kind, status, and what it does, and a box to grant it. A grant saves at once and is
 * all of a connector's tools (ADR-0012); with none installed, it points to Abilities.
 */
function ConnectorGrants({
  agent,
  station,
}: {
  readonly agent: AgentView;
  readonly station: StationConfig;
}) {
  const update = useUpdateAgent(agent.id);
  const live = useConnectors();
  const granted = new Set(agent.config.connectorGrants);
  const toggle = (id: string) =>
    update.mutate({
      connectorGrants: granted.has(id)
        ? agent.config.connectorGrants.filter((g) => g !== id)
        : [...agent.config.connectorGrants, id],
    });
  return (
    <Panel title={term("connectors")}>
      <div className="flex flex-col gap-3 p-3">
        <p className="m-0 text-b17 text-fg-soft">{term("agentConnectors.hint")}</p>
        {station.connectors.length === 0 ? (
          <p className="m-0 text-b17 text-fg-mute">
            {term("agentConnectors.none")}{" "}
            <Link to={ROUTES.discover} className="text-cyan underline hover:text-fg-hi">
              {term("agentConnectors.discover")}
            </Link>
          </p>
        ) : (
          <ul data-connector-grants className="m-0 flex list-none flex-col gap-2 p-0">
            {station.connectors.map((c) => {
              const shown = abilityDisplay(c.id, c.name);
              const on = granted.has(c.id);
              const state = live.data?.find((l) => l.id === c.id);
              const writes = state?.tools.filter((t) => t.class === "write").length ?? 0;
              return (
                <li
                  key={c.id}
                  data-connector-grant={c.id}
                  data-granted={on}
                  className={`flex min-w-0 items-start gap-3 border-2 p-2.5 ${on ? "border-cyan bg-active-bg" : "border-line-faint bg-well"}`}
                >
                  <AbilityLogo brand={shown.brand} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-display text-cyan text-d9 uppercase">
                        {shown.title}
                      </span>
                      <Tag>{term(`ability.kind.${shown.kind}`)}</Tag>
                      {state ? (
                        <span
                          data-connector-status={state.status}
                          className={`text-b15 ${state.status === "connected" ? "text-green" : "text-amber"}`}
                        >
                          {term(`connectorStatus.${state.status}`)}
                        </span>
                      ) : null}
                    </div>
                    <p className="m-0 text-b17 text-fg-soft">{shown.description}</p>
                    {state && state.tools.length > 0 ? (
                      <p className="m-0 text-b15 text-fg-mute" data-connector-count>
                        {termWith("tools.connector.count", {
                          count: String(state.tools.length),
                          read: String(state.tools.length - writes),
                          write: String(writes),
                        })}
                      </p>
                    ) : null}
                  </div>
                  <Checkbox
                    label={term("agentConnectors.grant")}
                    aria-label={termWith("agentConnectors.grantName", { name: c.name })}
                    checked={on}
                    disabled={update.isPending}
                    onChange={() => toggle(c.id)}
                    className="shrink-0 self-center"
                  />
                </li>
              );
            })}
          </ul>
        )}
        <ErrorNote error={update.error} />
      </div>
    </Panel>
  );
}

function ConfigForm({
  agent,
  station,
}: {
  readonly agent: AgentView;
  readonly station: StationConfig;
}) {
  const update = useUpdateAgent(agent.id);
  const models = useModels();
  const [draft, setDraft] = useState<Draft>({});
  const value: AgentConfig = { ...agent.config, ...draft };
  const set = (patch: Draft) => setDraft((d) => ({ ...d, ...patch }));
  const dirty = Object.keys(draft).length > 0;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    update.mutate(draft, { onSuccess: () => setDraft({}) });
  };
  const modelIds = models.data?.map((m) => m.id) ?? [];

  return (
    <form aria-label="Configuration" onSubmit={submit} className={panel}>
      <div className="flex flex-wrap gap-3">
        <label className={field}>
          Name
          <input
            className={input}
            value={value.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </label>
        <label className={field}>
          {term("room")}
          <select
            className={input}
            value={value.roomId}
            onChange={(e) => set({ roomId: e.target.value })}
          >
            {station.rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className={field}>
          Role
          <select
            className={input}
            value={value.role}
            onChange={(e) => set({ role: e.target.value as "overseer" | "crew" })}
          >
            <option value="crew">{term("agent")}</option>
            <option value="overseer">{term("overseer.role")}</option>
          </select>
        </label>
        <label className={field}>
          Model
          <select
            className={input}
            value={value.model}
            onChange={(e) => set({ model: e.target.value })}
          >
            {modelIds.includes(value.model) ? null : (
              <option value={value.model}>{value.model} (not supported)</option>
            )}
            {models.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
        <legend className={`mb-1.5 ${label}`}>{term("approvalMode")}</legend>
        {(["ask", "full"] as const satisfies readonly ApprovalMode[]).map((mode) => (
          <label
            key={mode}
            className="flex items-start gap-2 text-b19 text-fg"
            {...(mode === "full" ? { "data-flag": "full-power" } : {})}
          >
            <input
              type="radio"
              name="approvalMode"
              value={mode}
              checked={value.approvalMode === mode}
              onChange={() => set({ approvalMode: mode })}
            />
            <span className="flex flex-col">
              <span
                className={
                  mode === "full"
                    ? "self-start border border-amber px-1.5 font-display text-d7 text-amber uppercase"
                    : undefined
                }
              >
                {term(`approvalMode.${mode}`)}
              </span>
              <span className="text-b17 text-fg-mute">{term(`approvalMode.${mode}.hint`)}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="flex items-center gap-2">
        <button type="submit" className={button} disabled={!dirty || update.isPending}>
          Save changes
        </button>
        {dirty ? (
          <button type="button" className={button} onClick={() => setDraft({})}>
            Discard
          </button>
        ) : null}
      </div>
      <ErrorNote error={update.error} />
    </form>
  );
}

/**
 * Appearance (ADR-0017): the character this crew member appears as, picked from a row of every
 * character. Assigning writes `look` to agent.json; it comes back as `agent.updated`.
 */
function AppearanceRow({ agentId }: { readonly agentId: string }) {
  const { dashboard } = useDashboard();
  const setLook = useSetLook();
  const [cursor, setCursor] = useState<string>();
  // The look just saved, the one it replaced, and what to say. The note holds while the crew member
  // shows either (the refresh may not be in yet); a different look, saved elsewhere, ends it.
  const [assigned, setAssigned] = useState<{ look: string; before: string; text: string }>();
  if (!dashboard) return null;
  const toAgent = (c: (typeof dashboard.crew)[number]): CrewSelectAgent => {
    const room = dashboard.rooms.find((r) => r.id === c.roomId);
    return {
      id: c.id,
      name: c.name,
      role: term(c.overseer ? "overseer.role" : "agent"),
      roomName: room?.name ?? c.roomId,
      color: c.overseer
        ? stVar("white")
        : room?.bridge
          ? stVar("cyan")
          : roomColorVar(c.colorIndex),
      look: c.look,
    };
  };
  const everyone = dashboard.crew.map(toAgent);
  const agent = everyone.find((a) => a.id === agentId);
  if (!agent) return null;
  const at = cursor ?? agent.look;
  const note =
    assigned && (agent.look === assigned.look || agent.look === assigned.before)
      ? assigned.text
      : "";
  return (
    <div className="flex flex-col gap-1.5">
      <CrewSelect
        agent={agent}
        others={everyone}
        cursor={at}
        onCursor={setCursor}
        onSave={() =>
          setLook.mutate(
            { agentId, look: at },
            {
              onSuccess: () =>
                setAssigned({
                  look: at,
                  before: agent.look,
                  text: termWith("crewSelect.assigned", {
                    agent: agent.name,
                    character: characterById(at)?.name ?? "",
                  }),
                }),
            },
          )
        }
        busy={setLook.isPending}
      />
      {note ? (
        <p role="status" className="m-0 text-b17 text-green">
          {note}
        </p>
      ) : null}
      <ErrorNote error={setLook.error} />
    </div>
  );
}

/**
 * What this crew member can use, as the runtime resolves it: built-in tools by their readable
 * names, then each granted connector, in two columns.
 */
function Capabilities({
  agent,
  station,
}: {
  readonly agent: AgentView;
  readonly station: StationConfig;
}) {
  return (
    <Panel title={term("tools.effective")}>
      <div className="flex flex-col gap-2 p-3">
        {pendingConnectors(agent, station).map((name) => (
          <p key={name} className="m-0 text-b17 text-amber" data-connector-pending>
            {name} {term("tools.connector.pending")}
          </p>
        ))}
        {agent.tools.length === 0 ? (
          <p className="m-0 text-b17 text-fg-mute">{term("tools.none")}</p>
        ) : (
          <ul
            data-capabilities
            className="m-0 grid list-none grid-cols-1 gap-2 p-0 desktop:grid-cols-2"
          >
            {agent.tools
              .filter((t) => t.source.kind !== "connector")
              .map((t) => (
                <ToolItem key={t.name} tool={t} />
              ))}
            {connectorGroups(agent.tools).map((g) => (
              <ConnectorItem
                key={g.id}
                name={station.connectors.find((c) => c.id === g.id)?.name ?? g.id}
                tools={g.tools}
              />
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

/**
 * Brief: who this crew member is, at a glance and read only. Their look, name, room, and model;
 * what they can use; their identity; and their schedules. Everything editable is on Config.
 */
function Brief({ agent, station }: { readonly agent: AgentView; readonly station: StationConfig }) {
  const identity = agent.documents.identity.trim();
  const look = lookFor(agent.id, agent.config.look);
  const room = station.rooms.find((r) => r.id === agent.config.roomId)?.name ?? agent.config.roomId;
  return (
    <>
      <header className="flex items-center gap-3">
        {/* A fifth larger than the scale-2 portrait: the box's padding and the character alike. */}
        <span data-brief-avatar className="flex border-2 border-cyan bg-tile p-1.25">
          <Sprite look={look} scale={2.4} label={characterById(look)?.name ?? ""} />
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="m-0 font-display font-normal text-d14 text-title uppercase tracking-st-2">
            {agent.config.name}
          </h2>
          <span className="text-b17 text-fg-soft uppercase" data-room-line>
            {termWith("crewPage.roomLine", { room })}
          </span>
          {/* The model as it is written in agent.json, then the role and mode, all as tags. */}
          <div className="flex flex-wrap gap-1.5">
            <Tag
              tone="cyan"
              size="md"
              caps={false}
              data-model-line
              title={findModel(agent.config.model)?.label ?? agent.config.model}
            >
              <span className="sr-only">{term("model.model")}: </span>
              {agent.config.model}
            </Tag>
            {agent.config.role === "overseer" ? (
              <Tag tone="white">{term("overseer.role")}</Tag>
            ) : null}
            {agent.config.approvalMode === "full" ? (
              <Tag tone="amber" data-flag="full-power">
                {term("approvalMode.full")}
              </Tag>
            ) : null}
          </div>
        </div>
        {/* Brief is read only; this is the way to change it. It also gives the tab's scroll area
            something a keyboard can reach, so a long Brief can be scrolled without a mouse. */}
        <Link
          to="?tab=config"
          replace
          data-brief-edit
          className="ml-auto self-start text-b17 text-cyan underline hover:text-fg-hi"
        >
          {term("brief.edit")}
        </Link>
      </header>
      <Capabilities agent={agent} station={station} />
      <Panel title={term("document.identity")}>
        <div className="p-3" data-identity>
          {identity ? (
            <Markdown text={identity} className="text-b18 text-fg" />
          ) : (
            <p className="m-0 text-b17 text-fg-mute">{term("brief.identity.none")}</p>
          )}
        </div>
      </Panel>
      <SchedulesBrief agentId={agent.id} />
    </>
  );
}

const TABS = ["brief", "schedules", "memory", "config"] as const;
type AgentTab = (typeof TABS)[number];
const isTab = (value: string | null): value is AgentTab => TABS.includes(value as AgentTab);

/**
 * One crew member on the crew screen (`/crew/:id?tab=…`), in four tabs: Brief, read only;
 * Schedules, their scheduled jobs to add and edit; Memory, what they remember and ask to; and
 * Config, every other field that can be changed, with Connectors in a panel of its own. Tabs stay
 * mounted, so a half-made edit on Config survives a look at Brief. The tab strip stays put; each
 * tab scrolls.
 */
export function AgentDetail({ id }: { readonly id: string }) {
  const agent = useAgent(id);
  const station = useStationView();
  const remove = useDeleteAgent();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const asked = params.get("tab");
  const tab: AgentTab = isTab(asked) ? asked : "brief";

  if (agent.isPending || station.isPending)
    return <p className="text-b19 text-fg-mute">Loading…</p>;
  if (agent.error) return <ErrorNote error={agent.error} />;
  if (station.error || !station.data.station) return <ErrorNote error={station.error} />;
  const a = agent.data;
  const stationConfig = station.data.station;

  const show = (next: string) =>
    setParams(
      (p) => {
        if (next === "brief") p.delete("tab");
        else p.set("tab", next);
        return p;
      },
      { replace: true },
    );

  const content = (t: AgentTab) => {
    switch (t) {
      case "brief":
        return <Brief agent={a} station={stationConfig} />;
      case "schedules":
        return <SchedulesSection agentId={a.id} />;
      case "memory":
        return <AgentMemory agentId={a.id} />;
      case "config":
        return (
          <>
            <ConfigForm agent={a} station={stationConfig} />
            <ConnectorGrants agent={a} station={stationConfig} />
            <section aria-label="Documents" className={panel}>
              {AGENT_DOCUMENTS.map((name) => (
                <DocumentEditor key={name} agentId={a.id} name={name} saved={a.documents[name]} />
              ))}
            </section>
            <AppearanceRow agentId={a.id} />
          </>
        );
    }
  };

  return (
    <section
      aria-label={a.config.name}
      data-agent-detail={a.id}
      className="flex flex-col gap-3.5 desktop:min-h-0 desktop:flex-1"
    >
      <PanelTabs
        framed={false}
        label={term("agentTabs.label")}
        active={tab}
        onChange={show}
        className="desktop:min-h-0 desktop:flex-1"
        meta={
          <button
            type="button"
            className={button}
            disabled={remove.isPending}
            onClick={() => {
              if (!window.confirm(`Delete ${a.config.name}? Its workspace files stay on disk.`))
                return;
              remove.mutate(a.id, { onSuccess: () => void navigate("/crew") });
            }}
          >
            Delete
          </button>
        }
        tabs={TABS.map((t) => ({
          id: t,
          label: term(`agentTabs.${t}`),
          content: <ScrollArea className="pt-3">{content(t)}</ScrollArea>,
        }))}
      />
      <ErrorNote error={remove.error} />
    </section>
  );
}
