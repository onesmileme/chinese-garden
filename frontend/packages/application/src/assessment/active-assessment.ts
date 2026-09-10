import { applyCheckpoint } from "@cc/domain";
import type { ActiveAssessmentSession } from "../session/active-session";

export const CHECKPOINT_SIZE = 5;
export const EXTRA_SIZE = 2;

export function advanceAssessment(
  snapshot: ActiveAssessmentSession,
  correct: boolean,
  now: number,
): ActiveAssessmentSession {
  if (snapshot.state.finished) return snapshot;
  const questionIndex = snapshot.questionIndex + 1;
  const correctCount = snapshot.correctCount + (correct ? 1 : 0);
  if (questionIndex === CHECKPOINT_SIZE && correctCount === 3) {
    return {
      ...snapshot,
      questionIndex,
      correctCount,
      extraCorrectCount: 0,
      updatedAt: now,
    };
  }
  if (questionIndex === CHECKPOINT_SIZE) {
    const {
      extraCorrectCount: _extraCorrectCount,
      ...snapshotWithoutExtraCount
    } = snapshot;
    return {
      ...snapshotWithoutExtraCount,
      state: applyCheckpoint(snapshot.state, {
        firstCorrect: correctCount,
        elapsedMs: now - snapshot.startedAt,
      }),
      round: snapshot.round + 1,
      questionIndex: 0,
      correctCount: 0,
      updatedAt: now,
    };
  }
  if (
    snapshot.questionIndex >= CHECKPOINT_SIZE &&
    questionIndex === CHECKPOINT_SIZE + EXTRA_SIZE
  ) {
    const extraCorrectCount =
      (snapshot.extraCorrectCount ?? 0) + (correct ? 1 : 0);
    const {
      extraCorrectCount: _extraCorrectCount,
      ...snapshotWithoutExtraCount
    } = snapshot;
    return {
      ...snapshotWithoutExtraCount,
      state: applyCheckpoint(snapshot.state, {
        firstCorrect: snapshot.correctCount,
        extraFirstCorrect: extraCorrectCount,
        elapsedMs: now - snapshot.startedAt,
      }),
      round: snapshot.round + 1,
      questionIndex: 0,
      correctCount: 0,
      updatedAt: now,
    };
  }
  if (
    snapshot.questionIndex >= CHECKPOINT_SIZE &&
    questionIndex < CHECKPOINT_SIZE + EXTRA_SIZE
  ) {
    return {
      ...snapshot,
      questionIndex,
      extraCorrectCount:
        (snapshot.extraCorrectCount ?? 0) + (correct ? 1 : 0),
      updatedAt: now,
    };
  }
  return {
    ...snapshot,
    questionIndex,
    correctCount,
    updatedAt: now,
  };
}
