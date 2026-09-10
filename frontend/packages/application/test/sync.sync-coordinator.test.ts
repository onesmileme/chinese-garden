import { describe, expect, it, vi } from "vitest";
import { EventQueue } from "../src/event-queue";
import {
  createSyncCoordinator,
  type SyncCursorStore,
  type SyncScheduler,
} from "../src/sync/sync-coordinator";
import type {
  EventQuarantine,
  EventStore,
  SyncClient,
} from "../src/ports";
import type { LearningEvent } from "../src/events";

const event: LearningEvent = {
  eventId: "00000000000000000000000000",
  childProfileId: "child-1",
  deviceId: "device-1",
  sessionId: "session-1",
  eventType: "LESSON_ANSWER",
  clientSequence: 1,
  contentVersion: "content-v1",
  ruleVersion: "mastery-v1",
  occurredAt: 1_000,
  payload: {},
};

function emptyQueue(): EventQueue {
  const store: EventStore = {
    append: async () => {},
    pending: async () => [],
    ack: async () => {},
    all: async () => [],
  };
  return new EventQueue(store);
}

function emptyQuarantine(): EventQuarantine {
  return {
    put: async () => {},
    all: async () => [],
  };
}

function scheduler(): SyncScheduler {
  return {
    delay: vi.fn(async () => {}),
    isRetriable: () => false,
  };
}

