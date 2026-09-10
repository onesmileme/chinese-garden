export interface CelebrationSettlement {
  firstCorrectRate: number;
  xpAwarded: number;
  accuracyBonus: number;
}

export interface CelebrationVM {
  stars: 1 | 2 | 3;
  cheer: "great" | "good" | "tryagain";
  headline: string;
}

export function buildCelebration(
  settlement: CelebrationSettlement,
): CelebrationVM {
  if (settlement.firstCorrectRate >= 0.9) {
    return { stars: 3, cheer: "great", headline: "太棒啦！" };
  }
  if (settlement.firstCorrectRate >= 0.6) {
    return { stars: 2, cheer: "good", headline: "做得好！" };
  }
  return { stars: 1, cheer: "tryagain", headline: "再来一次会更好！" };
}
