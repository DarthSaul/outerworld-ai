import { term } from "@darthsaul/outerworld-ai-core";
import { EmptyState } from "@darthsaul/outerworld-ai-ui";
import { useDaemon } from "../daemon-context.js";

/**
 * The Station screen. Until the map is adapted to rooms and crew (Phase 9), it shows what the
 * event log proves: the latest event and the most recent ones, newest first.
 */
export function StationPage() {
  const { latestSeq, recent } = useDaemon();
  return (
    <section aria-labelledby="screen-title" className="flex flex-col gap-(--ow-space-4)">
      <h1 id="screen-title" className="text-heading text-ink-1">
        {term("station")}
      </h1>
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
