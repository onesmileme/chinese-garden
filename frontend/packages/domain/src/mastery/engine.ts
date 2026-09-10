import {
  scoreFirstLearn,
  scoreConsolidation,
  scoreCheckpoint,
  scoreDelayedReview,
} from "./score";
import { classifyStatus, type MasteryStatus } from "./status";

export interface MasteryEvidence {
  guidedCompleted: boolean;
  firstLearnFirstCorrect: number;
  firstLearnTotal: number;
  consolidationOutcomes: boolean[];
  checkpointFirstCorrect: number;
  delayedReviewSessions: { firstCorrect: number; total: number }[];
  delayedReviewFailing: boolean;
}

export interface MasterySnapshot {
  score: number;
  status: MasteryStatus;
}

export function computeMastery(e: MasteryEvidence): MasterySnapshot {
  const raw =
    scoreFirstLearn(
      e.guidedCompleted,
      e.firstLearnFirstCorrect,
      e.firstLearnTotal,
    ) +
    scoreConsolidation(e.consolidationOutcomes) +
    scoreCheckpoint(e.checkpointFirstCorrect) +
    scoreDelayedReview(e.delayedReviewSessions);
  const score = Math.max(0, Math.min(100, raw));
  const status = classifyStatus({
    score,
    hasDelayedReviewEvidence: e.delayedReviewSessions.length > 0,
    delayedReviewFailing: e.delayedReviewFailing,
  });
  return { score, status };
}
