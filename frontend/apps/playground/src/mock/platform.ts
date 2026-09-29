import {
  mergeQuarantined,
  type ClearableEventQuarantine,
  type ClearableEventStore,
  type Clock,
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

export function createBrowserEventStore(): ClearableEventStore {
  let operations = Promise.resolve();

  function serialize<T>(operation: () => T | Promise<T>): Promise<T> {
    const result = operations.then(operation);
    operations = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  return {
    append: (event) => serialize(() => {
      const all = loadQueue();
      all.push(event);
      saveQueue(all);
    }),
    pending: (count) =>
      operations.then(() => loadQueue().slice(0, count)),
    ack: (ids) => serialize(() => {
      const acknowledged = new Set(ids);
      saveQueue(loadQueue().filter((event) => !acknowledged.has(event.eventId)));
    }),
    all: () => operations.then(() => loadQueue()),
    clear: () => serialize(() => {
      globalThis.localStorage.removeItem(LEGACY_QUEUE_KEY);
      globalThis.localStorage.removeItem(QUEUE_KEY);
    }),
  };
}

export function createBrowserEventQuarantine(): ClearableEventQuarantine {
  let operations = Promise.resolve();

  function serialize<T>(operation: () => T | Promise<T>): Promise<T> {
    const result = operations.then(operation);
    operations = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  return {
    put: (events) => serialize(() => {
      const stored = loadStoredArray<QuarantinedEvent>(QUARANTINE_KEY);
      globalThis.localStorage.setItem(
        QUARANTINE_KEY,
        JSON.stringify(mergeQuarantined(stored.items, events)),
      );
    }),
    all: () =>
      operations.then(
        () => loadStoredArray<QuarantinedEvent>(QUARANTINE_KEY).items,
      ),
    clear: () => serialize(() => {
      globalThis.localStorage.removeItem(QUARANTINE_KEY);
    }),
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
