export interface UnlockState {
  prerequisiteScores: number[];
  checkpointFirstCorrect: number;
  independentPracticeGroups: number;
  hasTwoConsecutiveSameCoreErrors: boolean;
}
export interface UnlockResult {
  unlocked: boolean;
  failedReasons: string[];
}

export function evaluateUnlock(s: UnlockState): UnlockResult {
  const failedReasons: string[] = [];
  if (s.prerequisiteScores.some((score) => score < 70))
    failedReasons.push("PREREQUISITE_BELOW_70");
  if (s.checkpointFirstCorrect < 4) failedReasons.push("CHECKPOINT_BELOW_4");
  if (s.independentPracticeGroups < 2)
    failedReasons.push("INSUFFICIENT_PRACTICE_GROUPS");
  if (s.hasTwoConsecutiveSameCoreErrors)
    failedReasons.push("CONSECUTIVE_CORE_ERRORS");
  return { unlocked: failedReasons.length === 0, failedReasons };
}
