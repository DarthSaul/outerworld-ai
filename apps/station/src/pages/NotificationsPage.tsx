import { type Notification, term } from "@darthsaul/outerworld-ai-core";
import { EmptyState, Popup } from "@darthsaul/outerworld-ai-ui";
import { useState } from "react";
import { Link } from "react-router";
import { ConsentCard } from "../comms/ConsentCard.js";
import { ErrorNote } from "../components/ErrorNote.js";
import { formatWhen } from "../components/format.js";
import { Markdown, plainText } from "../components/Markdown.js";
import { linkFor, notificationText } from "../components/notification-text.js";
import { ScrollArea } from "../components/ScrollArea.js";
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
  const [expanded, setExpanded] = useState(false);
  const open = to ? (
    <Link to={to} className="font-display text-d7 text-cyan uppercase underline">
      {term("notification.open")}
    </Link>
  ) : null;
  return (
    <li
      data-kind={n.kind}
      data-level={n.level}
      data-unread={unread}
      className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 border bg-well-2 p-2 ${
        unread ? "border-cyan" : "border-line-faint"
      }`}
    >
      {unread ? (
        <span className="font-display text-d7 text-amber uppercase">
          {term("notifications.new")}
        </span>
      ) : null}
      {/* A two-line preview; Expand shows the whole text, Open goes to the conversation. */}
      <p data-preview className="m-0 line-clamp-2 min-w-0 flex-1 basis-60 text-b19 text-fg-hi">
        {plainText(text)}
      </p>
      <span className="text-b17 text-fg-mute">{formatWhen(n.at)}</span>
      <button
        type="button"
        className="cursor-pointer border-0 bg-transparent p-0 font-display text-d7 text-cyan uppercase underline"
        onClick={() => setExpanded(true)}
      >
        {term("notification.expand")}
      </button>
      {open}
      {expanded ? (
        <Popup
          title={term("notification.title")}
          meta={formatWhen(n.at)}
          onClose={() => setExpanded(false)}
          actions={open}
        >
          <Markdown text={text} className="text-b19 text-fg-hi" />
        </Popup>
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
    <section
      aria-labelledby="screen-title"
      className="flex flex-col gap-4 desktop:min-h-0 desktop:flex-1"
    >
      <h1
        id="screen-title"
        className="m-0 font-display font-normal text-d14 text-title uppercase leading-[1.4] tracking-st-2"
      >
        {term("notifications")}
      </h1>
      <ScrollArea className="gap-4">
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
          <h2
            id="feed-title"
            className="m-0 font-display font-normal text-d7 text-fg-mute uppercase"
          >
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
          <ul
            aria-labelledby="feed-title"
            data-feed
            className="m-0 flex max-h-[60dvh] list-none flex-col gap-2 overflow-y-auto overscroll-y-contain p-0 pr-1 desktop:max-h-none desktop:overflow-visible"
          >
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
      </ScrollArea>
    </section>
  );
}
