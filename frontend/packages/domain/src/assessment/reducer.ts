export type CheckpointOutcome =
  | "PASS"
  | "FAIL"
  | "EXTRA"
  | "EXTRA_PASS"
  | "EXTRA_FAIL";

export interface AssessmentState {
  currentLevelIndex: number;
  scoredQuestions: number;
  elapsedMs: number;
  confirmedPassIndex: number | null;
  higherFailed: boolean;
  finished: boolean;
  resultLevelIndex: number | null;
}

export interface CheckpointResult {
  firstCorrect: number; // 本检查点 5 题首次答对数
  extraFirstCorrect?: number; // 3/5 时追加 2 题的首次答对数
  elapsedMs: number; // 完成该检查点时的累计时长
}

const SCORED_LIMIT = 18;
const TIME_LIMIT_MS = 300000;

export function initAssessment(startLevelIndex: number): AssessmentState {
  return {
    currentLevelIndex: startLevelIndex,
    scoredQuestions: 0,
    elapsedMs: 0,
    confirmedPassIndex: null,
    higherFailed: false,
    finished: false,
    resultLevelIndex: null,
  };
}

// 判定单个检查点是否通过：4/5 或 5/5 直接通过；3/5 需追加 2 题全对；否则未通过。
function checkpointPassed(r: CheckpointResult): {
  passed: boolean;
  scored: number;
} {
  if (r.firstCorrect >= 4) return { passed: true, scored: 5 };
  if (r.firstCorrect === 3) {
    const extra = r.extraFirstCorrect ?? 0;
    return { passed: extra >= 2, scored: 7 };
  }
  return { passed: false, scored: 5 };
}

function finalize(s: AssessmentState): AssessmentState {
  return { ...s, finished: true, resultLevelIndex: s.confirmedPassIndex };
}

export function applyCheckpoint(
  state: AssessmentState,
  r: CheckpointResult,
): AssessmentState {
  if (state.finished) return state;

  const { passed, scored } = checkpointPassed(r);
  const level = state.currentLevelIndex;
  let next: AssessmentState = {
    ...state,
    scoredQuestions: state.scoredQuestions + scored,
    elapsedMs: r.elapsedMs,
  };

  if (passed) {
    next = { ...next, confirmedPassIndex: level, currentLevelIndex: level + 1 };
  } else {
    next = {
      ...next,
      higherFailed: true,
      currentLevelIndex: Math.max(0, level - 1),
    };
  }

  // 结束条件 1：已确认通过某层，且更高相邻层未通过。
  if (next.confirmedPassIndex !== null && next.higherFailed)
    return finalize(next);
  // 结束条件 4：在最低层仍未通过，无法再向下。
  if (!passed && level === 0) return finalize(next);
  // 结束条件 2 / 3：题量或时长达上限。
  if (next.scoredQuestions >= SCORED_LIMIT || next.elapsedMs >= TIME_LIMIT_MS)
    return finalize(next);

  return next;
}
