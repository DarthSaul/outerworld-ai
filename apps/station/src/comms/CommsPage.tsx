import { term } from "@darthsaul/outerworld-ai-core";
import { EmptyState } from "@darthsaul/outerworld-ai-ui";
import { useSearchParams } from "react-router";
import { ErrorNote } from "../components/ErrorNote.js";
import { useCreateSession, useSessions, useStationView } from "../queries.js";
import { ChatWindow } from "./ChatWindow.js";

const button =
  "h-(--ow-size-control-h-dense) rounded-control border border-border-subtle px-(--ow-size-control-pad-x) text-label text-ink-1 disabled:text-ink-3";

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
    <section aria-labelledby="screen-title" className="flex flex-col gap-(--ow-space-4)">
      <h1 id="screen-title" className="text-heading text-ink-1">
        {term("comms")}
      </h1>
      <div className="flex flex-col gap-(--ow-space-4) desktop:flex-row">
        <nav
          aria-label={term("agents")}
          className="flex shrink-0 flex-col gap-(--ow-space-3) desktop:w-(--ow-size-panel-w-min)"
        >
          <ul className="flex flex-wrap gap-(--ow-space-2) desktop:flex-col">
            {station.data?.agents.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  aria-pressed={a.id === agentId}
                  className={`${button} aria-pressed:border-border-strong`}
                  onClick={() => update({ agent: a.id })}
                >
                  {a.config.name}
                </button>
              </li>
            ))}
          </ul>
          {agentId ? (
            <section
              aria-label={term("comms.sessions")}
              className="flex flex-col gap-(--ow-space-2)"
            >
              <button
                type="button"
                className={button}
                disabled={create.isPending}
                onClick={() => create.mutate(agentId, { onSuccess: (s) => openSession(s.id) })}
              >
                {term("comms.new")}
              </button>
              <ErrorNote error={create.error ?? sessions.error} />
              {sessions.data?.length === 0 ? (
                <p className="text-caption text-ink-2">{term("comms.none.body")}</p>
              ) : null}
              <ul className="flex flex-col gap-(--ow-space-1)">
                {sessions.data?.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="text-label text-ink-1 underline"
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
        <div className="flex min-w-0 flex-1 flex-col gap-(--ow-space-4) desktop:flex-row">
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
