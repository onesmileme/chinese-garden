import { asKnowledgePointId } from "@cc/content-schema";
import {
  CHALLENGE_RULE_VERSION,
  type ChallengeResultDetails,
  type ChallengeSession,
  type ChineseChallengeConfig,
  type DailyPlan,
} from "@cc/domain";
import { beforeEach, describe, expect, it } from "vitest";
import {
  ACTIVE_CHALLENGE_KEY,
  CHALLENGE_SOURCE_KEY,
  LAST_CHALLENGE_RESULT_KEY,
  challengeSourceFromPlan,
  clearActiveChallenge,
  loadActiveChallenge,
  loadChallengeSource,
  loadLastChallengeResult,
  persistCompletedChallenge,
  saveActiveChallenge,
  saveChallengeSource,
  type ActiveChallengeSession,
  type SnapshotStorage,
} from "../src";

function memoryStorage(): SnapshotStorage & { values: Map<string, unknown> } {
  const values = new Map<string, unknown>();
  return {
    values,
    read: <T>(key: string) => (values.get(key) as T | undefined) ?? null,
    write: <T>(key: string, value: T) => void values.set(key, value),
    remove: (key: string) => void values.delete(key),
  };
}

function storageThatDropsWrites(
  droppedKey: string,
): ReturnType<typeof memoryStorage> {
  const storage = memoryStorage();
  const write = storage.write;
  storage.write = <T>(key: string, value: T) => {
    if (key !== droppedKey) write(key, value);
  };
  return storage;
}

const newKpId = asKnowledgePointId("hz-new");

const config: ChineseChallengeConfig = {
  mode: "TIMED",
  tier: "STANDARD",
  dimension: "PINYIN",
  childDifficulty: 1,
  abilityLevel: 5,
  durationMs: 60_000,
  questionCount: 10,
  contentVersion: "corpus-v4",
  ruleVersion: CHALLENGE_RULE_VERSION,
};

const active: ActiveChallengeSession = {
  challengeId: "active-1",
  startedAt: 0,
  phase: "CHILD_TURN",
  handoffTarget: null,
  contentSelection: {
    childProfileId: "child-1",
    authentication: "AUTHENTICATED",
    version: "corpus-v4",
    abilityLevel: 5,
  },
  config,
  child: {
    participant: "CHILD",
    questionIndex: 0,
    answeredCount: 0,
    correctCount: 0,
    activeElapsedMs: 0,
    questionActiveElapsedMs: 0,
    remainingMs: 60_000,
    attempts: [],
  },
  parent: {
    participant: "PARENT",
    questionIndex: 0,
    answeredCount: 0,
    correctCount: 0,
    activeElapsedMs: 0,
    questionActiveElapsedMs: 0,
    remainingMs: 60_000,
    attempts: [],
  },
  paused: false,
  updatedAt: 0,
};

const details: ChallengeResultDetails = {
  winner: "CHILD",
  mode: "TIMED",
  playedAt: 500,
  child: { correctCount: 8, answeredCount: 10, activeElapsedMs: 60_000 },
  parent: { correctCount: 6, answeredCount: 9, activeElapsedMs: 60_000 },
  replay: { mode: "TIMED", tier: "STANDARD" },
};

const plan: DailyPlan = [
  { name: "NEW", slots: [{ role: "NEW", kpId: newKpId }] },
];

const resolveDifficulty = () => 2 as const;

let storage: ReturnType<typeof memoryStorage>;
beforeEach(() => {
  storage = memoryStorage();
});

