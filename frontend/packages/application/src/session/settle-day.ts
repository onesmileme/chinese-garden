export interface DaySettlement {
  xpAwarded: number;
  accuracyBonus: number;
  firstCorrectRate: number;
}

export function settleDay(input: {
  firstAttemptOutcomes: boolean[];
  baseXp: number;
}): DaySettlement {
  const total = input.firstAttemptOutcomes.length;
  const correct = input.firstAttemptOutcomes.filter(Boolean).length;
  const rate = total === 0 ? 0 : correct / total;
  let accuracyBonus = 0;
  if (rate >= 1) accuracyBonus = 10;
  else if (rate >= 0.9) accuracyBonus = 5;
  return {
    xpAwarded: input.baseXp + accuracyBonus,
    accuracyBonus,
    firstCorrectRate: rate,
  };
}
