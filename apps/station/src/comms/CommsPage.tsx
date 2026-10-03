import { lookFor, term } from "@darthsaul/outerworld-ai-core";
import { EmptyState, OutlineButton, Sprite } from "@darthsaul/outerworld-ai-ui";
import { useSearchParams } from "react-router";
import { ErrorNote } from "../components/ErrorNote.js";
import { useCreateSession, useSessions, useStationView } from "../queries.js";
import { ChatWindow } from "./ChatWindow.js";

/** At most this many chat windows side by side; opening another closes the oldest. */
const MAX_OPEN = 3;

/**
 * COMMS: pick a crew member, open or start sessions, and talk. Several chat windows can be open
 * at once; the selection lives in the URL (`?agent=…&open=a,b`) so it survives a reload.
 */
export function CommsPage() {
  const [params, setParams] = useSearchParams();
  const station = useStationView();
  const agentId = params.get("agent") ?? undefined;
  const open = (params.get("open") ?? "").split(",").filter(Boolean);
  const sessions = useSessions(agentId);
  const create = useCreateSession();

  const update = (next: { agent?: string; open?: string[] }) => {
    const p = new URLSearchParams(params);
    if (next.agent !== undefined) p.set("agent", next.agent);
    if (next.open !== undefined) {
      if (next.open.length) p.set("open", next.open.join(","));
      else p.delete("open");
    }
    setParams(p);
  };
  const openSession = (id: string) => {
    if (open.includes(id)) return;
    update({ open: [...open, id].slice(-MAX_OPEN) });
  };
  const nameOf = (id: string) => station.data?.agents.find((a) => a.id === id)?.config.name ?? id;
  const agentOfSession = (sessionId: string) =>
    sessions.data?.find((s) => s.id === sessionId)?.agentId;

  return (
    <section
      aria-labelledby="screen-title"
      className="flex flex-col border-2 border-line bg-panel shadow-panel"
    >
      <h1
        id="screen-title"
        className="m-0 border-line border-b-2 bg-panel-head px-2.5 py-2 font-display font-normal text-d9 text-panel-title uppercase tracking-st-1"
      >
        {term("comms")}
      </h1>
      <div className="flex flex-col gap-3.5 p-3 desktop:flex-row">
        <nav aria-label={term("agents")} className="flex shrink-0 flex-col gap-3 desktop:w-56">
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0 desktop:flex-col">
            {station.data?.agents.map((a) => {
              const active = a.id === agentId;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    aria-pressed={active}
                    className={`flex w-full cursor-pointer items-center gap-1.5 border-2 py-0.75 pr-2 pl-0.75 text-left font-body text-b17 text-fg-chip uppercase ${active ? "border-cyan bg-active-bg" : "border-line-soft bg-well hover:bg-hover"}`}
                    onClick={() => update({ agent: a.id })}
                  >
                    <Sprite look={lookFor(a.id, a.config.look)} />
                    {a.config.name}
                  </button>
                </li>
              );
            })}
          </ul>
          {agentId ? (
            <section aria-label={term("comms.sessions")} className="flex flex-col gap-2">
              <OutlineButton
                tone="green"
                disabled={create.isPending}
                onClick={() => create.mutate(agentId, { onSuccess: (s) => openSession(s.id) })}
              >
                {term("comms.new")}
              </OutlineButton>
              <ErrorNote error={create.error ?? sessions.error} />
              {sessions.data?.length === 0 ? (
                <p className="m-0 text-b17 text-fg-mute">{term("comms.none.body")}</p>
              ) : null}
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {sessions.data?.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="w-full cursor-pointer border border-line-faint bg-transparent px-1.5 py-1 text-left text-b17 text-fg hover:border-cyan aria-[current=true]:border-cyan aria-[current=true]:text-cyan"
                      aria-current={open.includes(s.id) ? "true" : undefined}
                      onClick={() => openSession(s.id)}
                    >
                      {s.title}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col gap-3.5 desktop:flex-row">
          {open.length === 0 ? (
            <EmptyState title={term("comms.pick.title")} body={term("comms.pick.body")} />
          ) : (
            open.map((id) => (
              <ChatWindow
                key={id}
                sessionId={id}
                onClose={() => update({ open: open.filter((o) => o !== id) })}
              />
            ))
          )}
        </div>
      </div>
    </section>
  );
}
