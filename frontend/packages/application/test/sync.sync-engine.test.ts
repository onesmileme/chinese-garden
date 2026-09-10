import { describe, it, expect } from "vitest";
import { runSync } from "../src/sync/sync-engine";
import { EventQueue } from "../src/event-queue";
import { mergeQuarantined } from "../src/sync/rejections";
import type {
  EventQuarantine,
  EventStore,
  QuarantinedEvent,
  SyncClient,
} from "../src/ports";
import type { LearningEvent } from "../src/events";

function memStore(seed: LearningEvent[]): EventStore {
  let items = seed.slice();
  return {
    append: async (e) => {
      items.push(e);
    },
    pending: async (n) => items.slice(0, n),
    ack: async (ids) => {
      items = items.filter((e) => !ids.includes(e.eventId));
    },
    all: async () => items.slice(),
  };
}

function memQuarantine(
  seed: readonly QuarantinedEvent[] = [],
): EventQuarantine {
  let items = seed.slice();
  return {
    put: async (events) => {
      items = mergeQuarantined(items, events);
    },
    all: async () => items.slice(),
  };
}

const ev = (id: string): LearningEvent => ({
  eventId: id,
  childProfileId: "c1",
  deviceId: "d",
  sessionId: "s",
  eventType: "LESSON_ANSWER",
  clientSequence: 0,
  contentVersion: "content-v1",
  ruleVersion: "mastery-v1",
  occurredAt: 0,
  payload: {},
});

describe("runSync", () => {
  it("confirms current accepted, duplicated, and rejected events before pulling", async () => {
    const store = memStore([
      ev("accepted"),
      ev("duplicate"),
      ev("invalid"),
      ev("pending"),
    ]);
    const q = new EventQueue(store);
    const quarantine = memQuarantine();
    let cursor = 0;
    const client: SyncClient = {
      push: async () => ({
        accepted: ["accepted", "accepted", "unknown"],
        duplicated: ["duplicate", "duplicate", "unknown"],
        rejected: [
          { eventId: "invalid", code: "INVALID_PAYLOAD" },
          { eventId: "invalid", code: "ANSWER_MISMATCH" },
          { eventId: "unknown", code: "INVALID_ENVELOPE" },
        ],
        serverOffset: 10,
      }),
      pull: async () => ({ events: [ev("remote1")], nextCursor: 42 }),
    };
    const result = await runSync({
      queue: q,
      client,
      quarantine,
      clock: { now: () => 1234 },
      getCursor: () => cursor,
      setCursor: (n) => {
        cursor = n;
      },
    });
    expect(result).toEqual({ pushed: 2, pulled: 1 });
    expect(await store.all()).toEqual([ev("pending")]);
    expect(await quarantine.all()).toEqual([
      {
        event: ev("invalid"),
        code: "INVALID_PAYLOAD",
        quarantinedAt: 1234,
      },
    ]);
    expect(cursor).toBe(42);
  });

  it.each([
    {
      label: "accepted and duplicated",
      accepted: ["contradictory"],
      duplicated: ["contradictory"],
      rejected: [],
    },
    {
      label: "accepted and rejected",
      accepted: ["contradictory"],
      duplicated: [],
      rejected: [
        { eventId: "contradictory", code: "INVALID_PAYLOAD" as const },
      ],
    },
    {
      label: "duplicated and rejected",
      accepted: [],
      duplicated: ["contradictory"],
      rejected: [
        { eventId: "contradictory", code: "INVALID_PAYLOAD" as const },
      ],
    },
  ])(
    "rejects an event reported as $label before mutating local state",
    async ({ accepted, duplicated, rejected }) => {
      const pending = [ev("contradictory"), ev("pending")];
      const store = memStore(pending);
      const quarantine = memQuarantine();
      let pullCalled = false;
      const client: SyncClient = {
        push: async () => ({
          accepted,
          duplicated,
          rejected,
          serverOffset: 10,
        }),
        pull: async () => {
          pullCalled = true;
          return { events: [], nextCursor: 0 };
        },
      };

      await expect(
        runSync({
          queue: new EventQueue(store),
          client,
          quarantine,
          clock: { now: () => 1234 },
          getCursor: () => 0,
          setCursor: () => {},
        }),
      ).rejects.toThrow("contradictory sync receipt");

      expect(await store.all()).toEqual(pending);
      expect(await quarantine.all()).toEqual([]);
      expect(pullCalled).toBe(false);
    },
  );

  it("does nothing harmful when there is nothing to push", async () => {
    const store = memStore([]);
    const q = new EventQueue(store);
    const quarantine = memQuarantine();
    let cursor = 5;
    const client: SyncClient = {
      push: async () => ({
        accepted: [],
        duplicated: [],
        rejected: [],
        serverOffset: 5,
      }),
      pull: async () => ({ events: [], nextCursor: 5 }),
    };
    const result = await runSync({
      queue: q,
      client,
      quarantine,
      clock: { now: () => 1234 },
      getCursor: () => cursor,
      setCursor: (n) => {
        cursor = n;
      },
    });
    expect(result).toEqual({ pushed: 0, pulled: 0 });
    expect(cursor).toBe(5);
  });

  it("leaves rejected events pending when quarantine persistence fails", async () => {
    const accepted = ev("accepted");
    const rejected = ev("invalid");
    const store = memStore([accepted, rejected]);
    const quarantine: EventQuarantine = {
      put: async () => {
        throw new Error("quarantine write failed");
      },
      all: async () => [],
    };
    let pullCalled = false;
    const client: SyncClient = {
      push: async () => ({
        accepted: [accepted.eventId],
        duplicated: [],
        rejected: [{ eventId: rejected.eventId, code: "INVALID_PAYLOAD" }],
        serverOffset: 0,
      }),
      pull: async () => {
        pullCalled = true;
        return { events: [], nextCursor: 0 };
      },
    };

    await expect(
      runSync({
        queue: new EventQueue(store),
        client,
        quarantine,
        clock: { now: () => 1234 },
        getCursor: () => 0,
        setCursor: () => {},
      }),
    ).rejects.toThrow("quarantine write failed");

    expect(await store.all()).toEqual([rejected]);
    expect(pullCalled).toBe(false);
  });

  it("propagates push failures and leaves the entire batch pending", async () => {
    const pending = [ev("first"), ev("second")];
    const store = memStore(pending);
    const quarantine = memQuarantine();
    let pullCalled = false;
    const client: SyncClient = {
      push: async () => {
        throw new Error("network unavailable");
      },
      pull: async () => {
        pullCalled = true;
        return { events: [], nextCursor: 0 };
      },
    };

    await expect(
      runSync({
        queue: new EventQueue(store),
        client,
        quarantine,
        clock: { now: () => 1234 },
        getCursor: () => 0,
        setCursor: () => {},
      }),
    ).rejects.toThrow("network unavailable");

    expect(await store.all()).toEqual(pending);
    expect(await quarantine.all()).toEqual([]);
    expect(pullCalled).toBe(false);
  });
});
