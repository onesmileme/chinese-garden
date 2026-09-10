import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, expectTypeOf, it } from "vitest";
import answerEventJsonSchema from "../../../content/contracts/answer-event-v1.schema.json";
import challengeCompletedJsonSchema from "../../../content/contracts/challenge-completed-v1.schema.json";
import vectors from "../../../content/test-vectors/answer-events-v1.json";
import {
  answerPayloadV1Schema,
  challengeCompletedPayloadV1Schema,
  learningEventSchema,
  type AnswerPayloadV1,
  type LearningEventContract,
} from "../src";

const EVENT_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const CHILD_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAW";
const SESSION_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAX";

const ajv = new Ajv2020({ allErrors: true });
ajv.addVocabulary(["x-runtime-invariants"]);
const validateAnswerJson = ajv.compile(answerEventJsonSchema);
const validateChallengeCompletedJson = ajv.compile(
  challengeCompletedJsonSchema,
);

const payloadStructuralInvalidNames = new Set([
  "parent-outside-challenge",
  "unsupported-version",
  "response-time-too-large",
]);
const payloadStructuralInvalidVectors = vectors.schemaInvalid.filter(
  ({ name }) => payloadStructuralInvalidNames.has(name),
);

function validatePayload(event: { eventType: string; payload: unknown }) {
  if (event.eventType === "CHALLENGE_COMPLETED") {
    return {
      jsonSchema: validateChallengeCompletedJson(event.payload),
      zod: challengeCompletedPayloadV1Schema.safeParse(event.payload).success,
    };
  }

  return {
    jsonSchema: validateAnswerJson(event.payload),
    zod: answerPayloadV1Schema.safeParse(event.payload).success,
  };
}

function eventEnvelope(eventType: string) {
  return {
    eventId: EVENT_ID,
    childProfileId: CHILD_ID,
    deviceId: "device-1",
    sessionId: SESSION_ID,
    eventType,
    clientSequence: 0,
    contentVersion: "corpus-v5",
    ruleVersion: "mastery-v1",
    occurredAt: 1_777_600_000_000,
  };
}

function answerPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    payloadVersion: 1,
    context: "DAILY_LESSON",
    participant: "CHILD",
    knowledgePointId: "cy-madaochenggong",
    questionType: "IDIOM_MEANING",
    questionSeed: "seed-1",
    questionIndex: 0,
    submittedAnswer: "事情顺利，很快取得成功",
    correctAnswer: "事情顺利，很快取得成功",
    correct: true,
    firstAttempt: true,
    hintCount: 0,
    responseTimeMs: 1_250,
    ...overrides,
  };
}

describe("inferred event contract types", () => {
  it("discriminates answer metadata by context", () => {
    type ChallengePayload = Extract<
      AnswerPayloadV1,
      { context: "CHALLENGE" }
    >;
    type LessonPayload = Extract<
      AnswerPayloadV1,
      { context: "DAILY_LESSON" }
    >;

    expectTypeOf<ChallengePayload["participant"]>().toEqualTypeOf<
      "CHILD" | "PARENT"
    >();
    expectTypeOf<ChallengePayload>().toHaveProperty("challenge");
    expectTypeOf<LessonPayload["participant"]>().toEqualTypeOf<"CHILD">();
    expectTypeOf<
      "challenge" extends keyof LessonPayload ? true : false
    >().toEqualTypeOf<false>();
  });

  it("discriminates answer payload context by event type", () => {
    type AssessmentEvent = Extract<
      LearningEventContract,
      { eventType: "ASSESSMENT_ANSWER" }
    >;
    type LessonEvent = Extract<
      LearningEventContract,
      { eventType: "LESSON_ANSWER" }
    >;
    type PracticeEvent = Extract<
      LearningEventContract,
      { eventType: "PRACTICE_ANSWER" }
    >;
    type ChallengeEvent = Extract<
      LearningEventContract,
      { eventType: "CHALLENGE_ANSWER" }
    >;

    expectTypeOf<
      AssessmentEvent["payload"]["context"]
    >().toEqualTypeOf<"ASSESSMENT">();
    expectTypeOf<
      LessonEvent["payload"]["context"]
    >().toEqualTypeOf<"DAILY_LESSON">();
    expectTypeOf<
      PracticeEvent["payload"]["context"]
    >().toEqualTypeOf<"FREE_PRACTICE">();
    expectTypeOf<
      ChallengeEvent["payload"]["context"]
    >().toEqualTypeOf<"CHALLENGE">();
  });
});

