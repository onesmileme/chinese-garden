import {
  CHALLENGE_RULE_VERSION,
  continueHandoff,
  createChallenge,
  questionForTurn,
  submitChallengeAnswer,
  type ChallengeSession,
} from "@cc/domain";
import { describe, expect, it } from "vitest";
import {
  EventQueue,
  persistChallengeAnswer,
  persistChallengeCompletion,
  SnapshotRecentChallengeStore,
  stableChallengeCompletedEventId,
  type ActiveChallengeSession,
  type EventStore,
  type LearningEvent,
  type RecentChallengeStore,
  type SnapshotStorage,
} from "../src";
import { challengeCorpus } from "../../../content/src";

function activeChallenge(): ActiveChallengeSession {
  return {
    ...createChallenge({
      challengeId: "persisted-answer-facts",
      config: {
        mode: "TIMED",
        tier: "STANDARD",
        dimension: "POEM",
        childDifficulty: 1,
        abilityLevel: 5,
        durationMs: 1_000,
        questionCount: 2,
        contentVersion: "content-v1",
        ruleVersion: CHALLENGE_RULE_VERSION,
      },
      corpus: challengeCorpus,
      nowMs: 1_000,
    }),
    contentSelection: {
      childProfileId: "child-1",
      authentication: "GUEST",
      version: "content-v1",
      abilityLevel: 5,
    },
  } as ActiveChallengeSession;
}

function memoryQueue(): {
  queue: EventQueue;
  events: LearningEvent[];
} {
  const events: LearningEvent[] = [];
  const store: EventStore = {
    append: async (event) => void events.push(event),
    pending: async (limit) => events.slice(0, limit),
    ack: async () => undefined,
    all: async () => [...events],
  };
  return { queue: new EventQueue(store), events };
}

function memoryStorage(): SnapshotStorage {
  const values = new Map<string, unknown>();
  return {
    read: <T,>(key: string) => (values.get(key) as T | undefined) ?? null,
    write: <T,>(key: string, value: T) => void values.set(key, value),
    remove: (key) => void values.delete(key),
  };
}

function completedChallenge(): {
  session: ChallengeSession;
  contentSelection: ActiveChallengeSession["contentSelection"];
} {
  const child = createChallenge({
    challengeId: "completed-challenge",
    config: {
      mode: "FIXED_RACE",
      tier: "STANDARD",
      dimension: "POEM",
      childDifficulty: 1,
      abilityLevel: 5,
      durationMs: 60_000,
      questionCount: 1,
      contentVersion: "content-v1",
      ruleVersion: CHALLENGE_RULE_VERSION,
    },
    corpus: challengeCorpus,
    nowMs: 1_000,
  });
  const childAnswered = submitChallengeAnswer(
    child,
    questionForTurn(child, challengeCorpus).correctAnswer,
    challengeCorpus,
    1_200,
  );
  const parent = continueHandoff(childAnswered, 1_400);
  const parentAnswered = submitChallengeAnswer(
    parent,
    questionForTurn(parent, challengeCorpus).correctAnswer,
    challengeCorpus,
    1_600,
  );
  return {
    session: continueHandoff(parentAnswered, 2_000),
    contentSelection: {
      childProfileId: "child-1",
      authentication: "GUEST",
      version: "content-v1",
      abilityLevel: 5,
    },
  };
}

