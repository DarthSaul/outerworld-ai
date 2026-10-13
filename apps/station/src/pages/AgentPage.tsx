import {
  AGENT_DOCUMENTS,
  type AgentConfig,
  type AgentDocumentName,
  type AgentView,
  type ApprovalMode,
  type EffectiveTool,
  lookFor,
  type StationConfig,
  term,
} from "@darthsaul/outerworld-ai-core";
import { Sprite } from "@darthsaul/outerworld-ai-ui";
import { type FormEvent, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ErrorNote } from "../components/ErrorNote.js";
import {
  useAgent,
  useDeleteAgent,
  useModels,
  useSaveDocument,
  useStationView,
  useUpdateAgent,
} from "../queries.js";
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
        <fieldset className="m-0 flex flex-wrap gap-3 border-0 p-0">
          <legend className={`mb-1.5 ${label}`}>{term("connectors")}</legend>
          {station.connectors.map((c) => (
            <label key={c.id} className="flex items-center gap-1.5 text-b19 text-fg">
              <input
                type="checkbox"
                checked={grants.has(c.id)}
                onChange={() =>
                  set({
                    connectorGrants: grants.has(c.id)
                      ? value.connectorGrants.filter((g) => g !== c.id)
                      : [...value.connectorGrants, c.id],
                  })
                }
              />
              {c.name}
            </label>
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

/** One crew member as documents and config, with the tools the runtime would actually grant. */
export function AgentPage() {
  const { id = "" } = useParams();
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
    <section aria-labelledby="screen-title" className="flex flex-col gap-3.5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/crew-select"
            aria-label={term("tab.crewSelect")}
            title={term("tab.crewSelect")}
            className="flex border-2 border-cyan bg-tile p-1 hover:bg-tile-hover"
          >
            <Sprite look={lookFor(a.id, a.config.look)} scale={4} />
          </Link>
          <div className="flex flex-col gap-1.5">
            <Link to="/crew" className="font-display text-d7 uppercase">
              ◀ {term("agents")}
            </Link>
            <h1
              id="screen-title"
              className="m-0 font-display font-normal text-d14 text-title uppercase tracking-st-2"
            >
              {a.config.name}
            </h1>
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
            {a.tools.map((t) => (
              <li key={t.name} data-tool={t.name} data-class={t.class}>
                {t.name} · {term(`grant.${t.class}`)} · {sourceLabel(t)}
              </li>
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
    </section>
  );
}
