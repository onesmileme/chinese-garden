import { describe, expect, it } from "vitest";
import {
  settleChallenge,
  type ChallengeSession,
  type ChineseChallengeConfig,
} from "../src";

const config: ChineseChallengeConfig = {
  mode: "TIMED",
  tier: "STANDARD",
  dimension: "PINYIN",
  childDifficulty: 1,
  abilityLevel: 5,
  durationMs: 60_000,
  questionCount: 10,
  contentVersion: "corpus-v4",
  ruleVersion: "challenge-v1",
};

function finished(
  mode: "TIMED" | "FIXED_RACE",
  childCorrect: number,
  parentCorrect: number,
  childMs = 60_000,
  parentMs = 60_000,
): ChallengeSession {
  return {
    challengeId: "challenge-1",
    startedAt: 0,
    phase: "RESULT",
    handoffTarget: null,
    config: { ...config, mode },
    child: {
      participant: "CHILD",
      questionIndex: 10,
      answeredCount: 10,
      correctCount: childCorrect,
      activeElapsedMs: childMs,
    },
    parent: {
      participant: "PARENT",
      questionIndex: 10,
      answeredCount: 10,
      correctCount: parentCorrect,
      activeElapsedMs: parentMs,
    },
    paused: true,
    updatedAt: 1,
  };
}

describe("settleChallenge", () => {
  it("uses only correct count in timed mode", () => {
    expect(settleChallenge(finished("TIMED", 8, 6), 100).winner).toBe("CHILD");
    expect(settleChallenge(finished("TIMED", 6, 8), 100).winner).toBe("PARENT");
    expect(
      settleChallenge(finished("TIMED", 7, 7, 40_000, 50_000), 100).winner,
    ).toBe("DRAW");
  });

  it("uses active elapsed time only after a fixed-race accuracy tie", () => {
    expect(
      settleChallenge(finished("FIXED_RACE", 9, 8, 50_000, 40_000), 100)
        .winner,
    ).toBe("CHILD");
    expect(
      settleChallenge(finished("FIXED_RACE", 8, 8, 45_000, 50_000), 100)
        .winner,
    ).toBe("CHILD");
    expect(
      settleChallenge(finished("FIXED_RACE", 8, 8, 50_000, 45_000), 100)
        .winner,
    ).toBe("PARENT");
    expect(
      settleChallenge(finished("FIXED_RACE", 8, 8, 45_000, 45_000), 100)
        .winner,
    ).toBe("DRAW");
  });

  it("carries mode and tier into the replay defaults", () => {
    const details = settleChallenge(finished("TIMED", 8, 6), 100);
    expect(details.replay).toEqual({ mode: "TIMED", tier: "STANDARD" });
    expect(details.playedAt).toBe(100);
    expect(details.child.correctCount).toBe(8);
  });

  it("rejects settlement before RESULT", () => {
    expect(() =>
      settleChallenge({ ...finished("TIMED", 1, 1), phase: "HANDOFF" }, 100),
    ).toThrow("challenge is not ready for settlement");
  });
});
