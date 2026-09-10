import { describe, it, expect } from "vitest";
import { learningEventSchema } from "@cc/content-schema";
import { submitAnswer } from "../src/session/submit-answer";
import { EventQueue } from "../src/event-queue";
import type { EventStore } from "../src/ports";
import type { LearningEvent } from "../src/events";
import { stableAnswerEventId } from "../src/session/stable-event-id";

function memStore(): { store: EventStore; items: LearningEvent[] } {
  const items: LearningEvent[] = [];
  return {
    items,
    store: {
      append: async (e) => {
        items.push(e);
      },
      pending: async (n) => items.slice(0, n),
      ack: async () => {},
      all: async () => items.slice(),
    },
  };
}
const session = {
  sessionId: "s1",
  levels: {} as any,
  contentVersion: "content-v1",
  ruleVersion: "mastery-v1",
};
const questionContext = {
  questionSeed: "question-seed-7",
  questionIndex: 7,
  responseTimeMs: 1_250,
  acceptedAnswers: undefined,
};

describe("submitAnswer", () => {
  it("returns a schema-valid V1 answer with caller-supplied question context", async () => {
    const { store } = memStore();
    const event = await submitAnswer(
      {
        queue: new EventQueue(store),
        idGen: { ulid: () => "01ARZ3NDEKTSV4RRFFQ69G5FAV" },
        clock: { now: () => 42 },
      },
      {
        session,
        childProfileId: "c1",
        deviceId: "d1",
        knowledgePointId: "cy-yixinyiyi",
        questionType: "IDIOM_MEANING",
        chosenAnswer: "形容做事专心",
        correctAnswer: "形容做事专心",
        hintCount: 0,
        firstAttempt: true,
        clientSequence: 1,
        ...questionContext,
      },
    );

    expect(() => learningEventSchema.parse(event)).not.toThrow();
    expect(event.eventId).toBe(stableAnswerEventId("s1", 1));
    expect(event.occurredAt).toBe(42);
    expect(event.payload).toMatchObject({
      questionSeed: "question-seed-7",
      questionIndex: 7,
      responseTimeMs: 1_250,
    });
  });

  it("accepts an alternate answer allowed by the presented question", async () => {
    const { store, items } = memStore();
    const q = new EventQueue(store);
    let seq = 0;
    const e = await submitAnswer(
      {
        queue: q,
        idGen: { ulid: () => `id${seq++}` },
        clock: { now: () => 42 },
      },
      {
        session,
        childProfileId: "c1",
        deviceId: "d1",
        knowledgePointId: "cy-huashetianzu",
        questionType: "IDIOM_CHAIN",
        chosenAnswer: "多此一举",
        correctAnswer: "画蛇添足",
        hintCount: 0,
        firstAttempt: true,
        clientSequence: 1,
        ...questionContext,
        acceptedAnswers: ["画蛇添足", "多此一举"],
      },
    );
    expect(items).toHaveLength(1);
    expect(e.eventType).toBe("LESSON_ANSWER");
    expect(e.payload).toMatchObject({
      payloadVersion: 1,
      context: "DAILY_LESSON",
      participant: "CHILD",
      knowledgePointId: "cy-huashetianzu",
      questionType: "IDIOM_CHAIN",
      questionSeed: "question-seed-7",
      questionIndex: 7,
      submittedAnswer: "多此一举",
      correctAnswer: "画蛇添足",
      correct: true,
      firstAttempt: true,
      hintCount: 0,
      responseTimeMs: 1_250,
    });
  });

  it("marks correct=false when chosen differs from authoritative answer", async () => {
    const { store, items } = memStore();
    const q = new EventQueue(store);
    const e = await submitAnswer(
      { queue: q, idGen: { ulid: () => "x" }, clock: { now: () => 1 } },
      {
        session,
        childProfileId: "c1",
        deviceId: "d1",
        knowledgePointId: "cy-yixinyiyi",
        questionType: "IDIOM_MEANING",
        chosenAnswer: "形容犹豫不决",
        correctAnswer: "形容做事专心",
        hintCount: 1,
        firstAttempt: false,
        clientSequence: 2,
        ...questionContext,
      },
    );
    expect(e.payload).toMatchObject({
      correct: false,
      firstAttempt: false,
      hintCount: 1,
    });
    expect(items).toHaveLength(1);
  });

  it("stores repeated submissions with the same event ID only once", async () => {
    const { store, items } = memStore();
    const q = new EventQueue(store);
    const deps = {
      queue: q,
      idGen: { ulid: () => "stable-answer-id" },
      clock: { now: () => 42 },
    };
    const input = {
      session,
      childProfileId: "c1",
      deviceId: "d1",
      knowledgePointId: "cy-yixinyiyi",
      questionType: "IDIOM_MEANING" as const,
      chosenAnswer: "形容做事专心",
      correctAnswer: "形容做事专心",
      hintCount: 0,
      firstAttempt: true,
      clientSequence: 1,
      ...questionContext,
    };

    const first = await submitAnswer(deps, input);
    const second = await submitAnswer(deps, input);

    expect(items).toHaveLength(1);
    expect(second.eventId).toBe(first.eventId);
  });
});
