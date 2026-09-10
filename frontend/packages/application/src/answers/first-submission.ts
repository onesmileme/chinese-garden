const MAX_RESPONSE_TIME_MS = 600_000;

export interface FrozenAnswerAttempt {
  readonly questionKey: string;
  readonly chosenAnswer: string;
  readonly correct: boolean;
  readonly submittedAt: number;
  readonly occurredAt: number;
  readonly responseTimeMs: number;
}

export interface FirstSubmissionTracker {
  present(questionKey: string, presentedAt: number): void;
  freeze(
    questionKey: string,
    chosenAnswer: string,
    correct: boolean,
    submittedAt: number,
  ): FrozenAnswerAttempt;
  get(questionKey: string): FrozenAnswerAttempt | undefined;
  clear(): void;
}

interface PresentedQuestion {
  readonly questionKey: string;
  readonly presentedAt: number;
  attempt?: FrozenAnswerAttempt;
}

function clampResponseTime(responseTimeMs: number): number {
  return Math.min(MAX_RESPONSE_TIME_MS, Math.max(0, responseTimeMs));
}

export function createFirstSubmissionTracker(): FirstSubmissionTracker {
  let current: PresentedQuestion | undefined;

  return {
    present(questionKey, presentedAt) {
      if (current?.questionKey === questionKey) return;
      current = { questionKey, presentedAt };
    },
    freeze(questionKey, chosenAnswer, correct, submittedAt) {
      if (current?.questionKey !== questionKey) {
        current = { questionKey, presentedAt: submittedAt };
      }
      if (current.attempt !== undefined) return current.attempt;

      current.attempt = {
        questionKey,
        chosenAnswer,
        correct,
        submittedAt,
        occurredAt: submittedAt,
        responseTimeMs: clampResponseTime(
          submittedAt - current.presentedAt,
        ),
      };
      return current.attempt;
    },
    get(questionKey) {
      return current?.questionKey === questionKey
        ? current.attempt
        : undefined;
    },
    clear() {
      current = undefined;
    },
  };
}