describe("answerPayloadV1Schema", () => {
  it("accepts inclusive field bounds", () => {
    expect(
      answerPayloadV1Schema.parse(
        answerPayload({
          knowledgePointId: "k".repeat(64),
          questionSeed: "s".repeat(128),
          submittedAnswer: "a".repeat(512),
          correctAnswer: "b".repeat(512),
          responseTimeMs: 600_000,
        }),
      ),
    ).toBeDefined();
  });

  it.each([
    ["knowledgePointId", "k".repeat(65)],
    ["questionSeed", "s".repeat(129)],
    ["submittedAnswer", "a".repeat(513)],
    ["correctAnswer", "b".repeat(513)],
    ["responseTimeMs", 600_001],
  ])("rejects %s above its maximum", (field, value) => {
    expect(() =>
      answerPayloadV1Schema.parse(answerPayload({ [field]: value })),
    ).toThrow();
  });

  it("rejects parent answers outside challenge", () => {
    expect(() =>
      answerPayloadV1Schema.parse(
        answerPayload({
          context: "FREE_PRACTICE",
          participant: "PARENT",
        }),
      ),
    ).toThrow();
  });

  it("requires challenge metadata exactly for challenge context", () => {
    expect(() =>
      answerPayloadV1Schema.parse(
        answerPayload({ context: "CHALLENGE" }),
      ),
    ).toThrow();
    expect(() =>
      answerPayloadV1Schema.parse(
        answerPayload({
          challenge: {
            challengeId: SESSION_ID,
            dimension: "IDIOM",
            participantDifficulty: 3,
          },
        }),
      ),
    ).toThrow();
  });
});

describe("challengeCompletedPayloadV1Schema", () => {
  it("accepts a completion at the challenge start time", () => {
    expect(
      challengeCompletedPayloadV1Schema.parse({
        payloadVersion: 1,
        challengeId: SESSION_ID,
        dimension: "IDIOM",
        startedAt: 100,
        completedAt: 100,
        winner: "DRAW",
        child: {
          answeredCount: 0,
          correctCount: 0,
          activeElapsedMs: 0,
        },
        parent: {
          answeredCount: 0,
          correctCount: 0,
          activeElapsedMs: 0,
        },
      }),
    ).toBeDefined();
  });

  it("rejects completion before the challenge start", () => {
    expect(() =>
      challengeCompletedPayloadV1Schema.parse({
        payloadVersion: 1,
        challengeId: SESSION_ID,
        dimension: "IDIOM",
        startedAt: 101,
        completedAt: 100,
        winner: "DRAW",
        child: {
          answeredCount: 0,
          correctCount: 0,
          activeElapsedMs: 0,
        },
        parent: {
          answeredCount: 0,
          correctCount: 0,
          activeElapsedMs: 0,
        },
      }),
    ).toThrow();
  });

  it.each(["child", "parent"] as const)(
    "rejects %s correct counts above answered counts",
    (participant) => {
      expect(() =>
        challengeCompletedPayloadV1Schema.parse({
          payloadVersion: 1,
          challengeId: SESSION_ID,
          dimension: "IDIOM",
          startedAt: 100,
          completedAt: 101,
          winner: "DRAW",
          child: {
            answeredCount: 1,
            correctCount: participant === "child" ? 2 : 1,
            activeElapsedMs: 100,
          },
          parent: {
            answeredCount: 1,
            correctCount: participant === "parent" ? 2 : 1,
            activeElapsedMs: 100,
          },
        }),
      ).toThrow();
    },
  );
});

