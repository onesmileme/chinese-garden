import type { QuestionType } from "@cc/content-schema";

export type InsightParticipant = "CHILD" | "PARENT";

export interface InsightAttempt {
  eventId: string;
  knowledgePointId: string;
  questionType: QuestionType;
  participant: InsightParticipant;
  firstAttempt: boolean;
  correct: boolean;
  occurredAt: number;
  submittedAnswer: string;
  correctAnswer: string;
  responseTimeMs: number;
  contentVersion: string;
}

export interface InsightWindow {
  startedAt: number;
  endedAt: number;
}

export type LearningInsightStatus =
  | "NEEDS_ATTENTION"
  | "CONSOLIDATING"
  | "MASTERED"
  | "INSUFFICIENT_EVIDENCE";

export interface LearningInsight {
  knowledgePointId: string;
  questionType: QuestionType;
  status: LearningInsightStatus;
  window: InsightWindow;
  attemptCount: number;
  correctCount: number;
  wrongCount: number;
  consecutiveWrongCount: number;
  lastAnsweredAt: number | null;
  recentMistakes: InsightAttempt[];
}