describe("active challenge persistence", () => {
  it("round-trips and clears a valid active challenge", () => {
    saveActiveChallenge(storage, active);
    expect(
      loadActiveChallenge(storage, "corpus-v4", CHALLENGE_RULE_VERSION),
    ).toEqual(active);
    clearActiveChallenge(storage);
    expect(storage.values.has(ACTIVE_CHALLENGE_KEY)).toBe(false);
  });

  it("removes mismatched and structurally corrupt active challenges", () => {
    saveActiveChallenge(storage, active);
    expect(
      loadActiveChallenge(storage, "corpus-v5", CHALLENGE_RULE_VERSION),
    ).toBeNull();
    saveActiveChallenge(storage, active);
    expect(
      loadActiveChallenge(storage, "corpus-v4", "challenge-v5"),
    ).toBeNull();
    storage.write(ACTIVE_CHALLENGE_KEY, {
      ...active,
      phase: "UNKNOWN",
    } as unknown as ChallengeSession);
    expect(
      loadActiveChallenge(storage, "corpus-v4", CHALLENGE_RULE_VERSION),
    ).toBeNull();
  });

  it("removes a snapshot without per-question active elapsed time", () => {
    const child = { ...active.child } as Record<string, unknown>;
    delete child.questionActiveElapsedMs;
    storage.write(ACTIVE_CHALLENGE_KEY, { ...active, child });

    expect(
      loadActiveChallenge(storage, "corpus-v4", CHALLENGE_RULE_VERSION),
    ).toBeNull();
    expect(storage.values.has(ACTIVE_CHALLENGE_KEY)).toBe(false);
  });

  it("retains a version-pinned active challenge when requested", () => {
    saveActiveChallenge(storage, active);

    expect(
      loadActiveChallenge(
        storage,
        "corpus-v5",
        "challenge-v3",
        true,
      ),
    ).toEqual(active);
  });

  it("removes an old active challenge without removing its compact result", () => {
    storage.write(LAST_CHALLENGE_RESULT_KEY, {
      winner: "CHILD",
      mode: "TIMED",
      playedAt: 500,
    });
    storage.write(ACTIVE_CHALLENGE_KEY, {
      ...active,
      config: { ...active.config, ruleVersion: "challenge-v2" },
    });

    expect(
      loadActiveChallenge(storage, "corpus-v4", CHALLENGE_RULE_VERSION),
    ).toBeNull();
    expect(storage.values.has(ACTIVE_CHALLENGE_KEY)).toBe(false);
    expect(loadLastChallengeResult(storage)).toEqual({
      winner: "CHILD",
      mode: "TIMED",
      playedAt: 500,
    });
  });

  it.each([
    ["missing", undefined],
    ["negative", -1],
    ["fractional", 1.5],
  ])(
    "removes a challenge-v4 snapshot with %s startedAt",
    (_case, startedAt) => {
      const invalid = { ...active } as Record<string, unknown>;
      if (startedAt === undefined) {
        delete invalid.startedAt;
      } else {
        invalid.startedAt = startedAt;
      }
      storage.write(ACTIVE_CHALLENGE_KEY, invalid);

      expect(
        loadActiveChallenge(storage, "corpus-v4", CHALLENGE_RULE_VERSION),
      ).toBeNull();
      expect(storage.values.has(ACTIVE_CHALLENGE_KEY)).toBe(false);
    },
  );

  it.each([
    { ...active, child: null },
    { ...active, contentSelection: null },
    { ...active, child: { ...active.child, answeredCount: -1 } },
    {
      ...active,
      child: { ...active.child, correctCount: 2, answeredCount: 1 },
    },
    { ...active, child: { ...active.child, attempts: null } },
    {
      ...active,
      child: {
        ...active.child,
        answeredCount: 1,
        attempts: [null],
      },
    },
    {
      ...active,
      child: {
        ...active.child,
        attempts: [
          {
            knowledgePointId: "",
            questionType: "IDIOM_CHAIN",
            questionSeed: "seed",
            submittedAnswer: "answer",
            correctAnswer: "correct",
            correct: false,
            responseTimeMs: 100,
          },
        ],
      },
    },
    {
      ...active,
      child: {
        ...active.child,
        attempts: [
          {
            knowledgePointId: "kp-1",
            questionType: "UNKNOWN",
            questionSeed: "seed",
            submittedAnswer: "answer",
            correctAnswer: "correct",
            correct: false,
            responseTimeMs: 100,
          },
        ],
      },
    },
    {
      ...active,
      child: {
        ...active.child,
        attempts: [
          {
            knowledgePointId: "kp-1",
            questionType: "IDIOM_CHAIN",
            questionSeed: "",
            submittedAnswer: "answer",
            correctAnswer: "correct",
            correct: false,
            responseTimeMs: 100,
          },
        ],
      },
    },
    {
      ...active,
      child: {
        ...active.child,
        attempts: [
          {
            knowledgePointId: "kp-1",
            questionType: "IDIOM_CHAIN",
            questionSeed: "seed",
            submittedAnswer: 1,
            correctAnswer: "correct",
            correct: false,
            responseTimeMs: 100,
          },
        ],
      },
    },
    {
      ...active,
      child: {
        ...active.child,
        attempts: [
          {
            knowledgePointId: "kp-1",
            questionType: "IDIOM_CHAIN",
            questionSeed: "seed",
            submittedAnswer: "answer",
            correctAnswer: null,
            correct: false,
            responseTimeMs: 100,
          },
        ],
      },
    },
    {
      ...active,
      child: {
        ...active.child,
        attempts: [
          {
            knowledgePointId: "kp-1",
            questionType: "IDIOM_CHAIN",
            questionSeed: "seed",
            submittedAnswer: "answer",
            correctAnswer: "correct",
            correct: "false",
            responseTimeMs: 100,
          },
        ],
      },
    },
    {
      ...active,
      child: {
        ...active.child,
        attempts: [
          {
            knowledgePointId: "kp-1",
            questionType: "IDIOM_CHAIN",
            questionSeed: "seed",
            submittedAnswer: "answer",
            correctAnswer: "correct",
            correct: false,
            responseTimeMs: -1,
          },
        ],
      },
    },
    { ...active, phase: "HANDOFF", handoffTarget: null },
  ])("removes invalid active data", (invalid) => {
    storage.write(ACTIVE_CHALLENGE_KEY, invalid);
    expect(
      loadActiveChallenge(storage, "corpus-v4", CHALLENGE_RULE_VERSION),
    ).toBeNull();
    expect(storage.values.has(ACTIVE_CHALLENGE_KEY)).toBe(false);
  });

  it("accepts a valid handoff phase with a matching target", () => {
    storage.write(ACTIVE_CHALLENGE_KEY, {
      ...active,
      phase: "HANDOFF",
      handoffTarget: "PARENT_TURN",
    });
    expect(
      loadActiveChallenge(storage, "corpus-v4", CHALLENGE_RULE_VERSION),
    ).toMatchObject({ phase: "HANDOFF", handoffTarget: "PARENT_TURN" });
  });

  it("returns null when no active challenge exists", () => {
    expect(
      loadActiveChallenge(storage, "corpus-v4", CHALLENGE_RULE_VERSION),
    ).toBeNull();
  });

  it("persists only compact result fields before clearing active details", () => {
    saveActiveChallenge(storage, active);
    expect(persistCompletedChallenge(storage, details)).toBe(true);
    expect(storage.values.get(LAST_CHALLENGE_RESULT_KEY)).toEqual({
      winner: "CHILD",
      mode: "TIMED",
      playedAt: 500,
    });
    expect(storage.values.has(ACTIVE_CHALLENGE_KEY)).toBe(false);
    expect(loadLastChallengeResult(storage)).toEqual({
      winner: "CHILD",
      mode: "TIMED",
      playedAt: 500,
    });
  });

  it("keeps active details when result persistence cannot be verified", () => {
    const failing = storageThatDropsWrites(LAST_CHALLENGE_RESULT_KEY);
    saveActiveChallenge(failing, active);
    expect(persistCompletedChallenge(failing, details)).toBe(false);
    expect(failing.values.has(ACTIVE_CHALLENGE_KEY)).toBe(true);
  });

  it("drops malformed compact results", () => {
    storage.write(LAST_CHALLENGE_RESULT_KEY, {
      winner: "DRAW",
      mode: "FIXED_RACE",
      playedAt: 600,
    });
    expect(loadLastChallengeResult(storage)).toEqual({
      winner: "DRAW",
      mode: "FIXED_RACE",
      playedAt: 600,
    });
    storage.write(LAST_CHALLENGE_RESULT_KEY, { winner: "SOMEONE" });
    expect(loadLastChallengeResult(storage)).toBeNull();
    expect(storage.values.has(LAST_CHALLENGE_RESULT_KEY)).toBe(false);
  });

  it("extracts, versions, and retains the NEW-stage source", () => {
    const source = challengeSourceFromPlan(
      plan,
      resolveDifficulty,
      "corpus-v4",
      100,
    );
    expect(source).toEqual({
      childDifficulty: 2,
      contentVersion: "corpus-v4",
      updatedAt: 100,
    });
    saveChallengeSource(storage, source!);
    clearActiveChallenge(storage);
    expect(loadChallengeSource(storage, "corpus-v4")).toEqual(source);
    expect(loadChallengeSource(storage, "corpus-v5")).toBeNull();
    expect(storage.values.has(CHALLENGE_SOURCE_KEY)).toBe(false);
  });

  it("returns no source without a populated NEW stage", () => {
    expect(
      challengeSourceFromPlan([], resolveDifficulty, "corpus-v4", 1),
    ).toBeNull();
    expect(
      challengeSourceFromPlan(
        [{ name: "NEW", slots: [] }],
        resolveDifficulty,
        "corpus-v4",
        1,
      ),
    ).toBeNull();
  });

  it("removes malformed sources and returns null for missing values", () => {
    expect(loadLastChallengeResult(storage)).toBeNull();
    expect(loadChallengeSource(storage, "corpus-v4")).toBeNull();
    storage.write(CHALLENGE_SOURCE_KEY, { childDifficulty: 9 });
    expect(loadChallengeSource(storage, "corpus-v4")).toBeNull();
  });
});
