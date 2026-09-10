import type {
  InsightAttempt,
  InsightWindow,
  LearningInsight,
  LearningInsightStatus,
} from "./types";

const STATUS_ORDER: Record<LearningInsightStatus, number> = {
  NEEDS_ATTENTION: 0,
  CONSOLIDATING: 1,
  MASTERED: 2,
  INSUFFICIENT_EVIDENCE: 3,
};

function compareLexically(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function countTrailingWrong(attempts: readonly InsightAttempt[]): number {
  let count = 0;
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    if (attempts[index]!.correct) break;
    count += 1;
  }
  return count;
}

function compareAttempts(
  left: InsightAttempt,
  right: InsightAttempt,
): number {
  if (left.occurredAt !== right.occurredAt) {
    return left.occurredAt - right.occurredAt;
  }
  return compareLexically(left.eventId, right.eventId);
}

export function classifyLearningInsight(
  attempts: readonly InsightAttempt[],
  window: InsightWindow,
): LearningInsight {
  const first = attempts[0];
  if (!first) {
    throw new Error("at least one insight attempt is required");
  }
  if (
    attempts.some(
      (item) =>
        item.knowledgePointId !== first.knowledgePointId ||
        item.questionType !== first.questionType,
    )
  ) {
    throw new Error(
      "all insight attempts must have the same knowledge point and question type",
    );
  }

  const eligible = attempts
    .filter(
      (item) =>
        item.participant === "CHILD" &&
        item.firstAttempt &&
        item.occurredAt >= window.startedAt &&
        item.occurredAt <= window.endedAt,
    )
    .sort(compareAttempts);
  const wrongCount = eligible.filter((item) => !item.correct).length;
  const consecutiveWrongCount = countTrailingWrong(eligible);
  const lastTwoAreCorrect =
    eligible.length >= 2 && eligible.slice(-2).every((item) => item.correct);
  const status =
    eligible.length < 3
      ? "INSUFFICIENT_EVIDENCE"
      : wrongCount * 2 >= eligible.length || consecutiveWrongCount >= 2
        ? "NEEDS_ATTENTION"
        : wrongCount * 5 < eligible.length && lastTwoAreCorrect
          ? "MASTERED"
          : "CONSOLIDATING";

  return {
    knowledgePointId: first.knowledgePointId,
    questionType: first.questionType,
    status,
    window,
    attemptCount: eligible.length,
    correctCount: eligible.length - wrongCount,
    wrongCount,
    consecutiveWrongCount,
    lastAnsweredAt: eligible.at(-1)?.occurredAt ?? null,
    recentMistakes: eligible
      .filter((item) => !item.correct)
      .reverse()
      .slice(0, 3),
  };
}

function compareLearningInsights(
  left: LearningInsight,
  right: LearningInsight,
): number {
  const statusDifference =
    STATUS_ORDER[left.status] - STATUS_ORDER[right.status];
  if (statusDifference !== 0) return statusDifference;

  const rightErrorProduct =
    BigInt(right.wrongCount) * BigInt(left.attemptCount);
  const leftErrorProduct =
    BigInt(left.wrongCount) * BigInt(right.attemptCount);
  if (rightErrorProduct !== leftErrorProduct) {
    return rightErrorProduct > leftErrorProduct ? 1 : -1;
  }

  const consecutiveDifference =
    right.consecutiveWrongCount - left.consecutiveWrongCount;
  if (consecutiveDifference !== 0) return consecutiveDifference;

  const recencyDifference =
    (right.lastAnsweredAt ?? -1) - (left.lastAnsweredAt ?? -1);
  if (recencyDifference !== 0) return recencyDifference;

  const knowledgePointDifference = compareLexically(
    left.knowledgePointId,
    right.knowledgePointId,
  );
  if (knowledgePointDifference !== 0) return knowledgePointDifference;

  return compareLexically(left.questionType, right.questionType);
}

function assertValidInsightCounts(insight: LearningInsight): void {
  if (
    !Number.isSafeInteger(insight.attemptCount) ||
    insight.attemptCount <= 0
  ) {
    throw new RangeError("attemptCount must be a positive safe integer");
  }
  if (
    !Number.isSafeInteger(insight.wrongCount) ||
    insight.wrongCount < 0 ||
    insight.wrongCount > insight.attemptCount
  ) {
    throw new RangeError(
      "wrongCount must be a non-negative safe integer no greater than attemptCount",
    );
  }
}

export function orderLearningInsights(
  insights: readonly LearningInsight[],
): LearningInsight[] {
  const orderable = insights.filter(
    (item) => item.status !== "INSUFFICIENT_EVIDENCE",
  );
  orderable.forEach(assertValidInsightCounts);
  return orderable.sort(compareLearningInsights);
}
