import {
  NOTIFICATION_EVENT_TYPES,
  type Notification,
  notificationFor,
} from "@darthsaul/outerworld-ai-core";
import type { Db } from "../storage/database.js";
import type { EventStore } from "../storage/event-store.js";

const READ_KEY = "notifications.read_seq";
/** Unread counts stop here; the badge shows "99+" past it anyway. */
const MAX_UNREAD = 999;

export interface NotificationPage {
  readonly items: readonly Notification[];
  /** Unread notifications, counted up to 999. */
  readonly unread: number;
  /** Everything at or below this seq has been read. */
  readonly readSeq: number;
  /** Pass as `before` for the next, older page; absent at the end. */
  readonly nextBefore?: number;
}

/**
 * The Notifications feed (brief §10): the event log projected through core's `notificationFor`,
 * newest first, with one persisted read marker (a seq) shared by every tab.
 */
export class NotificationService {
  readonly #events: EventStore;
  readonly #db: Db;

  constructor(options: { events: EventStore; db: Db }) {
    this.#events = options.events;
    this.#db = options.db;
  }

  readSeq(): number {
    const row = this.#db.prepare("select value from station_state where key = ?").get(READ_KEY) as
      | { value: string }
      | undefined;
    return row ? Number(row.value) : 0;
  }

  /** Marks everything up to `seq` read; the marker never moves back. Returns the marker. */
  markRead(seq: number): number {
    const next = Math.max(this.readSeq(), Math.min(seq, this.#events.latestSeq()));
    this.#db
      .prepare(
        "insert into station_state (key, value, updated_at) values (?, ?, ?) on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at",
      )
      .run(READ_KEY, String(next), new Date().toISOString());
    return next;
  }

  unread(): number {
    return this.#project({ afterSeq: this.readSeq(), limit: MAX_UNREAD }).items.length;
  }

  page(options: { before?: number; limit?: number } = {}): NotificationPage {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const { items, last } = this.#project({
      ...(options.before !== undefined ? { beforeSeq: options.before } : {}),
      limit,
    });
    return {
      items,
      unread: this.unread(),
      readSeq: this.readSeq(),
      ...(items.length === limit && last !== undefined ? { nextBefore: last } : {}),
    };
  }

  /** Projects matching events until `limit` notifications are found (some events project to none). */
  #project(range: { afterSeq?: number; beforeSeq?: number; limit: number }): {
    items: Notification[];
    last?: number;
  } {
    const items: Notification[] = [];
    let before = range.beforeSeq;
    let last: number | undefined;
    for (;;) {
      const batch = this.#events.ofTypes(NOTIFICATION_EVENT_TYPES, {
        ...(range.afterSeq !== undefined ? { afterSeq: range.afterSeq } : {}),
        ...(before !== undefined ? { beforeSeq: before } : {}),
        limit: 200,
      });
      for (const event of batch) {
        const n = notificationFor(event);
        if (n) {
          items.push(n);
          last = n.seq;
          if (items.length === range.limit) return { items, last };
        }
      }
      if (batch.length < 200) return { items, ...(last !== undefined ? { last } : {}) };
      before = batch[batch.length - 1]?.seq;
    }
  }
}
