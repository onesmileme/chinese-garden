import {
  isCorrectAnswer,
  type Corpus,
  type GeneratedQuestion,
} from "../questions/generate";
import {
  adaptChineseChallenge,
  buildChallengeDeck,
  generateChallengeQuestion,
} from "./deck";
import type {
  ChallengeAttempt,
  ChineseChallengeConfig,
  ChallengeSession,
  TurnProgress,
} from "./types";

export interface CreateChallengeInput {
  challengeId: string;
  config: ChineseChallengeConfig;
  corpus: Corpus;
  nowMs: number;
}

type TurnKey = "child" | "parent";
const MAX_RESPONSE_TIME_MS = 600_000;

function turnKey(session: ChallengeSession): TurnKey {
  if (session.phase === "CHILD_TURN") return "child";
  if (session.phase === "PARENT_TURN") return "parent";
  throw new Error("challenge is not in an answer turn");
}

function initialTurn(
  participant: TurnProgress["participant"],
  config: ChineseChallengeConfig,
): TurnProgress {
  return {
    participant,
    questionIndex: 0,
    answeredCount: 0,
    correctCount: 0,
    activeElapsedMs: 0,
    questionActiveElapsedMs: 0,
    attempts: [],
    ...(config.mode === "TIMED" ? { remainingMs: config.durationMs } : {}),
  };
}

function accrue(session: ChallengeSession, nowMs: number): ChallengeSession {
  const key = turnKey(session);
  const elapsed = Math.max(0, nowMs - session.updatedAt);
  const turn = session[key];
  const activeElapsedMs = turn.activeElapsedMs + elapsed;
  return {
    ...session,
    [key]: {
      ...turn,
      activeElapsedMs,
      questionActiveElapsedMs:
        turn.questionActiveElapsedMs +
        (turn.pendingWrongFeedback ? 0 : elapsed),
      ...(session.config.mode === "TIMED"
        ? {
            remainingMs: Math.max(
              0,
              session.config.durationMs - activeElapsedMs,
            ),
          }
        : {}),
    },
    updatedAt: nowMs,
  };
}

function timedOut(session: ChallengeSession): boolean {
  return (
    session.config.mode === "TIMED" &&
    session[turnKey(session)].activeElapsedMs >= session.config.durationMs
  );
}

function finishTurn(session: ChallengeSession): ChallengeSession {
  const handoffTarget =
    session.phase === "CHILD_TURN" ? "PARENT_TURN" : "RESULT";
  return {
    ...session,
    phase: "HANDOFF",
    handoffTarget,
    paused: true,
  };
}

function shouldFinishTurn(
  session: ChallengeSession,
  corpus: Corpus,
): boolean {
  return (
    session[turnKey(session)].questionIndex >=
    challengeTurnQuestionCount(session, corpus)
  );
}

export function createChallenge({
  challengeId,
  config,
  corpus,
  nowMs,
}: CreateChallengeInput): ChallengeSession {
  adaptChineseChallenge(config, corpus, challengeId);
  return {
    challengeId,
    startedAt: nowMs,
    phase: "CHILD_TURN",
    handoffTarget: null,
    config,
    child: initialTurn("CHILD", config),
    parent: initialTurn("PARENT", config),
    paused: false,
    updatedAt: nowMs,
  };
}

function deckForTurn(session: ChallengeSession, corpus: Corpus) {
  const turn = session[turnKey(session)];
  return buildChallengeDeck(
    session.challengeId,
    session.config,
    turn.participant,
    corpus,
  );
}

export function challengeTurnQuestionCount(
  session: ChallengeSession,
  corpus: Corpus,
): number {
  return session.config.mode === "FIXED_RACE"
    ? session.config.questionCount
    : deckForTurn(session, corpus).length;
}

export function questionForTurn(
  session: ChallengeSession,
  corpus: Corpus,
): GeneratedQuestion {
  if (session.paused) throw new Error("challenge is paused");
  const turn = session[turnKey(session)];
  const entry = deckForTurn(session, corpus)[turn.questionIndex];
  if (!entry) throw new Error("challenge deck exhausted");
  return generateChallengeQuestion(
    entry,
    corpus,
    session.config.abilityLevel,
  );
}

