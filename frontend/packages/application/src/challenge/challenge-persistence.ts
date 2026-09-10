import {
  difficultyForParticipant,
  questionForTurn,
  settleChallenge,
  submitChallengeAnswer,
  type ChallengeResultDetails,
  type ChallengeSession,
  type Corpus,
} from "@cc/domain";
import { learningEventSchema } from "@cc/content-schema";
import { recordAnswer } from "../answers/record-answer";
import type { EventQueue } from "../event-queue";
import type { Clock } from "../ports";
import { stableChallengeAnswerEventId } from "../session/stable-event-id";
import type { ActiveChallengeSession } from "./active-challenge";
import { recordChallengeCompleted } from "./challenge-events";
import type {
  RecentChallenge,
  RecentChallengeStore,
} from "./recent-challenges";

export interface PersistChallengeAnswerDeps {
  queue: EventQueue;
  clock: Clock;
  deviceId: string;
}

export async function persistChallengeAnswer(
  deps: PersistChallengeAnswerDeps,
  session: ActiveChallengeSession,
  answer: string,
  corpus: Corpus,
  submittedAt = deps.clock.now(),
): Promise<ActiveChallengeSession> {
  const participant =
    session.phase === "CHILD_TURN" ? "CHILD" : "PARENT";
  const turnKey = participant === "CHILD" ? "child" : "parent";
  const turn = session[turnKey];
  const questionIndex = turn.questionIndex;
  const occurredAt = submittedAt;
  const question = questionForTurn(session, corpus);
  const existing = await deps.queue.find(
    stableChallengeAnswerEventId(
      session.challengeId,
      participant,
      questionIndex,
    ),
  );
  let stored =
    existing === undefined ? undefined : learningEventSchema.parse(existing);
  if (stored === undefined) {
    const next = submitChallengeAnswer(
      session,
      answer,
      corpus,
      occurredAt,
    ) as ActiveChallengeSession;
    const attempt = next[turnKey].attempts[turn.attempts.length];
    if (!attempt) throw new Error("challenge answer was not accepted");
    stored = await recordAnswer(
      { queue: deps.queue, clock: { now: () => occurredAt } },
      {
        childProfileId: session.contentSelection.childProfileId,
        deviceId: deps.deviceId,
        sessionId: session.challengeId,
        clientSequence:
          session.child.attempts.length + session.parent.attempts.length,
        contentVersion: session.config.contentVersion,
        ruleVersion: session.config.ruleVersion,
        context: "CHALLENGE",
        participant,
        knowledgePointId: attempt.knowledgePointId,
        questionType: attempt.questionType,
        questionSeed: attempt.questionSeed,
        questionIndex,
        submittedAnswer: attempt.submittedAnswer,
        correctAnswer: attempt.correctAnswer,
        ...(question.acceptedAnswers === undefined
          ? {}
          : { acceptedAnswers: question.acceptedAnswers }),
        firstAttempt: true,
        hintCount: 0,
        responseTimeMs: attempt.responseTimeMs,
        challenge: {
          challengeId: session.challengeId,
          dimension: session.config.dimension,
          participantDifficulty: difficultyForParticipant(
            session.config,
            participant,
          ),
        },
      },
    );
  }

  if (
    stored.eventType !== "CHALLENGE_ANSWER" ||
    stored.sessionId !== session.challengeId ||
    stored.payload.context !== "CHALLENGE" ||
    stored.payload.challenge.challengeId !== session.challengeId ||
    stored.payload.participant !== participant ||
    stored.payload.questionIndex !== questionIndex ||
    stored.payload.questionSeed !== question.seed ||
    stored.payload.knowledgePointId !== question.knowledgePointId ||
    stored.payload.questionType !== question.questionType
  ) {
    throw new Error("challenge answer event identity collision");
  }

  const restored = submitChallengeAnswer(
    session,
    stored.payload.submittedAnswer,
    corpus,
    stored.occurredAt,
  ) as ActiveChallengeSession;
  const restoredTurn = restored[turnKey];
  const restoredAttempt = restoredTurn.attempts[turn.attempts.length];
  if (
    !restoredAttempt ||
    restoredAttempt.correct !== stored.payload.correct ||
    restoredAttempt.correctAnswer !== stored.payload.correctAnswer
  ) {
    throw new Error("challenge answer event facts are inconsistent");
  }

  const restoredFromEvent = {
    ...restored,
    [turnKey]: {
      ...restoredTurn,
      attempts: restoredTurn.attempts.map((item, index) =>
        index === turn.attempts.length
          ? { ...item, responseTimeMs: stored.payload.responseTimeMs }
          : item,
      ),
    },
  };
  return isAnswerTurn(restoredFromEvent) && !restoredFromEvent.paused
    ? {
        ...restoredFromEvent,
        updatedAt: Math.max(restoredFromEvent.updatedAt, deps.clock.now()),
      }
    : restoredFromEvent;
}

function isAnswerTurn(
  session: ChallengeSession,
): session is ChallengeSession & {
  phase: "CHILD_TURN" | "PARENT_TURN";
} {
  return session.phase === "CHILD_TURN" || session.phase === "PARENT_TURN";
}

const RECENT_CHALLENGE_RETENTION_MS = 180 * 24 * 60 * 60 * 1_000;

export interface PersistChallengeCompletionDeps {
  queue: EventQueue;
  clock: Clock;
  deviceId: string;
  recentChallenges: RecentChallengeStore;
}

export async function persistChallengeCompletion(
  deps: PersistChallengeCompletionDeps,
  session: ChallengeSession,
  contentSelection: ActiveChallengeSession["contentSelection"],
): Promise<ChallengeResultDetails> {
  const now = deps.clock.now();
  const completedAt = session.updatedAt;
  const candidate = settleChallenge(session, completedAt);
  const event = await recordChallengeCompleted(
    { queue: deps.queue, clock: { now: () => now } },
    {
      childProfileId: contentSelection.childProfileId,
      deviceId: deps.deviceId,
      clientSequence:
        session.child.attempts.length + session.parent.attempts.length,
      contentVersion: session.config.contentVersion,
      ruleVersion: session.config.ruleVersion,
      challengeId: session.challengeId,
      dimension: session.config.dimension,
      startedAt: session.startedAt,
      completedAt,
      winner: candidate.winner,
      child: candidate.child,
      parent: candidate.parent,
    },
  );
  if (event.eventType !== "CHALLENGE_COMPLETED") {
    throw new Error("challenge completion event identity collision");
  }

  const recent: RecentChallenge = {
    challengeId: event.payload.challengeId,
    dimension: event.payload.dimension,
    startedAt: event.payload.startedAt,
    completedAt: event.payload.completedAt,
    winner: event.payload.winner,
    child: {
      ...event.payload.child,
      attempts: session.child.attempts,
    },
    parent: {
      ...event.payload.parent,
      attempts: session.parent.attempts,
    },
  };
  const retentionCutoff = Math.max(0, now - RECENT_CHALLENGE_RETENTION_MS);
  if (recent.completedAt < retentionCutoff) {
    return {
      ...candidate,
      playedAt: event.payload.completedAt,
    };
  }

  deps.recentChallenges.save(recent);
  deps.recentChallenges.pruneBefore(retentionCutoff);
  if (
    !deps.recentChallenges
      .all()
      .some((challenge) => challenge.challengeId === recent.challengeId)
  ) {
    throw new Error("challenge history was not persisted");
  }

  return {
    ...candidate,
    playedAt: event.payload.completedAt,
  };
}
