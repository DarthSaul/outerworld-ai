import { lookFor, type PropKind, type Room, term } from "@darthsaul/outerworld-ai-core";
import {
  Checkbox,
  EmptyState,
  fieldClass,
  inputClass,
  OutlineButton,
  Panel,
  PanelLabel,
  roomColor,
  Sprite,
  stVar,
} from "@darthsaul/outerworld-ai-ui";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ErrorNote } from "../components/ErrorNote.js";
import { formatUsd } from "../components/format.js";
import {
  useAddProjectManager,
  useCreateAgent,
  useCreateRoom,
  useDeleteRoom,
  useSpend,
  useStationView,
  useUpdateRoom,
} from "../queries.js";
import { useDashboard } from "../station/use-dashboard.js";

const PROPS: readonly PropKind[] = ["web", "files", "memory"];

const chip = "border px-1.5 font-display text-d6 uppercase";

interface CrewRow {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly approvalMode: string;
  readonly look: number | undefined;
}

function RoomSection({
  room,
  color,
  crew,
}: {
  readonly room: Room;
  /** The room's color on the map. */
  readonly color: string;
  readonly crew: readonly CrewRow[];
}) {
  const update = useUpdateRoom();
  const remove = useDeleteRoom();
  const spend = useSpend();
  const placed = new Set(room.props.map((p) => p.kind));
  const toggle = (kind: PropKind) =>
    update.mutate({
      id: room.id,
      input: {
        props: placed.has(kind)
          ? room.props.filter((p) => p.kind !== kind)
          : [...room.props, { kind }],
      },
    });
  const blocked = crew.length > 0;
  return (
    <div data-room={room.id} className="flex min-w-0">
      <Panel
        title={
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="size-2.5 shrink-0" style={{ background: color }} />
            {room.name}
          </span>
        }
        className="flex-1"
        dense
        meta={
          <OutlineButton
            tone="line"
            disabled={blocked || remove.isPending}
            title={blocked ? term("room.delete.blocked") : undefined}
            onClick={() => remove.mutate(room.id)}
          >
            {term("room.delete")}
          </OutlineButton>
        }
      >
        <div className="flex flex-1 flex-col gap-3 p-3">
          {room.description ? (
            <p className="m-0 text-b18 text-fg-soft">{room.description}</p>
          ) : null}
          <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
            <legend className="mb-1.5 p-0">
              <PanelLabel>{term("grants")}</PanelLabel>
            </legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {PROPS.map((kind) => (
                <Checkbox
                  key={kind}
                  label={term(`prop.${kind}`)}
                  checked={placed.has(kind)}
                  disabled={update.isPending}
                  onChange={() => toggle(kind)}
                />
              ))}
            </div>
            <p className="m-0 text-b15 text-fg-mute">{term("room.props.hint")}</p>
          </fieldset>
          <ErrorNote error={update.error ?? remove.error} />
          <div className="flex flex-col gap-1.5">
            <PanelLabel>{term("scanner.crew")}</PanelLabel>
            {crew.length === 0 ? (
              <p className="m-0 text-b17 text-fg-mute">{term("room.crew.none")}</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {crew.map((a) => (
                  <li
                    key={a.id}
                    data-agent={a.id}
                    className="flex flex-wrap items-center gap-2 border-2 border-line-faint bg-well px-1.5 py-1"
                  >
                    <Sprite look={lookFor(a.id, a.look)} />
                    <Link to={`/crew/${a.id}`} className="text-b19 uppercase">
                      {a.name}
                    </Link>
                    {a.role === "overseer" ? (
                      <span className={`${chip} border-white text-white`}>
                        {term("overseer.role")}
                      </span>
                    ) : null}
                    {a.approvalMode === "full" ? (
                      <span data-flag="full-power" className={`${chip} border-amber text-amber`}>
                        {term("approvalMode.full")}
                      </span>
                    ) : null}
                    {spend.data?.agents[a.id] ? (
                      <span className="ml-auto text-b17 text-fg-mute" data-agent-spend>
                        {term("spend.today")} {formatUsd(spend.data.agents[a.id] ?? 0)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}

/** A titled panel holding one add form: what it does, the fields in a row, then any error. */
function AddPanel({
  title,
  hint,
  onSubmit,
  children,
  after,
}: {
  readonly title: string;
  readonly hint: string;
  readonly onSubmit: (e: FormEvent) => void;
  readonly children: ReactNode;
  /** Below the form, inside the panel (the template shortcut). */
  readonly after?: ReactNode;
}) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="flex min-w-0 flex-col border-2 border-line bg-panel shadow-panel"
    >
      <h2
        id={titleId}
        className="m-0 border-line border-b-2 bg-panel-head px-2.5 py-2 font-display font-normal text-d9 text-panel-title uppercase tracking-st-1"
      >
        {title}
      </h2>
      <div className="flex flex-col gap-3 p-3">
        <p className="m-0 text-b17 text-fg-soft">{hint}</p>
        <form aria-labelledby={titleId} onSubmit={onSubmit} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end gap-2">{children}</div>
        </form>
        {after}
      </div>
    </section>
  );
}

/** Crew and rooms: every room with its props and crew, and panels to add both. */
export function CrewPage() {
  const station = useStationView();
  const { dashboard } = useDashboard();
  const createAgent = useCreateAgent();
  const createRoom = useCreateRoom();
  const addPm = useAddProjectManager();
  const navigate = useNavigate();
  const [agentName, setAgentName] = useState("");
  const [agentRoom, setAgentRoom] = useState("");
  const [roomName, setRoomName] = useState("");

  if (station.isPending) return <p className="text-b19 text-fg-mute">{term("loading")}</p>;
  if (station.error) return <ErrorNote error={station.error} />;
  const view = station.data;
  if (!view.station) {
    return <EmptyState title={term("empty.station.title")} body={term("empty.station.body")} />;
  }
  const rooms = view.station.rooms;
  const roomForNew = agentRoom || rooms[0]?.id || "";

  const addAgent = (e: FormEvent) => {
    e.preventDefault();
    createAgent.mutate(
      { name: agentName, roomId: roomForNew },
      {
        onSuccess: (agent) => {
          setAgentName("");
          void navigate(`/crew/${agent.id}`);
        },
      },
    );
  };
  const addRoom = (e: FormEvent) => {
    e.preventDefault();
    createRoom.mutate({ name: roomName }, { onSuccess: () => setRoomName("") });
  };
  const submit = (label: string, busy: boolean) => (
    <OutlineButton type="submit" tone="green" disabled={busy} className="h-9">
      {label}
    </OutlineButton>
  );

  return (
    <section aria-labelledby="screen-title" className="flex flex-col gap-3.5">
      <h1
        id="screen-title"
        className="m-0 font-display font-normal text-d14 text-title uppercase tracking-st-2"
      >
        {term("agents")}
      </h1>
      {view.agents.length === 0 ? (
        <EmptyState title={term("empty.crew.title")} body={term("empty.crew.body")} />
      ) : null}
      <div className="grid grid-cols-1 gap-3.5 desktop:grid-cols-2">
        {rooms.map((room) => {
          const mapped = dashboard?.rooms.find((r) => r.id === room.id);
          return (
            <RoomSection
              key={room.id}
              room={room}
              color={mapped ? roomColor(mapped) : stVar("line")}
              crew={view.agents
                .filter((a) => a.config.roomId === room.id)
                .map((a) => ({
                  id: a.id,
                  name: a.config.name,
                  role: a.config.role,
                  approvalMode: a.config.approvalMode,
                  look: a.config.look,
                }))}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-1 items-start gap-3.5 desktop:grid-cols-2">
        <AddPanel
          title={term("agent.verb")}
          hint={term("agent.add.hint")}
          onSubmit={addAgent}
          after={
            <>
              <ErrorNote error={createAgent.error} />
              <div className="flex flex-wrap items-center gap-2 border-line-faint border-t-2 pt-3">
                <span className="text-b17 text-fg-mute">{term("template.hint")}</span>
                <OutlineButton
                  tone="cyan"
                  disabled={addPm.isPending}
                  onClick={() =>
                    addPm.mutate(undefined, { onSuccess: (pm) => void navigate(`/crew/${pm.id}`) })
                  }
                >
                  {term("template.projectManager")}
                </OutlineButton>
              </div>
              <ErrorNote error={addPm.error} />
            </>
          }
        >
          <label className={`${fieldClass} flex-1`}>
            {term("field.name")}
            <input
              className={inputClass}
              value={agentName}
              required
              onChange={(e) => setAgentName(e.target.value)}
            />
          </label>
          <label className={fieldClass}>
            {term("room")}
            <select
              className={inputClass}
              value={roomForNew}
              onChange={(e) => setAgentRoom(e.target.value)}
            >
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          {submit(term("agent.verb"), createAgent.isPending)}
        </AddPanel>
        <AddPanel
          title={term("room.verb")}
          hint={term("room.add.hint")}
          onSubmit={addRoom}
          after={<ErrorNote error={createRoom.error} />}
        >
          <label className={`${fieldClass} flex-1`}>
            {term("room.name")}
            <input
              className={inputClass}
              value={roomName}
              required
              onChange={(e) => setRoomName(e.target.value)}
            />
          </label>
          {submit(term("room.verb"), createRoom.isPending)}
        </AddPanel>
      </div>
      {view.issues.length > 0 ? (
        <section aria-label={term("issues")} className="flex flex-col gap-1">
          <PanelLabel>{term("issues")}</PanelLabel>
          {view.issues.map((i) => (
            <p key={`${i.path}:${i.message}`} className="m-0 text-b17 text-red-text">
              {i.level}: {i.path}: {i.message}
            </p>
          ))}
        </section>
      ) : null}
    </section>
  );
}