export function submitChallengeAnswer(
  session: ChallengeSession,
  userAnswer: string,
  corpus: Corpus,
  nowMs: number,
): ChallengeSession {
  if (session.paused) throw new Error("challenge is paused");
  const key = turnKey(session);
  if (session[key].pendingWrongFeedback) {
    throw new Error("wrong feedback is pending");
  }
  const accrued = accrue(session, nowMs);
  if (timedOut(accrued)) return finishTurn(accrued);

  const question = questionForTurn(accrued, corpus);
  const correct = isCorrectAnswer(question, userAnswer);
  const turn = accrued[key];
  const attempt: ChallengeAttempt = {
    knowledgePointId: question.knowledgePointId,
    questionType: question.questionType,
    questionSeed: question.seed,
    submittedAnswer: userAnswer,
    correctAnswer: question.correctAnswer,
    correct,
    responseTimeMs: Math.min(
      MAX_RESPONSE_TIME_MS,
      turn.questionActiveElapsedMs,
    ),
  };
  const nextTurn: TurnProgress = correct
    ? {
        ...turn,
        answeredCount: turn.answeredCount + 1,
        correctCount: turn.correctCount + 1,
        questionIndex: turn.questionIndex + 1,
        questionActiveElapsedMs: 0,
        attempts: [...turn.attempts, attempt],
      }
    : {
        ...turn,
        answeredCount: turn.answeredCount + 1,
        questionActiveElapsedMs: 0,
        attempts: [...turn.attempts, attempt],
        pendingWrongFeedback: {
          submittedAnswer: userAnswer,
          correctAnswer: question.correctAnswer,
        },
      };
  const next = { ...accrued, [key]: nextTurn };
  return correct && (shouldFinishTurn(next, corpus) || timedOut(next))
    ? finishTurn(next)
    : next;
}

export function confirmWrongFeedback(
  session: ChallengeSession,
  corpus: Corpus,
  nowMs: number,
): ChallengeSession {
  if (session.paused) throw new Error("challenge is paused");
  const key = turnKey(session);
  if (!session[key].pendingWrongFeedback) {
    throw new Error("wrong feedback is not pending");
  }
  const accrued = accrue(session, nowMs);
  const { pendingWrongFeedback: _pending, ...turn } = accrued[key];
  const next = {
    ...accrued,
    [key]: { ...turn, questionIndex: turn.questionIndex + 1 },
  };
  return shouldFinishTurn(next, corpus) || timedOut(next)
    ? finishTurn(next)
    : next;
}

export function continueHandoff(
  session: ChallengeSession,
  nowMs: number,
): ChallengeSession {
  if (session.phase !== "HANDOFF") {
    throw new Error("challenge is not in handoff");
  }
  if (!session.handoffTarget) throw new Error("handoff target is missing");
  if (session.handoffTarget === "RESULT") {
    return {
      ...session,
      phase: "RESULT",
      handoffTarget: null,
      paused: true,
      updatedAt: nowMs,
    };
  }
  return {
    ...session,
    phase: "PARENT_TURN",
    handoffTarget: null,
    paused: false,
    updatedAt: nowMs,
  };
}

export function pauseChallenge(
  session: ChallengeSession,
  nowMs: number,
): ChallengeSession {
  if (session.paused) throw new Error("challenge is already paused");
  return { ...accrue(session, nowMs), paused: true };
}

export function resumeChallenge(
  session: ChallengeSession,
  nowMs: number,
): ChallengeSession {
  if (!session.paused) throw new Error("challenge is not paused");
  turnKey(session);
  return { ...session, paused: false, updatedAt: nowMs };
}

export function remainingTurnMs(
  session: ChallengeSession,
  nowMs: number,
): number {
  if (session.config.mode !== "TIMED") return 0;
  const turn = session[turnKey(session)];
  const activeDelta = session.paused
    ? 0
    : Math.max(0, nowMs - session.updatedAt);
  return Math.max(
    0,
    session.config.durationMs - turn.activeElapsedMs - activeDelta,
  );
}

export function finishExpiredTurn(
  session: ChallengeSession,
  nowMs: number,
): ChallengeSession {
  if (session.config.mode !== "TIMED" || session.paused) return session;
  const key = turnKey(session);
  if (session[key].pendingWrongFeedback) return session;
  if (remainingTurnMs(session, nowMs) > 0) return session;
  return finishTurn(accrue(session, nowMs));
}