describe("persistChallengeAnswer", () => {
  it("restores the answer, score, and timing from an existing stable event", async () => {
    const session = activeChallenge();
    const question = questionForTurn(session, challengeCorpus);
    const wrongAnswer = question.options.find(
      (option) => option !== question.correctAnswer,
    )!;
    const stored = memoryQueue();
    let now = 1_500;

    await persistChallengeAnswer(
      { queue: stored.queue, clock: { now: () => now }, deviceId: "device-1" },
      session,
      wrongAnswer,
      challengeCorpus,
    );

    now = 9_000;
    const recovered = await persistChallengeAnswer(
      { queue: stored.queue, clock: { now: () => now }, deviceId: "device-1" },
      session,
      question.correctAnswer,
      challengeCorpus,
    );

    expect(stored.events).toHaveLength(1);
    expect(recovered.child).toMatchObject({
      answeredCount: 1,
      correctCount: 0,
      questionIndex: 0,
      pendingWrongFeedback: { submittedAnswer: wrongAnswer },
      attempts: [
        {
          submittedAnswer: wrongAnswer,
          correct: false,
          responseTimeMs: 500,
        },
      ],
    });
  });

  it("rejects an answer when the timed turn expires before acceptance", async () => {
    const session = activeChallenge();
    const question = questionForTurn(session, challengeCorpus);

    await expect(
      persistChallengeAnswer(
        {
          queue: memoryQueue().queue,
          clock: { now: () => 2_001 },
          deviceId: "device-1",
        },
        session,
        question.correctAnswer,
        challengeCorpus,
      ),
    ).rejects.toThrow("challenge answer was not accepted");
  });

  it("persists accepted-answer questions and preserves earlier attempts", async () => {
    const idiomSession = {
      ...createChallenge({
        challengeId: "persisted-idiom-answers",
        config: {
          ...activeChallenge().config,
          dimension: "IDIOM" as const,
        },
        corpus: challengeCorpus,
        nowMs: 1_000,
      }),
      contentSelection: activeChallenge().contentSelection,
    } as ActiveChallengeSession;
    const idiomQuestion = questionForTurn(idiomSession, challengeCorpus);
    const idiomStored = memoryQueue();

    await persistChallengeAnswer(
      {
        queue: idiomStored.queue,
        clock: { now: () => 1_100 },
        deviceId: "device-1",
      },
      idiomSession,
      idiomQuestion.correctAnswer,
      challengeCorpus,
    );

    expect(idiomQuestion.acceptedAnswers).toBeDefined();
    expect(idiomStored.events[0]).toMatchObject({
      payload: { correct: true },
    });

    const stored = memoryQueue();
    let now = 1_100;
    const firstQuestion = questionForTurn(activeChallenge(), challengeCorpus);
    const afterFirst = await persistChallengeAnswer(
      { queue: stored.queue, clock: { now: () => now }, deviceId: "device-1" },
      activeChallenge(),
      firstQuestion.correctAnswer,
      challengeCorpus,
    );
    now = 1_200;
    const secondQuestion = questionForTurn(afterFirst, challengeCorpus);
    const afterSecond = await persistChallengeAnswer(
      { queue: stored.queue, clock: { now: () => now }, deviceId: "device-1" },
      afterFirst,
      secondQuestion.correctAnswer,
      challengeCorpus,
    );

    expect(afterSecond.child.attempts).toHaveLength(2);
    expect(afterSecond.child.attempts[0]).toEqual(
      afterFirst.child.attempts[0],
    );
  });

  it("rejects a stable event whose challenge identity collides", async () => {
    const session = activeChallenge();
    const question = questionForTurn(session, challengeCorpus);
    const stored = memoryQueue();
    await persistChallengeAnswer(
      {
        queue: stored.queue,
        clock: { now: () => 1_500 },
        deviceId: "device-1",
      },
      session,
      question.correctAnswer,
      challengeCorpus,
    );
    const event = stored.events[0]!;
    if (event.eventType !== "CHALLENGE_ANSWER") {
      throw new Error("expected challenge answer event");
    }
    stored.events[0] = {
      ...event,
      payload: { ...event.payload, questionSeed: "colliding-seed" },
    };

    await expect(
      persistChallengeAnswer(
        {
          queue: stored.queue,
          clock: { now: () => 2_000 },
          deviceId: "device-1",
        },
        session,
        question.correctAnswer,
        challengeCorpus,
      ),
    ).rejects.toThrow("challenge answer event identity collision");
  });

  it("rejects a stable event whose answer facts are inconsistent", async () => {
    const session = activeChallenge();
    const question = questionForTurn(session, challengeCorpus);
    const wrongAnswer = question.options.find(
      (option) => option !== question.correctAnswer,
    )!;
    const stored = memoryQueue();
    await persistChallengeAnswer(
      {
        queue: stored.queue,
        clock: { now: () => 1_500 },
        deviceId: "device-1",
      },
      session,
      wrongAnswer,
      challengeCorpus,
    );
    const event = stored.events[0]!;
    if (event.eventType !== "CHALLENGE_ANSWER") {
      throw new Error("expected challenge answer event");
    }
    stored.events[0] = {
      ...event,
      payload: { ...event.payload, correct: true },
    };

    await expect(
      persistChallengeAnswer(
        {
          queue: stored.queue,
          clock: { now: () => 2_000 },
          deviceId: "device-1",
        },
        session,
        wrongAnswer,
        challengeCorpus,
      ),
    ).rejects.toThrow("challenge answer event facts are inconsistent");
  });
});

