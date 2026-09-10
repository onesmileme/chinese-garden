import { initAssessment } from "@cc/domain";
import { describe, expect, it } from "vitest";
import {
  CHECKPOINT_SIZE,
  EXTRA_SIZE,
  advanceAssessment,
  type ActiveAssessmentSession,
} from "../src";

function activeAssessment(
  overrides: Partial<ActiveAssessmentSession> = {},
): ActiveAssessmentSession {
  return {
    state: initAssessment(2),
    round: 0,
    questionIndex: 0,
    correctCount: 0,
    startedAt: 1_000,
    contentVersion: "content-v1",
    contentSelection: {
      childProfileId: "child-1",
      authentication: "AUTHENTICATED",
      version: "content-v1",
      abilityLevel: 2,
    },
    updatedAt: 1_000,
    ...overrides,
  };
}

describe("advanceAssessment", () => {
  it("advances ordinary questions 1-4 without applying the checkpoint", () => {
    expect([CHECKPOINT_SIZE, EXTRA_SIZE]).toEqual([5, 2]);
    const answers = [true, false, true, true];
    let snapshot = activeAssessment();
    const initialState = snapshot.state;
    const progress = answers.map((correct, index) => {
      snapshot = advanceAssessment(snapshot, correct, 1_100 + index * 100);
      return {
        questionIndex: snapshot.questionIndex,
        correctCount: snapshot.correctCount,
        updatedAt: snapshot.updatedAt,
      };
    });

    expect(progress).toEqual([
      { questionIndex: 1, correctCount: 1, updatedAt: 1_100 },
      { questionIndex: 2, correctCount: 1, updatedAt: 1_200 },
      { questionIndex: 3, correctCount: 2, updatedAt: 1_300 },
      { questionIndex: 4, correctCount: 3, updatedAt: 1_400 },
    ]);
    expect(snapshot.state).toBe(initialState);
    expect(snapshot.round).toBe(0);
    expect(snapshot.startedAt).toBe(1_000);
    expect(snapshot).not.toHaveProperty("extraCorrectCount");
  });

  it("starts the extra block after a 3/5 checkpoint", () => {
    const snapshot = activeAssessment({
      questionIndex: 4,
      correctCount: 2,
    });

    const next = advanceAssessment(snapshot, true, 2_000);

    expect(next).toEqual({
      ...snapshot,
      questionIndex: 5,
      correctCount: 3,
      extraCorrectCount: 0,
      updatedAt: 2_000,
    });
    expect(next.state).toBe(snapshot.state);
    expect(next.startedAt).toBe(1_000);
  });

  it("tracks the first extra answer without applying the checkpoint", () => {
    const snapshot = activeAssessment({
      questionIndex: 5,
      correctCount: 3,
      extraCorrectCount: 0,
    });

    const next = advanceAssessment(snapshot, true, 2_100);

    expect(next).toEqual({
      ...snapshot,
      questionIndex: 6,
      extraCorrectCount: 1,
      updatedAt: 2_100,
    });
    expect(next.state).toBe(snapshot.state);
  });

  it("defaults a missing extra count when the first extra answer is wrong", () => {
    const snapshot = activeAssessment({
      questionIndex: 5,
      correctCount: 3,
    });

    const next = advanceAssessment(snapshot, false, 2_100);

    expect(next).toEqual({
      ...snapshot,
      questionIndex: 6,
      extraCorrectCount: 0,
      updatedAt: 2_100,
    });
  });

  it("applies the checkpoint after the second extra answer", () => {
    const snapshot = activeAssessment({
      questionIndex: 6,
      correctCount: 3,
      extraCorrectCount: 1,
    });

    const next = advanceAssessment(snapshot, true, 3_000);

    expect(next).toEqual({
      state: {
        currentLevelIndex: 3,
        scoredQuestions: 7,
        elapsedMs: 2_000,
        confirmedPassIndex: 2,
        higherFailed: false,
        finished: false,
        resultLevelIndex: null,
      },
      round: 1,
      questionIndex: 0,
      correctCount: 0,
      startedAt: 1_000,
      contentVersion: "content-v1",
      contentSelection: snapshot.contentSelection,
      updatedAt: 3_000,
    });
    expect(next).not.toHaveProperty("extraCorrectCount");
  });

  it("fails a completed extra block when its optional count is missing", () => {
    const snapshot = activeAssessment({
      questionIndex: 6,
      correctCount: 3,
    });

    const next = advanceAssessment(snapshot, false, 3_000);

    expect(next).toEqual({
      state: {
        currentLevelIndex: 1,
        scoredQuestions: 7,
        elapsedMs: 2_000,
        confirmedPassIndex: null,
        higherFailed: true,
        finished: false,
        resultLevelIndex: null,
      },
      round: 1,
      questionIndex: 0,
      correctCount: 0,
      startedAt: 1_000,
      contentVersion: "content-v1",
      contentSelection: snapshot.contentSelection,
      updatedAt: 3_000,
    });
  });

  it("applies an ordinary checkpoint after question 5", () => {
    const snapshot = activeAssessment({
      questionIndex: 4,
      correctCount: 3,
    });

    const next = advanceAssessment(snapshot, true, 2_500);

    expect(next).toEqual({
      state: {
        currentLevelIndex: 3,
        scoredQuestions: 5,
        elapsedMs: 1_500,
        confirmedPassIndex: 2,
        higherFailed: false,
        finished: false,
        resultLevelIndex: null,
      },
      round: 1,
      questionIndex: 0,
      correctCount: 0,
      startedAt: 1_000,
      contentVersion: "content-v1",
      contentSelection: snapshot.contentSelection,
      updatedAt: 2_500,
    });
  });

  it("is a no-op after assessment has finished", () => {
    const snapshot = activeAssessment({
      state: {
        ...initAssessment(2),
        finished: true,
        resultLevelIndex: 2,
      },
      questionIndex: 4,
      correctCount: 3,
      updatedAt: 2_500,
    });

    const next = advanceAssessment(snapshot, true, 9_000);

    expect(next).toBe(snapshot);
    expect(next.updatedAt).toBe(2_500);
  });
});
