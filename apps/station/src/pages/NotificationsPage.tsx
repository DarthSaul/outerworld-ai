import { type Notification, term } from "@darthsaul/outerworld-ai-core";
import { EmptyState } from "@darthsaul/outerworld-ai-ui";
import { Link } from "react-router";
import { ConsentCard } from "../comms/ConsentCard.js";
import { ErrorNote } from "../components/ErrorNote.js";
import { formatWhen } from "../components/format.js";
import { linkFor, notificationText } from "../components/notification-text.js";
import { useConsents, useMarkRead, useNotifications, useStationView } from "../queries.js";

const button =
  "cursor-pointer border-2 border-line bg-transparent px-2.5 py-1.5 font-display text-d7 text-panel-title uppercase no-underline hover:border-cyan disabled:cursor-not-allowed disabled:opacity-50";

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
      className={`flex flex-wrap items-baseline gap-2 border bg-well-2 p-2 ${
        unread ? "border-cyan" : "border-line-faint"
      }`}
    >
      {unread ? (
        <span className="font-display text-d7 text-amber uppercase">
          {term("notifications.new")}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 text-b19 text-fg-hi">{text}</span>
      <span className="text-b17 text-fg-mute">{formatWhen(n.at)}</span>
      {to ? (
        <Link to={to} className="font-display text-d7 text-cyan uppercase underline">
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
    <section aria-labelledby="screen-title" className="flex flex-col gap-4">
      <h1
        id="screen-title"
        className="m-0 font-display font-normal text-d14 text-title uppercase leading-[1.4] tracking-st-2"
      >
        {term("notifications")}
      </h1>
      <h2 className="m-0 font-display font-normal text-d7 text-fg-mute uppercase">
        {term("notifications.approvals")}
      </h2>
      <ErrorNote error={consents.error} />
      {consents.isSuccess && pending.length === 0 ? (
        <EmptyState title={term("consent.none.title")} body={term("consent.none.body")} />
      ) : (
        pending.map((c) => <ConsentCard key={c.id} consent={c} agentName={nameOf(c.agentId)} />)
      )}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="feed-title" className="m-0 font-display font-normal text-d7 text-fg-mute uppercase">
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
        <ul aria-labelledby="feed-title" className="m-0 flex list-none flex-col gap-2 p-0">
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