describe("persistChallengeCompletion", () => {
  const retentionMs = 180 * 24 * 60 * 60 * 1_000;

  it("completes recovery without restoring history older than retention", async () => {
    const { session, contentSelection } = completedChallenge();
    const stored = memoryQueue();
    const initialHistory = new SnapshotRecentChallengeStore(memoryStorage(), {
      now: () => 2_000,
    });
    await persistChallengeCompletion(
      {
        queue: stored.queue,
        clock: { now: () => 2_000 },
        deviceId: "device-1",
        recentChallenges: initialHistory,
      },
      session,
      contentSelection,
    );
    const recoveredHistory = new SnapshotRecentChallengeStore(
      memoryStorage(),
      { now: () => 2_000 + retentionMs + 1 },
    );

    await expect(
      persistChallengeCompletion(
        {
          queue: stored.queue,
          clock: { now: () => 2_000 + retentionMs + 1 },
          deviceId: "device-1",
          recentChallenges: recoveredHistory,
        },
        session,
        contentSelection,
      ),
    ).resolves.toMatchObject({ playedAt: 2_000, winner: "DRAW" });

    expect(stored.events).toHaveLength(1);
    expect(recoveredHistory.all()).toEqual([]);
  });

  it("still requires retained completion history to be readable after save", async () => {
    const { session, contentSelection } = completedChallenge();
    const stored = memoryQueue();
    const droppedHistory: RecentChallengeStore = {
      save: () => undefined,
      all: () => [],
      forDate: () => [],
      pruneBefore: () => undefined,
    };

    await expect(
      persistChallengeCompletion(
        {
          queue: stored.queue,
          clock: { now: () => 2_000 + retentionMs },
          deviceId: "device-1",
          recentChallenges: droppedHistory,
        },
        session,
        contentSelection,
      ),
    ).rejects.toThrow("challenge history was not persisted");
  });

  it("rejects a stable completion event identity collision", async () => {
    const stored = memoryQueue();
    const answerSession = activeChallenge();
    const answer = questionForTurn(answerSession, challengeCorpus).correctAnswer;
    await persistChallengeAnswer(
      {
        queue: stored.queue,
        clock: { now: () => 1_100 },
        deviceId: "device-1",
      },
      answerSession,
      answer,
      challengeCorpus,
    );
    const { session, contentSelection } = completedChallenge();
    stored.events[0] = {
      ...stored.events[0]!,
      eventId: stableChallengeCompletedEventId(session.challengeId),
    };

    await expect(
      persistChallengeCompletion(
        {
          queue: stored.queue,
          clock: { now: () => 2_000 },
          deviceId: "device-1",
          recentChallenges: new SnapshotRecentChallengeStore(
            memoryStorage(),
            { now: () => 2_000 },
          ),
        },
        session,
        contentSelection,
      ),
    ).rejects.toThrow("challenge completion event identity collision");
  });
});
