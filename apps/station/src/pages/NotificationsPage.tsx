import { term } from "@darthsaul/outerworld-ai-core";
import { EmptyState } from "@darthsaul/outerworld-ai-ui";
import { ConsentCard } from "../comms/ConsentCard.js";
import { ErrorNote } from "../components/ErrorNote.js";
import { useConsents, useStationView } from "../queries.js";

/**
 * Notifications. Phase 4 shows what needs the Commander now: pending consent requests from every
 * crew member. The full event feed arrives in Phase 9.
 */
export function NotificationsPage() {
  const consents = useConsents();
  const station = useStationView();
  const nameOf = (id: string) => station.data?.agents.find((a) => a.id === id)?.config.name ?? id;
  const pending = consents.data ?? [];
  return (
    <section aria-labelledby="screen-title" className="flex flex-col gap-(--ow-space-4)">
      <h1 id="screen-title" className="text-heading text-ink-1">
        {term("notifications")}
      </h1>
      <h2 className="font-mono text-eyebrow uppercase text-ink-3">
        {term("notifications.approvals")}
      </h2>
      <ErrorNote error={consents.error} />
      {consents.isSuccess && pending.length === 0 ? (
        <EmptyState title={term("consent.none.title")} body={term("consent.none.body")} />
      ) : (
        pending.map((c) => <ConsentCard key={c.id} consent={c} agentName={nameOf(c.agentId)} />)
      )}
    </section>
  );
}
