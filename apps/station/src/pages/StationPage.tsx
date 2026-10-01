import { mapModelFor, term } from "@darthsaul/outerworld-ai-core";
import { EmptyState, type Selection, StationMap, useDesktop } from "@darthsaul/outerworld-ai-ui";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useDaemon } from "../daemon-context.js";
import { useActivity, useStationView } from "../queries.js";

/** Every run in flight and every running dispatch, each linking to its session in COMMS. */
function Activity() {
  const activity = useActivity();
  const station = useStationView();
  const nameOf = (id: string) => station.data?.agents.find((a) => a.id === id)?.config.name ?? id;
  const runs = activity.data?.runs ?? [];
  return (
    <section aria-labelledby="activity-title" className="flex flex-col gap-(--ow-space-2)">
      <h2 id="activity-title" className="font-mono text-eyebrow uppercase text-ink-3">
        {term("activity.title")}
      </h2>
      {runs.length === 0 ? (
        <p className="text-body text-ink-2">{term("activity.none")}</p>
      ) : (
        <ul className="flex flex-col gap-(--ow-space-1)">
          {runs.map((r) => {
            const dispatch = activity.data?.dispatches.find((d) => d.workerRunId === r.id);
            return (
              <li
                key={r.id}
                data-activity-run={r.id}
                className="flex flex-wrap gap-(--ow-space-2) text-label text-ink-1"
              >
                <Link
                  to={`/comms?agent=${encodeURIComponent(r.agentId)}&open=${encodeURIComponent(r.sessionId)}`}
                  className="underline"
                >
                  {nameOf(r.agentId)}
                </Link>
                <span className="font-mono text-mono text-ink-2">
                  {term(`runState.${r.state}`)}
                </span>
                {dispatch ? (
                  <span className="text-ink-2">
                    · {term("dispatch.from")} {nameOf(dispatch.leadAgentId)}: {dispatch.task}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * The map (brief §3 goal 9): rooms, their props and crew, hallways, and the Overseer, with live
 * state folded from runtime events (D24). A crew member opens their page; the Overseer opens
 * COMMS with it; anything else is selected, which highlights its room's hallways.
 */
function StationMapSection() {
  const station = useStationView();
  const activity = useActivity();
  const desktop = useDesktop();
  const navigate = useNavigate();
  const [selection, setSelection] = useState<Selection | null>(null);
  const config = station.data?.station;
  const agents = station.data?.agents;
  const crew = activity.data?.crew;
  const updatedAt = activity.dataUpdatedAt;
  const model = useMemo(
    () =>
      config && agents
        ? mapModelFor(config, agents, crew ?? {}, new Date(updatedAt || Date.now()).toISOString())
        : undefined,
    [config, agents, crew, updatedAt],
  );
  if (!model || !agents) return null;
  const overseer = agents.find((a) => a.config.role === "overseer");
  const select = (s: Selection) => {
    if (s.kind === "agent") {
      void navigate(`/crew/${encodeURIComponent(s.id)}`);
    } else if (s.kind === "overseer" && overseer) {
      void navigate(`/comms?agent=${encodeURIComponent(overseer.id)}`);
    } else if (
      s.kind === "grant" &&
      model.station.grants.find((g) => g.id === s.id)?.kind === "connector"
    ) {
      void navigate("/connectors");
    } else {
      setSelection((cur) => (cur?.kind === s.kind && cur.id === s.id ? null : s));
    }
  };
  return (
    <section aria-label={term("station.map")} className="min-w-0">
      <StationMap
        station={model.station}
        state={model.state}
        selection={selection}
        onSelect={select}
        {...(desktop ? {} : { stacked: true })}
      />
    </section>
  );
}

/**
 * The Station screen: the map, what is running now, and what the event log proves (the latest
 * event and the most recent ones, newest first).
 */
export function StationPage() {
  const { latestSeq, recent } = useDaemon();
  return (
    <section aria-labelledby="screen-title" className="flex flex-col gap-(--ow-space-4)">
      <h1 id="screen-title" className="text-heading text-ink-1">
        {term("station")}
      </h1>
      <StationMapSection />
      <Activity />
      <p className="font-mono text-mono text-ink-2">
        {term("events.latest")} #{latestSeq}
      </p>
      {recent.length === 0 ? (
        <EmptyState title={term("empty.events.title")} body={term("empty.events.body")} />
      ) : (
        <section aria-labelledby="recent-title" className="flex flex-col gap-(--ow-space-2)">
          <h2 id="recent-title" className="font-mono text-eyebrow uppercase text-ink-3">
            {term("events.recent")}
          </h2>
          <ol className="flex flex-col gap-(--ow-space-1) font-mono text-mono text-ink-2">
            {recent.map((e) => (
              <li key={e.seq} data-event-type={e.type}>
                #{e.seq} · {e.at} · {e.type}
              </li>
            ))}
          </ol>
        </section>
      )}
    </section>
  );
}
