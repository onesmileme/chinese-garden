import {
  learningEventSchema,
  type AnswerPayloadV1,
  type LearningEventContract,
} from "@cc/content-schema";
import type { EventQueue } from "../event-queue";
import type { Clock } from "../ports";
import {
  stableAnswerEventId,
  stableChallengeAnswerEventId,
} from "../session/stable-event-id";

type AnswerInputPayload = AnswerPayloadV1 extends infer Payload
  ? Payload extends AnswerPayloadV1
    ? Omit<Payload, "payloadVersion" | "correct">
    : never
  : never;

export type RecordAnswerInput = AnswerInputPayload & {
  readonly acceptedAnswers?: readonly string[];
  childProfileId: string;
  deviceId: string;
  sessionId: string;
  clientSequence: number;
  contentVersion: string;
  ruleVersion: string;
};

function eventTypeFor(
  context: RecordAnswerInput["context"],
): LearningEventContract["eventType"] {
  switch (context) {
    case "ASSESSMENT":
      return "ASSESSMENT_ANSWER";
    case "DAILY_LESSON":
      return "LESSON_ANSWER";
    case "FREE_PRACTICE":
      return "PRACTICE_ANSWER";
    case "CHALLENGE":
      return "CHALLENGE_ANSWER";
  }
}

function toAnswerPayload(input: RecordAnswerInput): AnswerPayloadV1 {
  const answer = {
    payloadVersion: 1 as const,
    context: input.context,
    participant: input.participant,
    knowledgePointId: input.knowledgePointId,
    questionType: input.questionType,
    questionSeed: input.questionSeed,
    questionIndex: input.questionIndex,
    submittedAnswer: input.submittedAnswer,
    correctAnswer: input.correctAnswer,
    correct:
      input.acceptedAnswers === undefined
        ? input.submittedAnswer === input.correctAnswer
        : input.acceptedAnswers.includes(input.submittedAnswer),
    firstAttempt: input.firstAttempt,
    hintCount: input.hintCount,
    responseTimeMs: input.responseTimeMs,
  };

  if (input.context === "CHALLENGE") {
    return { ...answer, context: input.context, challenge: input.challenge };
  }
  return answer as AnswerPayloadV1;
}

export async function recordAnswer(
  deps: { queue: EventQueue; clock: Clock },
  input: RecordAnswerInput,
): Promise<LearningEventContract> {
  const eventId =
    input.context === "CHALLENGE"
      ? stableChallengeAnswerEventId(
          input.challenge.challengeId,
          input.participant,
          input.questionIndex,
        )
      : stableAnswerEventId(input.sessionId, input.clientSequence);
  const event = learningEventSchema.parse({
    eventId,
    childProfileId: input.childProfileId,
    deviceId: input.deviceId,
    sessionId: input.sessionId,
    eventType: eventTypeFor(input.context),
    clientSequence: input.clientSequence,
    contentVersion: input.contentVersion,
    ruleVersion: input.ruleVersion,
    occurredAt: deps.clock.now(),
    payload: toAnswerPayload(input),
  });

  const stored = await deps.queue.enqueueOnce(event);
  return learningEventSchema.parse(stored);
}
