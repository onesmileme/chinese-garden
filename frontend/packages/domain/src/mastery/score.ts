// 四舍五入到整数（round-half-up），与 spec §7.1 的 round(...) 一致。
function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5);
}

export function scoreFirstLearn(
  guidedCompleted: boolean,
  firstCorrect: number,
  total: number,
): number {
  if (!guidedCompleted) return 0;
  const accuracy = total === 0 ? 0 : firstCorrect / total;
  return 20 + roundHalfUp(20 * accuracy);
}

export function scoreConsolidation(firstAttemptOutcomes: boolean[]): number {
  const window = firstAttemptOutcomes.slice(0, 8);
  if (window.length === 0) return 0;
  const correct = window.filter(Boolean).length;
  return roundHalfUp(25 * (correct / window.length));
}

export function scoreCheckpoint(firstCorrectCount: number): number {
  return firstCorrectCount * 5;
}

export function scoreDelayedReview(
  sessions: { firstCorrect: number; total: number }[],
): number {
  const earned = sessions.reduce(
    (sum, s) => sum + (s.firstCorrect >= 4 ? 5 : 0),
    0,
  );
  return Math.min(earned, 10);
}