describe("learningEventSchema", () => {
  it.each([
    ["ASSESSMENT_ANSWER", "ASSESSMENT"],
    ["LESSON_ANSWER", "DAILY_LESSON"],
    ["PRACTICE_ANSWER", "FREE_PRACTICE"],
  ])("accepts %s with child context %s", (eventType, context) => {
    expect(
      learningEventSchema.parse({
        ...eventEnvelope(eventType),
        payload: answerPayload({ context }),
      }),
    ).toBeDefined();
  });

  it("accepts challenge answers when challenge and session IDs match", () => {
    expect(
      learningEventSchema.parse({
        ...eventEnvelope("CHALLENGE_ANSWER"),
        payload: answerPayload({
          context: "CHALLENGE",
          participant: "PARENT",
          challenge: {
            challengeId: SESSION_ID,
            dimension: "POEM",
            participantDifficulty: 5,
          },
        }),
      }),
    ).toBeDefined();
  });

  it("rejects event type and context mismatches", () => {
    expect(() =>
      learningEventSchema.parse({
        ...eventEnvelope("LESSON_ANSWER"),
        payload: answerPayload({ context: "ASSESSMENT" }),
      }),
    ).toThrow();
  });

  it("rejects a challenge ID that differs from the session ID", () => {
    expect(() =>
      learningEventSchema.parse({
        ...eventEnvelope("CHALLENGE_ANSWER"),
        payload: answerPayload({
          context: "CHALLENGE",
          challenge: {
            challengeId: "01ARZ3NDEKTSV4RRFFQ69G5FAY",
            dimension: "IDIOM",
            participantDifficulty: 2,
          },
        }),
      }),
    ).toThrow();
  });

  it("rejects a completed challenge ID that differs from the session ID", () => {
    expect(() =>
      learningEventSchema.parse({
        ...eventEnvelope("CHALLENGE_COMPLETED"),
        payload: {
          payloadVersion: 1,
          challengeId: "01ARZ3NDEKTSV4RRFFQ69G5FAY",
          dimension: "POEM",
          startedAt: 100,
          completedAt: 101,
          winner: "DRAW",
          child: { answeredCount: 1, correctCount: 1, activeElapsedMs: 100 },
          parent: { answeredCount: 1, correctCount: 0, activeElapsedMs: 100 },
        },
      }),
    ).toThrow();
  });

  it.each([
    {
      ...eventEnvelope("LESSON_ANSWER"),
      payload: answerPayload(),
      unexpected: true,
    },
    {
      ...eventEnvelope("CHALLENGE_COMPLETED"),
      payload: {
        payloadVersion: 1,
        challengeId: SESSION_ID,
        dimension: "POEM",
        startedAt: 100,
        completedAt: 101,
        winner: "DRAW",
        child: { answeredCount: 0, correctCount: 0, activeElapsedMs: 0 },
        parent: { answeredCount: 0, correctCount: 0, activeElapsedMs: 0 },
      },
      unexpected: true,
    },
  ])("rejects unknown fields on versioned event envelopes", (event) => {
    expect(() => learningEventSchema.parse(event)).toThrow();
  });

  it("keeps existing DAY_SETTLED events valid without payloadVersion", () => {
    expect(
      learningEventSchema.parse({
        ...eventEnvelope("DAY_SETTLED"),
        payload: {
          xpAwarded: 30,
          accuracyBonus: 10,
          firstCorrectRate: 1,
        },
      }),
    ).toBeDefined();
  });
});

describe("checked-in JSON Schema parity", () => {
  it.each(vectors.schemaValid)(
    "$name payload is accepted by JSON Schema and Zod",
    ({ event }) => {
      expect(validatePayload(event)).toEqual({
        jsonSchema: true,
        zod: true,
      });
    },
  );

  it.each(payloadStructuralInvalidVectors)(
    "$name payload is rejected by JSON Schema and Zod",
    ({ event }) => {
      expect(validatePayload(event)).toEqual({
        jsonSchema: false,
        zod: false,
      });
    },
  );

  it("documents every cross-field runtime invariant deterministically", () => {
    expect(challengeCompletedJsonSchema["x-runtime-invariants"]).toEqual([
      "completedAt >= startedAt",
      "child.correctCount <= child.answeredCount",
      "parent.correctCount <= parent.answeredCount",
    ]);
  });
});

describe("answer event golden vectors", () => {
  it.each(vectors.schemaValid)("$name is structurally valid", ({ event }) => {
    expect(learningEventSchema.safeParse(event).success).toBe(true);
  });

  it.each(vectors.schemaInvalid)("$name is structurally invalid", ({ event }) => {
    expect(learningEventSchema.safeParse(event).success).toBe(false);
  });

  it("separates structural validity from future server-authority rejection", () => {
    const mismatch = vectors.schemaValid.find(
      (item) => item.name === "forged-correct-answer",
    );
    expect(mismatch).toBeDefined();
    expect(mismatch?.expectedServerOutcome).toEqual({
      status: "REJECTED",
      code: "ANSWER_MISMATCH",
    });
    expect(learningEventSchema.safeParse(mismatch?.event).success).toBe(true);
  });
});
