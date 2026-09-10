import {
  mergeQuarantined,
  type Clock,
  type EventQuarantine,
  type EventStore,
  type IdGen,
  type LearningEvent,
  type QuarantinedEvent,
} from "@cc/application";

const LEGACY_QUEUE_KEY = "cc_event_queue";
const QUEUE_KEY = "cc_event_queue_v2";
const QUARANTINE_KEY = "cc_event_quarantine_v1";

function loadStoredArray<T>(
  key: string,
): { exists: boolean; items: T[] } {
  const raw = globalThis.localStorage.getItem(key);
  if (raw === null) return { exists: false, items: [] };

  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`Expected stored array at ${key}`);
  }
  return { exists: true, items: parsed as T[] };
}

function loadQueue(): LearningEvent[] {
  const current = loadStoredArray<LearningEvent>(QUEUE_KEY);
  if (current.exists) return current.items;

  const legacy = loadStoredArray<LearningEvent>(LEGACY_QUEUE_KEY);
  if (!legacy.exists) return [];

  saveQueue(legacy.items);
  globalThis.localStorage.removeItem(LEGACY_QUEUE_KEY);
  return legacy.items;
}

function saveQueue(events: readonly LearningEvent[]): void {
  globalThis.localStorage.setItem(QUEUE_KEY, JSON.stringify(events));
}

export function createBrowserEventStore(): EventStore {
  return {
    append: async (event) => {
      const all = loadQueue();
      all.push(event);
      saveQueue(all);
    },
    pending: async (count) => loadQueue().slice(0, count),
    ack: async (ids) => {
      const acknowledged = new Set(ids);
      saveQueue(loadQueue().filter((event) => !acknowledged.has(event.eventId)));
    },
    all: async () => loadQueue(),
  };
}

export function createBrowserEventQuarantine(): EventQuarantine {
  return {
    put: async (events) => {
      const stored = loadStoredArray<QuarantinedEvent>(QUARANTINE_KEY);
      globalThis.localStorage.setItem(
        QUARANTINE_KEY,
        JSON.stringify(mergeQuarantined(stored.items, events)),
      );
    },
    all: async () =>
      loadStoredArray<QuarantinedEvent>(QUARANTINE_KEY).items,
  };
}

export const clock: Clock = { now: () => Date.now() };

let sequence = 0;
export const idGen: IdGen = {
  ulid: () => {
    sequence += 1;
    const time = Date.now().toString(36).toUpperCase().padStart(10, "0");
    const random = Math.floor(Math.random() * 0xffffff)
      .toString(36)
      .toUpperCase()
      .padStart(5, "0");
    return `${time}${sequence.toString(36).toUpperCase().padStart(3, "0")}${random}`;
  },
};
