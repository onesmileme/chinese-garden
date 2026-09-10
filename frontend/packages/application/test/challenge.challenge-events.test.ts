import { describe, expect, it } from "vitest";
import {
  EventQueue,
  recordChallengeCompleted,
  stableChallengeCompletedEventId,
  type EventStore,
  type LearningEvent,
  type RecordChallengeCompletedInput,
} from "../src";

function memoryStore(): EventStore {
  let events: LearningEvent[] = [];
  return {
    append: async (event) => {
      events.push(event);
    },
    pending: async (limit) => events.slice(0, limit),
    ack: async (eventIds) => {
      events = events.filter((event) => !eventIds.includes(event.eventId));
    },
    all: async () => events.slice(),
  };
}

function completionInput(
  overrides: Partial<RecordChallengeCompletedInput> = {},
): RecordChallengeCompletedInput {
  return {
    childProfileId: "child-1",
    deviceId: "device-1",
    clientSequence: 20,
    contentVersion: "content-v1",
    ruleVersion: "rules-v1",
    challengeId: "challenge-1",
    dimension: "POEM",
    startedAt: 1_700_000_000_000,
    completedAt: 1_700_000_090_000,
    winner: "CHILD",
    child: {
      answeredCount: 5,
      correctCount: 4,
      activeElapsedMs: 52_000,
    },
    parent: {
      answeredCount: 5,
      correctCount: 3,
      activeElapsedMs: 58_000,
    },
    ...overrides,
  };
}

describe("recordChallengeCompleted", () => {
  it("records a strict completion event using the challenge identity", async () => {
    const store = memoryStore();
    const queue = new EventQueue(store);

    const event = await recordChallengeCompleted(
      { queue, clock: { now: () => 1_700_000_100_000 } },
      completionInput(),
    );

    expect(event).toEqual({
      eventId: stableChallengeCompletedEventId("challenge-1"),
      childProfileId: "child-1",
      deviceId: "device-1",
      sessionId: "challenge-1",
      eventType: "CHALLENGE_COMPLETED",
      clientSequence: 20,
      contentVersion: "content-v1",
      ruleVersion: "rules-v1",
      occurredAt: 1_700_000_100_000,
      payload: {
        payloadVersion: 1,
        challengeId: "challenge-1",
        dimension: "POEM",
        startedAt: 1_700_000_000_000,
        completedAt: 1_700_000_090_000,
        winner: "CHILD",
        child: {
          answeredCount: 5,
          correctCount: 4,
          activeElapsedMs: 52_000,
        },
        parent: {
          answeredCount: 5,
          correctCount: 3,
          activeElapsedMs: 58_000,
        },
      },
    });
    const recovered = await recordChallengeCompleted(
      { queue, clock: { now: () => 1_700_000_200_000 } },
      completionInput({ clientSequence: 21 }),
    );

    expect(recovered).toEqual(event);
    expect(await store.all()).toEqual([event]);
  });

  it("rejects an invalid completion before enqueueing", async () => {
    const store = memoryStore();
    const queue = new EventQueue(store);

    await expect(
      recordChallengeCompleted(
        { queue, clock: { now: () => 1_700_000_100_000 } },
        completionInput({ completedAt: 1_699_999_999_999 }),
      ),
    ).rejects.toThrow();
    expect(await store.all()).toEqual([]);
  });

  it("rejects a future completion using one captured clock value", async () => {
    const store = memoryStore();
    const queue = new EventQueue(store);
    let clockCalls = 0;

    await expect(
      recordChallengeCompleted(
        {
          queue,
          clock: {
            now: () => {
              clockCalls += 1;
              return 1_700_000_100_000;
            },
          },
        },
        completionInput({ completedAt: 1_700_000_100_001 }),
      ),
    ).rejects.toThrow("completedAt must not be in the future");
    expect(clockCalls).toBe(1);
    expect(await store.all()).toEqual([]);
  });

  it("does not resolve when the event store rejects the completion", async () => {
    const store = memoryStore();
    store.append = async () => {
      throw new Error("quota");
    };
    const queue = new EventQueue(store);

    await expect(
      recordChallengeCompleted(
        { queue, clock: { now: () => 1_700_000_100_000 } },
        completionInput(),
      ),
    ).rejects.toThrow("quota");
  });
});
