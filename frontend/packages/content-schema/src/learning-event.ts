import { z } from "zod";
import { contentLevelSchema, questionTypeSchema } from "./question";

const ulidSchema = z
  .string()
  .regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, "must be a ULID");

const challengeDimensionSchema = z.enum(["POEM", "IDIOM"]);

const answerBaseShape = {
  payloadVersion: z.literal(1),
  knowledgePointId: z.string().min(1).max(64),
  questionType: questionTypeSchema,
  questionSeed: z.string().min(1).max(128),
  questionIndex: z.number().int().nonnegative(),
  submittedAnswer: z.string().max(512),
  correctAnswer: z.string().max(512),
  correct: z.boolean(),
  firstAttempt: z.boolean(),
  hintCount: z.number().int().nonnegative(),
  responseTimeMs: z.number().int().min(0).max(600_000),
} as const;

const assessmentAnswerPayloadV1Schema = z
  .object({
    ...answerBaseShape,
    context: z.literal("ASSESSMENT"),
    participant: z.literal("CHILD"),
  })
  .strict();

const lessonAnswerPayloadV1Schema = z
  .object({
    ...answerBaseShape,
    context: z.literal("DAILY_LESSON"),
    participant: z.literal("CHILD"),
  })
  .strict();

const practiceAnswerPayloadV1Schema = z
  .object({
    ...answerBaseShape,
    context: z.literal("FREE_PRACTICE"),
    participant: z.literal("CHILD"),
  })
  .strict();

const challengeAnswerPayloadV1Schema = z
  .object({
    ...answerBaseShape,
    context: z.literal("CHALLENGE"),
    participant: z.enum(["CHILD", "PARENT"]),
    challenge: z
      .object({
        challengeId: z.string().min(1).max(64),
        dimension: challengeDimensionSchema,
        participantDifficulty: contentLevelSchema,
      })
      .strict(),
  })
  .strict();

export const answerPayloadV1Schema = z.discriminatedUnion("context", [
  assessmentAnswerPayloadV1Schema,
  lessonAnswerPayloadV1Schema,
  practiceAnswerPayloadV1Schema,
  challengeAnswerPayloadV1Schema,
]);

const challengeSummarySchema = z
  .object({
    answeredCount: z.number().int().nonnegative(),
    correctCount: z.number().int().nonnegative(),
    activeElapsedMs: z.number().int().nonnegative(),
  })
  .strict();

export const challengeCompletedPayloadV1Schema = z
  .object({
    payloadVersion: z.literal(1),
    challengeId: z.string().min(1).max(64),
    dimension: challengeDimensionSchema,
    startedAt: z.number().int().nonnegative(),
    completedAt: z.number().int().nonnegative(),
    winner: z.enum(["CHILD", "PARENT", "DRAW"]),
    child: challengeSummarySchema,
    parent: challengeSummarySchema,
  })
  .strict()
  .superRefine((payload, context) => {
    if (payload.completedAt < payload.startedAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "completedAt must not precede startedAt",
        path: ["completedAt"],
      });
    }
    for (const participant of ["child", "parent"] as const) {
      if (
        payload[participant].correctCount >
        payload[participant].answeredCount
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "correctCount must not exceed answeredCount",
          path: [participant, "correctCount"],
        });
      }
    }
  });

const eventEnvelopeShape = {
  eventId: ulidSchema,
  childProfileId: z.string().min(1).max(64),
  deviceId: z.string().min(1).max(64),
  sessionId: z.string().min(1).max(64),
  clientSequence: z.number().int().nonnegative(),
  contentVersion: z.string().min(1).max(32),
  ruleVersion: z.string().min(1).max(32),
  occurredAt: z.number().int().nonnegative(),
} as const;

const assessmentAnswerEventSchema = z
  .object({
    ...eventEnvelopeShape,
    eventType: z.literal("ASSESSMENT_ANSWER"),
    payload: assessmentAnswerPayloadV1Schema,
  })
  .strict();

const lessonAnswerEventSchema = z
  .object({
    ...eventEnvelopeShape,
    eventType: z.literal("LESSON_ANSWER"),
    payload: lessonAnswerPayloadV1Schema,
  })
  .strict();

const practiceAnswerEventSchema = z
  .object({
    ...eventEnvelopeShape,
    eventType: z.literal("PRACTICE_ANSWER"),
    payload: practiceAnswerPayloadV1Schema,
  })
  .strict();

const challengeAnswerEventSchema = z
  .object({
    ...eventEnvelopeShape,
    eventType: z.literal("CHALLENGE_ANSWER"),
    payload: challengeAnswerPayloadV1Schema,
  })
  .strict();

const challengeCompletedEventSchema = z
  .object({
    ...eventEnvelopeShape,
    eventType: z.literal("CHALLENGE_COMPLETED"),
    payload: challengeCompletedPayloadV1Schema,
  })
  .strict();

const legacyDaySettledEventSchema = z.object({
  ...eventEnvelopeShape,
  eventType: z.literal("DAY_SETTLED"),
  payload: z.object({
    xpAwarded: z.number().int().nonnegative(),
    accuracyBonus: z.number().int().nonnegative(),
    firstCorrectRate: z.number().min(0).max(1),
  }),
});

export const learningEventSchema = z
  .discriminatedUnion("eventType", [
    assessmentAnswerEventSchema,
    lessonAnswerEventSchema,
    practiceAnswerEventSchema,
    challengeAnswerEventSchema,
    challengeCompletedEventSchema,
    legacyDaySettledEventSchema,
  ])
  .superRefine((event, context) => {
    if (
      event.eventType === "CHALLENGE_ANSWER" &&
      event.payload.challenge.challengeId !== event.sessionId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "challenge ID must match session ID",
        path: ["payload", "challenge", "challengeId"],
      });
    }

    if (
      event.eventType === "CHALLENGE_COMPLETED" &&
      event.payload.challengeId !== event.sessionId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "challenge ID must match session ID",
        path: ["payload", "challengeId"],
      });
    }
  });

export type AnswerPayloadV1 = z.infer<typeof answerPayloadV1Schema>;
export type ChallengeCompletedPayloadV1 = z.infer<
  typeof challengeCompletedPayloadV1Schema
>;
export type LearningEventContract = z.infer<typeof learningEventSchema>;
