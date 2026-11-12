import {
  AGENT_DOCUMENTS,
  type AgentConfig,
  type AgentDocumentName,
  type AgentView,
  type ApprovalMode,
  CHARACTERS,
  type EffectiveTool,
  lookFor,
  type StationConfig,
  term,
  termWith,
} from "@darthsaul/outerworld-ai-core";
import {
  Checkbox,
  CrewSelect,
  type CrewSelectAgent,
  roomColorVar,
  Sprite,
  stVar,
} from "@darthsaul/outerworld-ai-ui";
import { type FormEvent, useId, useState } from "react";
import { useNavigate } from "react-router";
import { ErrorNote } from "../components/ErrorNote.js";
import { ScrollArea } from "../components/ScrollArea.js";
import {
  useAgent,
  useDeleteAgent,
  useModels,
  useSaveDocument,
  useSetLook,
  useStationView,
  useUpdateAgent,
} from "../queries.js";
import { useDashboard } from "../station/use-dashboard.js";
import { SchedulesSection } from "./Schedules.js";

/** The design's quiet outline button, as a class so submit buttons can use it too. */
const button =
  "cursor-pointer border-2 border-line bg-transparent px-2.5 py-1.5 font-display text-d7 text-panel-title uppercase hover:border-cyan disabled:cursor-not-allowed disabled:opacity-50";
const input = "border-2 border-line-soft bg-well px-2 py-1 font-body text-b19 text-fg-hi";
const field = "flex flex-col gap-1 font-display text-d7 text-fg-mute uppercase";
const label = "font-display text-d7 text-fg-mute uppercase";
/** A panel around one part of the page. */
const panel = "flex flex-col gap-3 border-2 border-line bg-panel p-3 shadow-panel";

const sourceLabel = (t: EffectiveTool) =>
  t.source.kind === "role"
    ? term("tools.source.role")
    : t.source.kind === "prop"
      ? `${term("grant")}: ${term(`prop.${t.source.prop}`)}`
      : `${term("connector")}: ${t.source.connectorId}`;

/** A granted connector's tools, together: a grant is all of a connector's tools (ADR-0012). */
const connectorGroups = (tools: readonly EffectiveTool[]) => {
  const groups = new Map<string, EffectiveTool[]>();
  for (const t of tools) {
    if (t.source.kind !== "connector") continue;
    groups.set(t.source.connectorId, [...(groups.get(t.source.connectorId) ?? []), t]);
  }
  return [...groups].map(([id, list]) => ({ id, tools: list }));
};

/**
 * One line for a granted connector: full access, how many tools and of which class, and its
 * tools on request in a box that scrolls (a connector can offer dozens).
 */
function ConnectorTools({
  name,
  tools,
}: {
  readonly name: string;
  readonly tools: readonly EffectiveTool[];
}) {
  const writes = tools.filter((t) => t.class === "write").length;
  return (
    <li data-connector-tools={name} className="flex flex-col gap-1">
      <span>
        {term("connector")}: {name}{" "}
        <span className="border border-cyan px-1 font-display text-cyan text-d6 uppercase">
          {term("tools.connector.full")}
        </span>{" "}
        ·{" "}
        {termWith("tools.connector.count", {
          count: String(tools.length),
          read: String(tools.length - writes),
          write: String(writes),
        })}
      </span>
      <details>
        <summary className="cursor-pointer font-display text-cyan text-d7 uppercase">
          {term("tools.connector.show")}
        </summary>
        <ul className="m-0 mt-1 flex max-h-40 list-none flex-col gap-0.5 overflow-y-auto overscroll-y-contain border border-line-faint bg-well p-2 text-b16 text-fg-soft">
          {tools.map((t) => (
            <li key={t.name} data-tool={t.name} data-class={t.class}>
              {t.name} · {term(`grant.${t.class}`)}
            </li>
          ))}
        </ul>
      </details>
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
type Draft = Partial<
  Pick<AgentConfig, "name" | "roomId" | "role" | "model" | "approvalMode" | "connectorGrants">
>;

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
  const grants = new Set(value.connectorGrants);

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
      {station.connectors.length > 0 ? (
        <fieldset className="m-0 flex flex-wrap gap-x-5 gap-y-2 border-0 p-0">
          <legend className={`mb-1.5 ${label}`}>{term("connectors")}</legend>
          {station.connectors.map((c) => (
            <Checkbox
              key={c.id}
              label={c.name}
              checked={grants.has(c.id)}
              onChange={() =>
                set({
                  connectorGrants: grants.has(c.id)
                    ? value.connectorGrants.filter((g) => g !== c.id)
                    : [...value.connectorGrants, c.id],
                })
              }
            />
          ))}
        </fieldset>
      ) : null}
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
  const [cursor, setCursor] = useState<number>();
  const [assigned, setAssigned] = useState<string>();
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
                setAssigned(
                  termWith("crewSelect.assigned", {
                    agent: agent.name,
                    character: CHARACTERS[at]?.name ?? "",
                  }),
                ),
            },
          )
        }
        busy={setLook.isPending}
      />
      {assigned ? (
        <p role="status" className="m-0 text-b17 text-green">
          {assigned}
        </p>
      ) : null}
      <ErrorNote error={setLook.error} />
    </div>
  );
}

