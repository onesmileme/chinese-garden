import type { EventStore } from "./ports";
import type { LearningEvent } from "./events";

const MAX_BATCH = 100;
const inFlightByStore = new WeakMap<
  EventStore,
  Map<string, Promise<LearningEvent>>
>();

function inFlightFor(store: EventStore): Map<string, Promise<LearningEvent>> {
  const existing = inFlightByStore.get(store);
  if (existing) return existing;
  const created = new Map<string, Promise<LearningEvent>>();
  inFlightByStore.set(store, created);
  return created;
}

export class EventQueue {
  private readonly inFlight: Map<string, Promise<LearningEvent>>;
  private readonly enqueuedListeners = new Set<() => void | Promise<void>>();

  constructor(private readonly store: EventStore) {
    this.inFlight = inFlightFor(store);
  }

  async enqueue(event: LearningEvent): Promise<void> {
    await this.store.append(event);
    this.notifyEnqueued();
  }

  subscribeEnqueued(listener: () => void | Promise<void>): () => void {
    this.enqueuedListeners.add(listener);
    return () => {
      this.enqueuedListeners.delete(listener);
    };
  }

  async find(eventId: string): Promise<LearningEvent | undefined> {
    return (await this.store.all()).find((event) => event.eventId === eventId);
  }

  enqueueOnce(event: LearningEvent): Promise<LearningEvent> {
    const existing = this.inFlight.get(event.eventId);
    if (existing) return existing;

    const pending = (async () => {
      const events = await this.store.all();
      const stored = events.find(
        (candidate) => candidate.eventId === event.eventId,
      );
      if (stored) return stored;
      await this.store.append(event);
      this.notifyEnqueued();
      return event;
    })().finally(() => {
      if (this.inFlight.get(event.eventId) === pending) {
        this.inFlight.delete(event.eventId);
      }
    });
    this.inFlight.set(event.eventId, pending);
    return pending;
  }

  takeBatch(limit: number): Promise<LearningEvent[]> {
    return this.store.pending(Math.min(limit, MAX_BATCH));
  }

  confirm(eventIds: string[]): Promise<void> {
    return this.store.ack(eventIds);
  }

  private notifyEnqueued(): void {
    for (const listener of [...this.enqueuedListeners]) {
      try {
        void Promise.resolve(listener()).catch(() => {});
      } catch {
        // Persistence has succeeded; observer failures must not reject enqueue.
      }
    }
  }
}
