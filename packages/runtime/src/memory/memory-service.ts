import { ConflictError, NotFoundError } from "../crew/crew-service.js";
import type { EventStore } from "../storage/event-store.js";
import type { MemoryRecord, MemoryStore } from "./memory-store.js";

/**
 * Memory review (brief §14): agents propose; only the Commander approves (optionally editing
 * first) or rejects, and can later edit or delete a stored belief. Every decision is an event.
 */
export class MemoryService {
  readonly #store: MemoryStore;
  readonly #events: EventStore;

  constructor(options: { store: MemoryStore; events: EventStore }) {
    this.#store = options.store;
    this.#events = options.events;
  }

  #get(id: string, want: "proposed" | "approved"): MemoryRecord {
    const m = this.#store.get(id);
    if (!m) throw new NotFoundError(`no memory "${id}"`);
    if (m.status !== want) {
      throw new ConflictError(
        want === "proposed"
          ? `this memory was already ${m.status}`
          : "only a stored belief can be changed",
      );
    }
    return m;
  }

  approve(id: string, editedText?: string): MemoryRecord {
    const m = this.#get(id, "proposed");
    const approved = this.#store.decide(id, "approved", editedText);
    this.#events.append({ type: "memory.approved", agentId: m.agentId, payload: { memoryId: id } });
    return approved;
  }

  reject(id: string): MemoryRecord {
    const m = this.#get(id, "proposed");
    const rejected = this.#store.decide(id, "rejected");
    this.#events.append({ type: "memory.rejected", agentId: m.agentId, payload: { memoryId: id } });
    return rejected;
  }

  edit(id: string, text: string): MemoryRecord {
    const m = this.#get(id, "approved");
    const edited = this.#store.setText(id, text);
    this.#events.append({
      type: "memory.updated",
      agentId: m.agentId,
      payload: { memoryId: id, change: "edited" },
    });
    return edited;
  }

  delete(id: string): void {
    const m = this.#get(id, "approved");
    this.#store.remove(id);
    this.#events.append({
      type: "memory.updated",
      agentId: m.agentId,
      payload: { memoryId: id, change: "deleted" },
    });
  }

  /** What goes into this agent's prompt: its own beliefs and all station-wide ones, newest first. */
  beliefsFor(agentId: string): MemoryRecord[] {
    return this.#store.beliefsFor(agentId);
  }

  /** The Memory screen for one agent. */
  view(agentId: string): { proposals: MemoryRecord[]; beliefs: MemoryRecord[] } {
    return {
      proposals: this.#store.list(agentId).filter((m) => m.status === "proposed"),
      beliefs: this.#store.beliefsFor(agentId),
    };
  }
}
