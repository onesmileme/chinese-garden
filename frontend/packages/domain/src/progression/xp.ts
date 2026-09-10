const MAX_LEVEL = 30;

export function xpToNextLevel(level: number): number {
  return 100 + 20 * (level - 1);
}

export function accuracyBonus(firstCorrect: number, total: number): number {
  if (total === 0) return 0;
  const accuracy = firstCorrect / total;
  if (accuracy >= 1) return 10;
  if (accuracy >= 0.9) return 5;
  return 0;
}

export interface LevelState {
  level: number;
  lifetimeXp: number;
  xpIntoLevel: number;
}

export function applyXpGain(state: LevelState, gain: number): LevelState {
  let { level, xpIntoLevel } = state;
  const lifetimeXp = state.lifetimeXp + gain;
  if (level >= MAX_LEVEL)
    return { level: MAX_LEVEL, lifetimeXp, xpIntoLevel: 0 };

  let pool = xpIntoLevel + gain;
  while (level < MAX_LEVEL && pool >= xpToNextLevel(level)) {
    pool -= xpToNextLevel(level);
    level += 1;
  }
  xpIntoLevel = level >= MAX_LEVEL ? 0 : pool;
  return { level, lifetimeXp, xpIntoLevel };
}
