import { describe, it, expect } from "vitest";
import { settleDay } from "../src/session/settle-day";

const outcomes = (correct: number, total = 18) =>
  Array.from({ length: total }, (_, i) => i < correct);

describe("settleDay accuracy bonus", () => {
  it("gives +10 at 100%", () => {
    expect(
      settleDay({ firstAttemptOutcomes: outcomes(18), baseXp: 60 })
        .accuracyBonus,
    ).toBe(10);
  });
  it("gives +5 at 90-99% (17/18 ≈ 94%)", () => {
    expect(
      settleDay({ firstAttemptOutcomes: outcomes(17), baseXp: 60 })
        .accuracyBonus,
    ).toBe(5);
  });
  it("gives 0 below 90% (16/18 ≈ 89%)", () => {
    expect(
      settleDay({ firstAttemptOutcomes: outcomes(16), baseXp: 60 })
        .accuracyBonus,
    ).toBe(0);
  });
  it("adds bonus to xpAwarded on top of baseXp", () => {
    const r = settleDay({ firstAttemptOutcomes: outcomes(18), baseXp: 60 });
    expect(r.xpAwarded).toBe(70);
    expect(r.firstCorrectRate).toBe(1);
  });
  it("handles empty outcomes as 0 rate and 0 bonus", () => {
    const r = settleDay({ firstAttemptOutcomes: [], baseXp: 0 });
    expect(r.firstCorrectRate).toBe(0);
    expect(r.accuracyBonus).toBe(0);
  });
});
