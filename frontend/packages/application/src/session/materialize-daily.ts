import type { KnowledgePointId } from "@cc/content-schema";
import {
  generateQuestion,
  pickQuestionType,
  type Corpus,
  type GeneratedQuestion,
} from "@cc/domain";
import {
  CHECKPOINT_SIZE,
  EXTRA_SIZE,
} from "../assessment/active-assessment";
import type { DailySession } from "./start-daily";

export interface KnowledgePointDescription {
  kind: "POEM" | "IDIOM";
}

export type DescribeKnowledgePoint = (
  kpId: KnowledgePointId,
) => KnowledgePointDescription;

export interface DailyQuestionStep {
  levelIndex: number;
  slotIndex: number;
  role: string;
  kpId: KnowledgePointId;
  question: GeneratedQuestion;
}

export function materializeDailyQuestions(
  session: DailySession,
  corpus: Corpus,
  describeKp: DescribeKnowledgePoint,
): DailyQuestionStep[] {
  return session.levels.flatMap((level, levelIndex) =>
    level.slots.map((slot, slotIndex) => {
      const seed = `${session.sessionId}:${levelIndex}:${slotIndex}`;
      const { kind } = describeKp(slot.kpId);
      const questionType = pickQuestionType({ role: slot.role, kind, seed });
      const question = generateQuestion(
        questionType,
        slot.kpId,
        corpus,
        seed,
      );
      return {
        levelIndex,
        slotIndex,
        role: slot.role,
        kpId: slot.kpId,
        question,
      };
    }),
  );
}

export function materializeAssessmentQuestions(
  kpId: KnowledgePointId,
  round: number,
  corpus: Corpus,
  describeKp: DescribeKnowledgePoint,
): GeneratedQuestion[] {
  return Array.from(
    { length: CHECKPOINT_SIZE + EXTRA_SIZE },
    (_, index) => {
      const seed = `assess:${kpId}:${round}:${index}`;
      const { kind } = describeKp(kpId);
      const questionType = pickQuestionType({
        role: "ASSESSMENT",
        kind,
        seed,
      });
      return generateQuestion(questionType, kpId, corpus, seed);
    },
  );
}
