import { describe, it, expect } from "vitest";
import { initAssessment, applyCheckpoint } from "../src/assessment/reducer";

describe("assessment reducer", () => {
  it("starts unfinished at the given level", () => {
    const s = initAssessment(2);
    expect(s).toMatchObject({
      currentLevelIndex: 2,
      finished: false,
      resultLevelIndex: null,
      scoredQuestions: 0,
    });
  });

  it("passes and moves up on 4/5", () => {
    const s = applyCheckpoint(initAssessment(2), {
      firstCorrect: 4,
      elapsedMs: 60000,
    });
    expect(s.currentLevelIndex).toBe(3);
    expect(s.confirmedPassIndex).toBe(2);
    expect(s.scoredQuestions).toBe(5);
    expect(s.finished).toBe(false);
  });

  it("fails and moves down on 2/5", () => {
    const s = applyCheckpoint(initAssessment(2), {
      firstCorrect: 2,
      elapsedMs: 60000,
    });
    expect(s.currentLevelIndex).toBe(1);
    expect(s.higherFailed).toBe(true);
  });

  it("finishes when a pass is confirmed and the next-higher level fails", () => {
    let s = initAssessment(2);
    s = applyCheckpoint(s, { firstCorrect: 5, elapsedMs: 60000 }); // pass L2 -> go L3
    s = applyCheckpoint(s, { firstCorrect: 1, elapsedMs: 120000 }); // fail L3
    expect(s.finished).toBe(true);
    expect(s.resultLevelIndex).toBe(2);
  });

  it("requires extra questions on exactly 3/5 and passes when both extra are correct", () => {
    const s = applyCheckpoint(initAssessment(2), {
      firstCorrect: 3,
      extraFirstCorrect: 2,
      elapsedMs: 60000,
    });
    expect(s.confirmedPassIndex).toBe(2);
    expect(s.currentLevelIndex).toBe(3);
    expect(s.scoredQuestions).toBe(7); // 5 + 2 extra
  });

  it("fails on 3/5 when any extra question is wrong", () => {
    const s = applyCheckpoint(initAssessment(2), {
      firstCorrect: 3,
      extraFirstCorrect: 1,
      elapsedMs: 60000,
    });
    expect(s.higherFailed).toBe(true);
    expect(s.currentLevelIndex).toBe(1);
  });

  it("fails on 3/5 when no extra questions are answered", () => {
    const s = applyCheckpoint(initAssessment(2), {
      firstCorrect: 3,
      elapsedMs: 60000,
    });
    expect(s.higherFailed).toBe(true);
    expect(s.currentLevelIndex).toBe(1);
    expect(s.scoredQuestions).toBe(7);
  });

  it("finishes at 18 scored questions using the highest confirmed pass", () => {
    let s = initAssessment(0);
    s = applyCheckpoint(s, { firstCorrect: 5, elapsedMs: 30000 }); // 5, pass L0 -> L1
    s = applyCheckpoint(s, { firstCorrect: 5, elapsedMs: 60000 }); // 10, pass L1 -> L2
    s = applyCheckpoint(s, {
      firstCorrect: 3,
      extraFirstCorrect: 2,
      elapsedMs: 90000,
    }); // 17, pass L2 -> L3
    s = applyCheckpoint(s, { firstCorrect: 5, elapsedMs: 120000 }); // 22 >= 18 -> finish
    expect(s.finished).toBe(true);
    expect(s.resultLevelIndex).toBe(3);
  });

  it("finishes on the 5-minute limit using the highest confirmed pass", () => {
    let s = initAssessment(0);
    s = applyCheckpoint(s, { firstCorrect: 5, elapsedMs: 299000 }); // pass L0
    s = applyCheckpoint(s, { firstCorrect: 5, elapsedMs: 300000 }); // reaches limit
    expect(s.finished).toBe(true);
    expect(s.resultLevelIndex).toBe(1);
  });

  it("is a no-op once finished", () => {
    let s = initAssessment(2);
    s = applyCheckpoint(s, { firstCorrect: 5, elapsedMs: 60000 });
    s = applyCheckpoint(s, { firstCorrect: 1, elapsedMs: 120000 }); // finished
    const again = applyCheckpoint(s, { firstCorrect: 5, elapsedMs: 130000 });
    expect(again).toEqual(s);
  });

  it("never yields a negative level when failing at the lowest level", () => {
    const s = applyCheckpoint(initAssessment(0), {
      firstCorrect: 0,
      elapsedMs: 60000,
    });
    expect(s.currentLevelIndex).toBe(0);
    expect(s.finished).toBe(true);
    expect(s.resultLevelIndex).toBe(null); // no level confirmed
  });
});
