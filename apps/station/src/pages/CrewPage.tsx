import { type PropKind, type Room, term } from "@darthsaul/outerworld-ai-core";
import { EmptyState, OutlineButton, PanelLabel } from "@darthsaul/outerworld-ai-ui";
import { type FormEvent, useState } from "react";
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

const PROPS: readonly PropKind[] = ["web", "files", "memory"];

const input = "border-2 border-line-soft bg-well px-2 py-1 font-body text-b19 text-fg-hi";
const field = "flex flex-col gap-1 font-display text-d7 text-fg-mute uppercase";
/** A submit button in the design's green outline (OutlineButton is type="button" only). */
const submit =
  "cursor-pointer border-2 border-green bg-transparent px-2.5 py-1.5 font-display text-d7 text-green uppercase hover:bg-approve-hover disabled:cursor-not-allowed disabled:opacity-50";
const chip = "border px-1.5 font-display text-d7 uppercase";

function RoomSection({
  room,
  crew,
}: {
  readonly room: Room;
  readonly crew: readonly { id: string; name: string; role: string; approvalMode: string }[];
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
    <section
      aria-labelledby={`room-${room.id}`}
      className="flex flex-col border-2 border-line bg-panel shadow-panel"
      data-room={room.id}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-line border-b-2 bg-panel-head px-2.5 py-1.5">
        <h2
          id={`room-${room.id}`}
          className="m-0 font-display font-normal text-d9 text-panel-title uppercase tracking-st-1"
        >
          {room.name}
        </h2>
        <OutlineButton
          tone="line"
          disabled={blocked || remove.isPending}
          title={blocked ? "Move or remove its crew first" : undefined}
          onClick={() => remove.mutate(room.id)}
        >
          Delete {term("room").toLowerCase()}
        </OutlineButton>
      </header>
      <div className="flex flex-col gap-3 p-3">
        {room.description ? <p className="m-0 text-b18 text-fg-soft">{room.description}</p> : null}
        <fieldset className="m-0 flex flex-wrap gap-3 border-0 p-0">
          <legend className="mb-1.5 font-display text-d7 text-fg-mute uppercase">
            {term("grants")}
          </legend>
          {PROPS.map((kind) => (
            <label key={kind} className="flex items-center gap-1.5 text-b17 text-fg">
              <input
                type="checkbox"
                checked={placed.has(kind)}
                disabled={update.isPending}
                onChange={() => toggle(kind)}
              />
              {term(`prop.${kind}`)}
            </label>
          ))}
        </fieldset>
        <ErrorNote error={update.error ?? remove.error} />
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {crew.map((a) => (
            <li
              key={a.id}
              data-agent={a.id}
              className="flex flex-wrap items-center gap-2 border border-line-faint p-1"
            >
              <Link to={`/crew/${a.id}`} className="text-b19 uppercase">
                {a.name}
              </Link>
              {a.role === "overseer" ? (
                <span className={`${chip} border-white text-white`}>{term("overseer.role")}</span>
              ) : null}
              {spend.data?.agents[a.id] ? (
                <span className="text-b17 text-fg-mute" data-agent-spend>
                  {term("spend.today")} {formatUsd(spend.data.agents[a.id] ?? 0)}
                </span>
              ) : null}
              {a.approvalMode === "full" ? (
                <span data-flag="full-power" className={`${chip} border-amber text-amber`}>
                  {term("approvalMode.full")}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Crew and rooms: every room with its props and crew, and forms to add both. */
export function CrewPage() {
  const station = useStationView();
  const createAgent = useCreateAgent();
  const createRoom = useCreateRoom();
  const addPm = useAddProjectManager();
  const navigate = useNavigate();
  const [agentName, setAgentName] = useState("");
  const [agentRoom, setAgentRoom] = useState("");
  const [roomName, setRoomName] = useState("");

  if (station.isPending) return <p className="text-b19 text-fg-mute">Loading…</p>;
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
      {rooms.map((room) => (
        <RoomSection
          key={room.id}
          room={room}
          crew={view.agents
            .filter((a) => a.config.roomId === room.id)
            .map((a) => ({
              id: a.id,
              name: a.config.name,
              role: a.config.role,
              approvalMode: a.config.approvalMode,
            }))}
        />
      ))}
      <form
        aria-label={term("agent.verb")}
        onSubmit={addAgent}
        className="flex flex-wrap items-end gap-2 border-2 border-line bg-panel p-3 shadow-panel"
      >
        <label className={field}>
          Name
          <input
            className={input}
            value={agentName}
            required
            onChange={(e) => setAgentName(e.target.value)}
          />
        </label>
        <label className={field}>
          {term("room")}
          <select
            className={input}
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
        <button type="submit" className={submit} disabled={createAgent.isPending}>
          {term("agent.verb")}
        </button>
        <ErrorNote error={createAgent.error} />
      </form>
      <div className="flex flex-wrap items-center gap-2">
        <OutlineButton
          tone="cyan"
          disabled={addPm.isPending}
          onClick={() =>
            addPm.mutate(undefined, { onSuccess: (pm) => void navigate(`/crew/${pm.id}`) })
          }
        >
          {term("template.projectManager")}
        </OutlineButton>
        <ErrorNote error={addPm.error} />
      </div>
      <form
        aria-label={term("room.verb")}
        onSubmit={addRoom}
        className="flex flex-wrap items-end gap-2 border-2 border-line bg-panel p-3 shadow-panel"
      >
        <label className={field}>
          {term("room")} name
          <input
            className={input}
            value={roomName}
            required
            onChange={(e) => setRoomName(e.target.value)}
          />
        </label>
        <button type="submit" className={submit} disabled={createRoom.isPending}>
          {term("room.verb")}
        </button>
        <ErrorNote error={createRoom.error} />
      </form>
      {view.issues.length > 0 ? (
        <section aria-label="Issues" className="flex flex-col gap-1">
          <PanelLabel>Issues</PanelLabel>
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