describe("createSyncCoordinator", () => {
  it("runs after authenticated start with the principal cursor", async () => {
    const pull = vi.fn(async () => ({ events: [], nextCursor: 42 }));
    const client: SyncClient = {
      push: vi.fn(async () => ({
        accepted: [],
        duplicated: [],
        rejected: [],
        serverOffset: 0,
      })),
      pull,
    };
    const cursorStore: SyncCursorStore = {
      read: vi.fn(async () => 17),
      write: vi.fn(async () => {}),
    };
    const coordinator = createSyncCoordinator({
      queue: emptyQueue(),
      client,
      quarantine: emptyQuarantine(),
      clock: { now: () => 1_000 },
      cursorStore,
      scheduler: scheduler(),
      principal: async () => "principal-1",
    });

    await coordinator.start();

    expect(pull).toHaveBeenCalledWith(17, 100);
    expect(cursorStore.read).toHaveBeenCalledWith("principal-1");
    expect(cursorStore.write).toHaveBeenCalledWith("principal-1", 42);
  });

  it("returns the same in-flight promise for concurrent sync requests", async () => {
    let releasePull: () => void = () => {};
    const pullBlocked = new Promise<void>((resolve) => {
      releasePull = resolve;
    });
    const pull = vi.fn(async () => {
      await pullBlocked;
      return { events: [], nextCursor: 1 };
    });
    const coordinator = createSyncCoordinator({
      queue: emptyQueue(),
      client: {
        push: vi.fn(),
        pull,
      },
      quarantine: emptyQuarantine(),
      clock: { now: () => 1_000 },
      cursorStore: {
        read: async () => 0,
        write: async () => {},
      },
      scheduler: scheduler(),
      principal: async () => "principal-1",
    });

    const first = coordinator.syncNow();
    const second = coordinator.syncNow();

    expect(second).toBe(first);
    releasePull();
    await Promise.all([first, second]);
    expect(pull).toHaveBeenCalledTimes(1);
  });

  it("uploads an event enqueued during an in-flight sync without blocking enqueue", async () => {
    let items: LearningEvent[] = [];
    const queue = new EventQueue({
      append: async (item) => {
        items.push(item);
      },
      pending: async (limit) => items.slice(0, limit),
      ack: async (eventIds) => {
        items = items.filter((item) => !eventIds.includes(item.eventId));
      },
      all: async () => items.slice(),
    });
    let markFirstPullStarted: () => void = () => {};
    const firstPullStarted = new Promise<void>((resolve) => {
      markFirstPullStarted = resolve;
    });
    let releaseFirstPull: () => void = () => {};
    const firstPullBlocked = new Promise<void>((resolve) => {
      releaseFirstPull = resolve;
    });
    const pull = vi
      .fn()
      .mockImplementationOnce(async () => {
        markFirstPullStarted();
        await firstPullBlocked;
        return { events: [], nextCursor: 1 };
      })
      .mockResolvedValue({ events: [], nextCursor: 2 });
    const push = vi.fn(async (events: LearningEvent[]) => ({
      accepted: events.map((item) => item.eventId),
      duplicated: [],
      rejected: [],
      serverOffset: 1,
    }));
    const coordinator = createSyncCoordinator({
      queue,
      client: { push, pull },
      quarantine: emptyQuarantine(),
      clock: { now: () => 1_000 },
      cursorStore: {
        read: async () => 0,
        write: async () => {},
      },
      scheduler: scheduler(),
      principal: async () => "principal-1",
    });

    const started = coordinator.start();
    await firstPullStarted;
    await expect(queue.enqueue(event)).resolves.toBeUndefined();
    releaseFirstPull();
    await started;

    expect(push).toHaveBeenCalledWith([event]);
    expect(pull).toHaveBeenCalledTimes(2);
  });

  it("retries retriable failures with bounded exponential delays", async () => {
    const failure = new Error("network unavailable");
    const pull = vi.fn();
    pull
      .mockRejectedValueOnce(failure)
      .mockRejectedValueOnce(failure)
      .mockRejectedValueOnce(failure)
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ events: [], nextCursor: 9 });
    const cursorStore: SyncCursorStore = {
      read: vi.fn(async () => 3),
      write: vi.fn(async () => {}),
    };
    const retryScheduler: SyncScheduler = {
      delay: vi.fn(async () => {}),
      isRetriable: vi.fn(() => true),
    };
    const coordinator = createSyncCoordinator({
      queue: emptyQueue(),
      client: { push: vi.fn(), pull },
      quarantine: emptyQuarantine(),
      clock: { now: () => 1_000 },
      cursorStore,
      scheduler: retryScheduler,
      principal: async () => "principal-1",
    });

    await expect(coordinator.syncNow()).resolves.toEqual({
      pushed: 0,
      pulled: 0,
    });

    expect(retryScheduler.delay).toHaveBeenCalledTimes(4);
    expect(retryScheduler.delay).toHaveBeenNthCalledWith(1, 1_000);
    expect(retryScheduler.delay).toHaveBeenNthCalledWith(2, 2_000);
    expect(retryScheduler.delay).toHaveBeenNthCalledWith(3, 4_000);
    expect(retryScheduler.delay).toHaveBeenNthCalledWith(4, 8_000);
    expect(cursorStore.read).toHaveBeenCalledTimes(5);
    expect(cursorStore.write).toHaveBeenCalledTimes(1);
  });

  it("does not retry errors rejected by the scheduler", async () => {
    const failure = new Error("protocol mismatch");
    const pull = vi.fn(async () => {
      throw failure;
    });
    const retryScheduler: SyncScheduler = {
      delay: vi.fn(async () => {}),
      isRetriable: vi.fn(() => false),
    };
    const coordinator = createSyncCoordinator({
      queue: emptyQueue(),
      client: { push: vi.fn(), pull },
      quarantine: emptyQuarantine(),
      clock: { now: () => 1_000 },
      cursorStore: {
        read: async () => 0,
        write: vi.fn(async () => {}),
      },
      scheduler: retryScheduler,
      principal: async () => "principal-1",
    });

    await expect(coordinator.syncNow()).rejects.toBe(failure);

    expect(pull).toHaveBeenCalledTimes(1);
    expect(retryScheduler.isRetriable).toHaveBeenCalledWith(failure);
    expect(retryScheduler.delay).not.toHaveBeenCalled();
  });

  it("starts from cursor zero when no principal cursor is stored", async () => {
    const pull = vi.fn(async () => ({ events: [], nextCursor: 5 }));
    const cursorStore: SyncCursorStore = {
      read: vi.fn(async () => null),
      write: vi.fn(async () => {}),
    };
    const coordinator = createSyncCoordinator({
      queue: emptyQueue(),
      client: {
        push: vi.fn(async () => ({
          accepted: [],
          duplicated: [],
          rejected: [],
          serverOffset: 0,
        })),
        pull,
      },
      quarantine: emptyQuarantine(),
      clock: { now: () => 1_000 },
      cursorStore,
      scheduler: scheduler(),
      principal: async () => "principal-1",
    });

    await coordinator.syncNow();

    expect(pull).toHaveBeenCalledWith(0, 100);
    expect(cursorStore.write).toHaveBeenCalledWith("principal-1", 5);
  });

  it("rethrows once the retriable retry budget is exhausted", async () => {
    const failure = new Error("network unavailable");
    const pull = vi.fn(async () => {
      throw failure;
    });
    const retryScheduler: SyncScheduler = {
      delay: vi.fn(async () => {}),
      isRetriable: vi.fn(() => true),
    };
    const coordinator = createSyncCoordinator({
      queue: emptyQueue(),
      client: { push: vi.fn(), pull },
      quarantine: emptyQuarantine(),
      clock: { now: () => 1_000 },
      cursorStore: {
        read: async () => 0,
        write: vi.fn(async () => {}),
      },
      scheduler: retryScheduler,
      principal: async () => "principal-1",
    });

    await expect(coordinator.syncNow()).rejects.toBe(failure);

    // 4 个退避间隔用尽后第 5 次仍失败，无更多间隔可用，抛出原始错误。
    expect(pull).toHaveBeenCalledTimes(5);
    expect(retryScheduler.delay).toHaveBeenCalledTimes(4);
  });

  it("returns totals so far when the principal disappears before a requested rerun", async () => {
    const queue = emptyQueue();
    let principalId: string | null = "principal-1";
    let markFirstPullStarted: () => void = () => {};
    const firstPullStarted = new Promise<void>((resolve) => {
      markFirstPullStarted = resolve;
    });
    let releaseFirstPull: () => void = () => {};
    const firstPullBlocked = new Promise<void>((resolve) => {
      releaseFirstPull = resolve;
    });
    const pull = vi.fn(async () => {
      markFirstPullStarted();
      await firstPullBlocked;
      return { events: [], nextCursor: 1 };
    });
    const coordinator = createSyncCoordinator({
      queue,
      client: {
        push: vi.fn(async () => ({
          accepted: [],
          duplicated: [],
          rejected: [],
          serverOffset: 0,
        })),
        pull,
      },
      quarantine: emptyQuarantine(),
      clock: { now: () => 1_000 },
      cursorStore: {
        read: async () => 0,
        write: async () => {},
      },
      scheduler: scheduler(),
      // 第一轮以 principal-1 完成，随后要求重跑；重跑时登录态已失效。
      principal: vi.fn(async () => {
        const current = principalId;
        principalId = null;
        return current;
      }),
    });

    const started = coordinator.start();
    await firstPullStarted;
    // 首轮 sync 在飞行中时入队，订阅回调置位 rerunRequested。
    await queue.enqueue(event);
    releaseFirstPull();

    // 首轮成功（ran=true），重跑时 principal 为 null，返回已累计的 total。
    await expect(started).resolves.toEqual({ pushed: 0, pulled: 0 });
    expect(pull).toHaveBeenCalledTimes(1);
  });

  it("waits for authentication and stops queue-triggered sync after dispose", async () => {
    const queue = emptyQueue();
    let principalId: string | null = null;
    let markPullStarted: () => void = () => {};
    const pullStarted = new Promise<void>((resolve) => {
      markPullStarted = resolve;
    });
    let releasePull: () => void = () => {};
    const pullBlocked = new Promise<void>((resolve) => {
      releasePull = resolve;
    });
    const pull = vi.fn(async () => {
      markPullStarted();
      await pullBlocked;
      return { events: [], nextCursor: 1 };
    });
    const cursorStore: SyncCursorStore = {
      read: vi.fn(async () => 0),
      write: vi.fn(async () => {}),
    };
    const coordinator = createSyncCoordinator({
      queue,
      client: { push: vi.fn(), pull },
      quarantine: emptyQuarantine(),
      clock: { now: () => 1_000 },
      cursorStore,
      scheduler: scheduler(),
      principal: async () => principalId,
    });

    await expect(coordinator.start()).resolves.toBeNull();
    expect(cursorStore.read).not.toHaveBeenCalled();
    expect(pull).not.toHaveBeenCalled();

    principalId = "principal-1";
    await queue.enqueue(event);
    await pullStarted;
    const triggered = coordinator.syncNow();
    releasePull();
    await triggered;
    expect(pull).toHaveBeenCalledTimes(1);

    coordinator.dispose();
    await queue.enqueue({ ...event, eventId: "00000000000000000000000001" });
    await Promise.resolve();
    expect(pull).toHaveBeenCalledTimes(1);
  });
});
