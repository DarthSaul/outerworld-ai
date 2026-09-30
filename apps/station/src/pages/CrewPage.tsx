import { type PropKind, type Room, term } from "@darthsaul/outerworld-ai-core";
import { EmptyState } from "@darthsaul/outerworld-ai-ui";
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ErrorNote } from "../components/ErrorNote.js";
import {
  useCreateAgent,
  useCreateRoom,
  useDeleteRoom,
  useStationView,
  useUpdateRoom,
} from "../queries.js";

const PROPS: readonly PropKind[] = ["web", "files", "memory"];

const button =
  "h-(--ow-size-control-h-dense) rounded-control border border-border-subtle px-(--ow-size-control-pad-x) text-label text-ink-1 disabled:text-ink-3";
const input =
  "h-(--ow-size-control-h-dense) rounded-control border border-border-subtle bg-surface-raised px-(--ow-space-2) text-body text-ink-1";

function RoomSection({
  room,
  crew,
}: {
  readonly room: Room;
  readonly crew: readonly { id: string; name: string; role: string; approvalMode: string }[];
}) {
  const update = useUpdateRoom();
  const remove = useDeleteRoom();
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
      className="flex flex-col gap-(--ow-space-3) rounded-panel border border-border-subtle p-(--ow-space-4)"
      data-room={room.id}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-(--ow-space-2)">
        <h2 id={`room-${room.id}`} className="text-heading text-ink-1">
          {room.name}
        </h2>
        <button
          type="button"
          className={button}
          disabled={blocked || remove.isPending}
          title={blocked ? "Move or remove its crew first" : undefined}
          onClick={() => remove.mutate(room.id)}
        >
          Delete {term("room").toLowerCase()}
        </button>
      </header>
      {room.description ? <p className="text-body text-ink-2">{room.description}</p> : null}
      <fieldset className="flex flex-wrap gap-(--ow-space-3)">
        <legend className="mb-(--ow-space-1) font-mono text-eyebrow uppercase text-ink-3">
          {term("grants")}
        </legend>
        {PROPS.map((kind) => (
          <label key={kind} className="flex items-center gap-(--ow-space-1) text-label text-ink-1">
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
      <ul className="flex flex-col gap-(--ow-space-1)">
        {crew.map((a) => (
          <li
            key={a.id}
            data-agent={a.id}
            className="flex flex-wrap items-center gap-(--ow-space-2)"
          >
            <Link to={`/crew/${a.id}`} className="text-label text-ink-1 underline">
              {a.name}
            </Link>
            {a.role === "overseer" ? (
              <span className="font-mono text-mono text-ink-2">{term("overseer.role")}</span>
            ) : null}
            {a.approvalMode === "full" ? (
              <span
                data-flag="full-power"
                className="font-mono text-mono rounded-control border border-health-attention px-(--ow-space-1) text-ink-1"
              >
                {term("approvalMode.full")}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Crew and rooms: every room with its props and crew, and forms to add both. */
export function CrewPage() {
  const station = useStationView();
  const createAgent = useCreateAgent();
  const createRoom = useCreateRoom();
  const navigate = useNavigate();
  const [agentName, setAgentName] = useState("");
  const [agentRoom, setAgentRoom] = useState("");
  const [roomName, setRoomName] = useState("");

  if (station.isPending) return <p className="text-body text-ink-2">Loading…</p>;
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
    <section aria-labelledby="screen-title" className="flex flex-col gap-(--ow-space-4)">
      <h1 id="screen-title" className="text-heading text-ink-1">
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
        className="flex flex-wrap items-end gap-(--ow-space-2)"
      >
        <label className="flex flex-col gap-(--ow-space-1) text-label text-ink-2">
          Name
          <input
            className={input}
            value={agentName}
            required
            onChange={(e) => setAgentName(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-(--ow-space-1) text-label text-ink-2">
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
        <button type="submit" className={button} disabled={createAgent.isPending}>
          {term("agent.verb")}
        </button>
        <ErrorNote error={createAgent.error} />
      </form>
      <form
        aria-label={term("room.verb")}
        onSubmit={addRoom}
        className="flex flex-wrap items-end gap-(--ow-space-2)"
      >
        <label className="flex flex-col gap-(--ow-space-1) text-label text-ink-2">
          {term("room")} name
          <input
            className={input}
            value={roomName}
            required
            onChange={(e) => setRoomName(e.target.value)}
          />
        </label>
        <button type="submit" className={button} disabled={createRoom.isPending}>
          {term("room.verb")}
        </button>
        <ErrorNote error={createRoom.error} />
      </form>
      {view.issues.length > 0 ? (
        <section aria-label="Issues" className="flex flex-col gap-(--ow-space-1)">
          {view.issues.map((i) => (
            <p key={`${i.path}:${i.message}`} className="font-mono text-mono text-ink-2">
              {i.level}: {i.path}: {i.message}
            </p>
          ))}
        </section>
      ) : null}
    </section>
  );
}
