import { describe, expect, it } from "vitest";
import {
  EventQueue,
  recordAnswer,
  stableAnswerEventId,
  stableChallengeAnswerEventId,
  type EventStore,
  type LearningEvent,
  type RecordAnswerInput,
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

function dailyAnswerInput(
  overrides: Partial<RecordAnswerInput> = {},
): RecordAnswerInput {
  return {
    childProfileId: "child-1",
    deviceId: "device-1",
    sessionId: "session-1",
    clientSequence: 7,
    contentVersion: "content-v1",
    ruleVersion: "rules-v1",
    context: "DAILY_LESSON",
    participant: "CHILD",
    knowledgePointId: "idiom-001",
    questionType: "IDIOM_CHAIN",
    questionSeed: "seed-7",
    questionIndex: 2,
    submittedAnswer: "画蛇添足 ",
    correctAnswer: "画蛇添足",
    firstAttempt: true,
    hintCount: 1,
    responseTimeMs: 4_200,
    ...overrides,
  } as RecordAnswerInput;
}

describe("recordAnswer", () => {
  it("records a strict daily answer event with exact-match correctness", async () => {
    const store = memoryStore();
    const queue = new EventQueue(store);

    const event = await recordAnswer(
      { queue, clock: { now: () => 1_700_000_000_000 } },
      dailyAnswerInput(),
    );

    expect(event).toEqual({
      eventId: stableAnswerEventId("session-1", 7),
      childProfileId: "child-1",
      deviceId: "device-1",
      sessionId: "session-1",
      eventType: "LESSON_ANSWER",
      clientSequence: 7,
      contentVersion: "content-v1",
      ruleVersion: "rules-v1",
      occurredAt: 1_700_000_000_000,
      payload: {
        payloadVersion: 1,
        context: "DAILY_LESSON",
        participant: "CHILD",
        knowledgePointId: "idiom-001",
        questionType: "IDIOM_CHAIN",
        questionSeed: "seed-7",
        questionIndex: 2,
        submittedAnswer: "画蛇添足 ",
        correctAnswer: "画蛇添足",
        correct: false,
        firstAttempt: true,
        hintCount: 1,
        responseTimeMs: 4_200,
      },
    });
    expect(await store.all()).toEqual([event]);
  });

  it("accepts an alternate idiom answer without persisting accepted answers", async () => {
    const store = memoryStore();
    const queue = new EventQueue(store);

    const event = await recordAnswer(
      { queue, clock: { now: () => 1_700_000_000_000 } },
      dailyAnswerInput({
        submittedAnswer: "多此一举",
        acceptedAnswers: ["画蛇添足", "多此一举"],
      }),
    );

    expect(event.payload.correct).toBe(true);
    expect(event.payload).not.toHaveProperty("acceptedAnswers");
    expect((await store.all())[0]?.payload).not.toHaveProperty(
      "acceptedAnswers",
    );
  });

  it("compares serialized poem fill answers exactly", async () => {
    const exactAnswer = '["床前明月光","疑是地上霜"]';
    const exact = await recordAnswer(
      {
        queue: new EventQueue(memoryStore()),
        clock: { now: () => 1_700_000_000_000 },
      },
      dailyAnswerInput({
        questionType: "POEM_FILL",
        submittedAnswer: exactAnswer,
        correctAnswer: exactAnswer,
      }),
    );
    const reformatted = await recordAnswer(
      {
        queue: new EventQueue(memoryStore()),
        clock: { now: () => 1_700_000_000_000 },
      },
      dailyAnswerInput({
        clientSequence: 8,
        questionType: "POEM_FILL",
        submittedAnswer: '["床前明月光", "疑是地上霜"]',
        correctAnswer: exactAnswer,
      }),
    );

    expect(exact.payload.correct).toBe(true);
    expect(reformatted.payload.correct).toBe(false);
  });

  it("deduplicates recovered challenge answers by participant and question", async () => {
    const store = memoryStore();
    const queue = new EventQueue(store);
    const input = {
      childProfileId: "child-1",
      deviceId: "device-1",
      sessionId: "challenge-1",
      clientSequence: 10,
      contentVersion: "content-v1",
      ruleVersion: "rules-v1",
      context: "CHALLENGE" as const,
      participant: "PARENT" as const,
      knowledgePointId: "cy-yixinyiyi",
      questionType: "IDIOM_CHAIN" as const,
      questionSeed: "challenge-seed",
      questionIndex: 3,
      submittedAnswer: "万众一心",
      correctAnswer: "万众一心",
      firstAttempt: true,
      hintCount: 0,
      responseTimeMs: 2_000,
      challenge: {
        challengeId: "challenge-1",
        dimension: "IDIOM" as const,
        participantDifficulty: 3 as const,
      },
    };

    const first = await recordAnswer(
      { queue, clock: { now: () => 1_700_000_000_000 } },
      input,
    );
    const recovered = await recordAnswer(
      { queue, clock: { now: () => 1_700_000_000_100 } },
      { ...input, clientSequence: 11 },
    );

    expect(first.eventId).toBe(
      stableChallengeAnswerEventId("challenge-1", "PARENT", 3),
    );
    expect(recovered).toEqual(first);
    expect(await store.all()).toEqual([first]);
    expect(first).toMatchObject({
      eventType: "CHALLENGE_ANSWER",
      payload: {
        payloadVersion: 1,
        context: "CHALLENGE",
        participant: "PARENT",
        correct: true,
        challenge: {
          challengeId: "challenge-1",
          dimension: "IDIOM",
          participantDifficulty: 3,
        },
      },
    });
  });

  it.each([
    ["ASSESSMENT", "ASSESSMENT_ANSWER"],
    ["FREE_PRACTICE", "PRACTICE_ANSWER"],
  ] as const)("maps %s answers to %s events", async (context, eventType) => {
    const store = memoryStore();
    const queue = new EventQueue(store);

    const event = await recordAnswer(
      { queue, clock: { now: () => 1_700_000_000_000 } },
      dailyAnswerInput({ context }),
    );

    expect(event.eventType).toBe(eventType);
    expect(event.payload.context).toBe(context);
  });

  it("rejects response times above ten minutes before enqueueing", async () => {
    const store = memoryStore();
    const queue = new EventQueue(store);

    await expect(
      recordAnswer(
        { queue, clock: { now: () => 1_700_000_000_000 } },
        dailyAnswerInput({ responseTimeMs: 600_001 }),
      ),
    ).rejects.toThrow();
    expect(await store.all()).toEqual([]);
  });

  it("does not resolve when the event store rejects the answer", async () => {
    const store = memoryStore();
    store.append = async () => {
      throw new Error("quota");
    };
    const queue = new EventQueue(store);

    await expect(
      recordAnswer(
        { queue, clock: { now: () => 1_700_000_000_000 } },
        dailyAnswerInput(),
      ),
    ).rejects.toThrow("quota");
  });
});
