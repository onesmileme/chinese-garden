import { describe, it, expect } from "vitest";
import { EventQueue } from "../src/event-queue";
import type { EventStore } from "../src/ports";
import type { LearningEvent } from "../src/events";

function memStore(): EventStore {
  let items: LearningEvent[] = [];
  return {
    append: async (e) => {
      items.push(e);
    },
    pending: async (limit) => items.slice(0, limit),
    ack: async (ids) => {
      items = items.filter((e) => !ids.includes(e.eventId));
    },
    all: async () => items.slice(),
  };
}
const ev = (id: string, seq: number): LearningEvent => ({
  eventId: id,
  childProfileId: "c1",
  deviceId: "d1",
  sessionId: "s1",
  eventType: "LESSON_ANSWER",
  clientSequence: seq,
  contentVersion: "content-v1",
  ruleVersion: "mastery-v1",
  occurredAt: seq,
  payload: {},
});

describe("EventQueue", () => {
  it("notifies subscribers after persistence without breaking enqueue", async () => {
    const calls: string[] = [];
    const store = memStore();
    const append = store.append;
    store.append = async (event) => {
      await append(event);
      calls.push("persisted");
    };
    const q = new EventQueue(store);
    q.subscribeEnqueued(() => {
      calls.push("notified");
      throw new Error("listener failed");
    });

    await expect(q.enqueue(ev("saved", 1))).resolves.toBeUndefined();

    expect(calls).toEqual(["persisted", "notified"]);
    expect(await store.all()).toEqual([ev("saved", 1)]);
  });

  it("caps batch size at 100 even when limit is larger", async () => {
    const store = memStore();
    const q = new EventQueue(store);
    for (let i = 0; i < 150; i++) await q.enqueue(ev(`e${i}`, i));
    const batch = await q.takeBatch(1000);
    expect(batch).toHaveLength(100);
  });

  it("confirm removes only acknowledged events", async () => {
    const store = memStore();
    const q = new EventQueue(store);
    await q.enqueue(ev("a", 0));
    await q.enqueue(ev("b", 1));
    await q.confirm(["a"]);
    const rest = await store.all();
    expect(rest.map((e) => e.eventId)).toEqual(["b"]);
  });

  it("returns an already stored event without appending a duplicate", async () => {
    const store = memStore();
    const q = new EventQueue(store);
    await q.enqueue(ev("same", 1));

    const stored = await q.enqueueOnce(ev("same", 999));

    expect(await store.all()).toEqual([ev("same", 1)]);
    expect(stored).toEqual(ev("same", 1));
  });

  it("notifies once only when enqueueOnce persists a new event", async () => {
    const store = memStore();
    const q = new EventQueue(store);
    let notifications = 0;
    q.subscribeEnqueued(() => {
      notifications += 1;
    });
    await q.enqueue(ev("stored", 1));
    notifications = 0;

    await q.enqueueOnce(ev("stored", 999));
    const first = q.enqueueOnce(ev("new", 2));
    const second = q.enqueueOnce(ev("new", 2));
    await Promise.all([first, second]);

    expect(notifications).toBe(1);
  });

  it("coalesces concurrent calls across queues sharing one store", async () => {
    const store = memStore();
    const append = store.append;
    let appendCount = 0;
    let releaseAppend: () => void = () => {};
    const appendBlocked = new Promise<void>((resolve) => {
      releaseAppend = resolve;
    });
    let markAppendStarted: () => void = () => {};
    const appendStarted = new Promise<void>((resolve) => {
      markAppendStarted = resolve;
    });
    store.append = async (event) => {
      appendCount += 1;
      markAppendStarted();
      await appendBlocked;
      await append(event);
    };
    const firstQueue = new EventQueue(store);
    const secondQueue = new EventQueue(store);

    const first = firstQueue.enqueueOnce(ev("same", 1));
    await appendStarted;
    const second = secondQueue.enqueueOnce(ev("same", 1));

    expect(second).toBe(first);
    releaseAppend();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(appendCount).toBe(1);
    expect(await store.all()).toEqual([ev("same", 1)]);
    expect(secondResult).toBe(firstResult);
  });

  it("releases a shared failed write so another queue can retry it", async () => {
    const store = memStore();
    const append = store.append;
    let shouldFail = true;
    store.append = async (event) => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error("storage failed");
      }
      await append(event);
    };
    const firstQueue = new EventQueue(store);
    const secondQueue = new EventQueue(store);

    const first = firstQueue.enqueueOnce(ev("retry", 1));
    const second = secondQueue.enqueueOnce(ev("retry", 1));
    expect(second).toBe(first);
    await expect(Promise.all([first, second])).rejects.toThrow("storage failed");

    await expect(secondQueue.enqueueOnce(ev("retry", 1))).resolves.toEqual(
      ev("retry", 1),
    );
    expect(await store.all()).toEqual([ev("retry", 1)]);
  });
});