/**
 * One crew member as documents and config, with the tools the runtime would actually grant: the
 * crew screen's main panel when a crew member is chosen (`/crew/:id`). The header stays put; the rest
 * scrolls.
 */
export function AgentDetail({ id }: { readonly id: string }) {
  const titleId = useId();
  const agent = useAgent(id);
  const station = useStationView();
  const remove = useDeleteAgent();
  const navigate = useNavigate();

  if (agent.isPending || station.isPending)
    return <p className="text-b19 text-fg-mute">Loading…</p>;
  if (agent.error) return <ErrorNote error={agent.error} />;
  if (station.error || !station.data.station) return <ErrorNote error={station.error} />;
  const a = agent.data;

  return (
    <section
      aria-labelledby={titleId}
      data-agent-detail={a.id}
      className="flex flex-col gap-3.5 desktop:min-h-0 desktop:flex-1"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex border-2 border-cyan bg-tile p-1">
            <Sprite look={lookFor(a.id, a.config.look)} scale={2} />
          </span>
          <div className="flex flex-col gap-1.5">
            <h2
              id={titleId}
              className="m-0 font-display font-normal text-d14 text-title uppercase tracking-st-2"
            >
              {a.config.name}
            </h2>
            <span className="text-b17 text-fg-soft uppercase" data-room-line>
              {termWith("crewPage.roomLine", {
                room:
                  station.data.station.rooms.find((r) => r.id === a.config.roomId)?.name ??
                  a.config.roomId,
              })}
            </span>
          </div>
        </div>
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
      </header>
      <ErrorNote error={remove.error} />
      <ScrollArea>
        <AppearanceRow key={a.id} agentId={a.id} />
        <ConfigForm key={a.id} agent={a} station={station.data.station} />
        <section aria-labelledby="tools-title" className={panel}>
          <h2 id="tools-title" className={`m-0 font-normal ${label}`}>
            {term("tools.effective")}
          </h2>
          {pendingConnectors(a, station.data.station).map((name) => (
            <p key={name} className="m-0 text-b17 text-amber" data-connector-pending>
              {name} {term("tools.connector.pending")}
            </p>
          ))}
          {a.tools.length === 0 ? (
            <p className="m-0 text-b17 text-fg-mute">{term("tools.none")}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-b17 text-fg">
              {a.tools
                .filter((t) => t.source.kind !== "connector")
                .map((t) => (
                  <li key={t.name} data-tool={t.name} data-class={t.class}>
                    {t.name} · {term(`grant.${t.class}`)} · {sourceLabel(t)}
                  </li>
                ))}
              {connectorGroups(a.tools).map((g) => (
                <ConnectorTools
                  key={g.id}
                  name={station.data.station?.connectors.find((c) => c.id === g.id)?.name ?? g.id}
                  tools={g.tools}
                />
              ))}
            </ul>
          )}
        </section>
        <SchedulesSection agentId={a.id} />
        <section aria-label="Documents" className={panel}>
          {AGENT_DOCUMENTS.map((name) => (
            <DocumentEditor key={name} agentId={a.id} name={name} saved={a.documents[name]} />
          ))}
        </section>
      </ScrollArea>
    </section>
  );
}
