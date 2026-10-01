import { type Notification, term } from "@darthsaul/outerworld-ai-core";
import { EmptyState } from "@darthsaul/outerworld-ai-ui";
import { Link } from "react-router";
import { ConsentCard } from "../comms/ConsentCard.js";
import { ErrorNote } from "../components/ErrorNote.js";
import { formatWhen } from "../components/format.js";
import { notificationText } from "../components/notification-text.js";
import { useConsents, useMarkRead, useNotifications, useStationView } from "../queries.js";

const button =
  "h-(--ow-size-control-h-dense) rounded-control border border-border-subtle px-(--ow-size-control-pad-x) text-label text-ink-1 disabled:text-ink-3";

const session = (n: Notification) =>
  n.agentId && n.sessionId
    ? `/comms?agent=${encodeURIComponent(n.agentId)}&open=${encodeURIComponent(n.sessionId)}`
    : undefined;

/** Where to look for each kind of notification, if anywhere. */
function linkFor(n: Notification): string | undefined {
  switch (n.kind) {
    case "memory":
      return n.agentId ? `/memory?agent=${encodeURIComponent(n.agentId)}` : undefined;
    case "schedule_missed":
      return n.agentId ? `/crew/${encodeURIComponent(n.agentId)}` : undefined;
    case "budget_warning":
    case "budget_blocked":
      return "/settings";
    case "connector":
      return "/connectors";
    case "kill_switch":
      return undefined;
    default:
      return session(n);
  }
}

function Line({
  n,
  unread,
  nameOf,
  connectorName,
}: {
  readonly n: Notification;
  readonly unread: boolean;
  readonly nameOf: (id: string) => string;
  readonly connectorName: (id: string) => string;
}) {
  const text = notificationText(n, nameOf, connectorName);
  const to = linkFor(n);
  return (
    <li
      data-kind={n.kind}
      data-level={n.level}
      data-unread={unread}
      className={`flex flex-wrap items-baseline gap-(--ow-space-2) rounded-control border p-(--ow-space-2) ${
        unread ? "border-border-strong" : "border-border-subtle"
      }`}
    >
      {unread ? (
        <span className="font-mono text-eyebrow uppercase text-ink-1">
          {term("notifications.new")}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 text-body text-ink-1">{text}</span>
      <span className="font-mono text-mono text-ink-2">{formatWhen(n.at)}</span>
      {to ? (
        <Link to={to} className="text-label text-ink-1 underline">
          {term("notification.open")}
        </Link>
      ) : null}
    </li>
  );
}

/**
 * Notifications: what needs the Commander now (pending consent requests from every crew member),
 * then the feed, a projection of the event log with a read marker shared by every tab.
 */
export function NotificationsPage() {
  const consents = useConsents();
  const station = useStationView();
  const feed = useNotifications();
  const markRead = useMarkRead();
  const nameOf = (id: string) => station.data?.agents.find((a) => a.id === id)?.config.name ?? id;
  const connectorName = (id: string) =>
    station.data?.station?.connectors.find((c) => c.id === id)?.name ?? id;
  const pending = consents.data ?? [];
  const pages = feed.data?.pages ?? [];
  const items = pages.flatMap((p) => p.items);
  const readSeq = pages[0]?.readSeq ?? 0;
  const newest = items[0]?.seq;
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
      <div className="flex flex-wrap items-baseline justify-between gap-(--ow-space-2)">
        <h2 id="feed-title" className="font-mono text-eyebrow uppercase text-ink-3">
          {term("notifications.feed")}
        </h2>
        {newest !== undefined && newest > readSeq ? (
          <button
            type="button"
            className={button}
            disabled={markRead.isPending}
            onClick={() => markRead.mutate(newest, { onSuccess: () => void feed.refetch() })}
          >
            {term("notifications.markRead")}
          </button>
        ) : null}
      </div>
      <ErrorNote error={feed.error ?? markRead.error} />
      {feed.isSuccess && items.length === 0 ? (
        <EmptyState
          title={term("notifications.none.title")}
          body={term("notifications.none.body")}
        />
      ) : feed.isSuccess ? (
        <ul aria-labelledby="feed-title" className="flex flex-col gap-(--ow-space-2)">
          {items.map((n) => (
            <Line
              key={n.seq}
              n={n}
              unread={n.seq > readSeq}
              nameOf={nameOf}
              connectorName={connectorName}
            />
          ))}
        </ul>
      ) : null}
      {feed.hasNextPage ? (
        <button
          type="button"
          className={`${button} self-start`}
          disabled={feed.isFetchingNextPage}
          onClick={() => void feed.fetchNextPage()}
        >
          {term("notifications.older")}
        </button>
      ) : null}
    </section>
  );
}
