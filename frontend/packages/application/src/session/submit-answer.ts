import type { QuestionType } from "@cc/content-schema";
import type { Clock, IdGen } from "../ports";
import type { EventQueue } from "../event-queue";
import type { DailySession } from "./start-daily";
import type { LearningEvent } from "../events";
import { recordAnswer } from "../answers/record-answer";

export interface SubmitInput {
  session: DailySession;
  childProfileId: string;
  deviceId: string;
  knowledgePointId: string;
  questionType: QuestionType;
  questionSeed: string;
  questionIndex: number;
  chosenAnswer: string;
  correctAnswer: string;
  acceptedAnswers: readonly string[] | undefined;
  responseTimeMs: number;
  hintCount: number;
  firstAttempt: boolean;
  clientSequence: number;
}

export async function submitAnswer(
  deps: { queue: EventQueue; idGen: IdGen; clock: Clock },
  input: SubmitInput,
): Promise<LearningEvent> {
  return recordAnswer(
    { queue: deps.queue, clock: deps.clock },
    {
      context: "DAILY_LESSON",
      participant: "CHILD",
      questionSeed: input.questionSeed,
      questionIndex: input.questionIndex,
      submittedAnswer: input.chosenAnswer,
      correctAnswer: input.correctAnswer,
      ...(input.acceptedAnswers === undefined
        ? {}
        : { acceptedAnswers: input.acceptedAnswers }),
      responseTimeMs: input.responseTimeMs,
      firstAttempt: input.firstAttempt,
      hintCount: input.hintCount,
      knowledgePointId: input.knowledgePointId,
      questionType: input.questionType,
      childProfileId: input.childProfileId,
      deviceId: input.deviceId,
      sessionId: input.session.sessionId,
      clientSequence: input.clientSequence,
      contentVersion: input.session.contentVersion,
      ruleVersion: input.session.ruleVersion,
    },
  );
}
