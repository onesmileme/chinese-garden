import { describe, it, expect } from "vitest";
import { computeMastery, type MasteryEvidence } from "../src/mastery/engine";

const empty: MasteryEvidence = {
  guidedCompleted: false,
  firstLearnFirstCorrect: 0,
  firstLearnTotal: 5,
  consolidationOutcomes: [],
  checkpointFirstCorrect: 0,
  delayedReviewSessions: [],
  delayedReviewFailing: false,
};

describe("computeMastery", () => {
  it("is 0 / LEARNING with no evidence", () => {
    expect(computeMastery(empty)).toEqual({ score: 0, status: "LEARNING" });
  });

  it("sums the four evidence types", () => {
    const e: MasteryEvidence = {
      guidedCompleted: true,
      firstLearnFirstCorrect: 5,
      firstLearnTotal: 5, // 40
      consolidationOutcomes: new Array(8).fill(true), // 25
      checkpointFirstCorrect: 5, // 25
      delayedReviewSessions: [
        { firstCorrect: 5, total: 5 },
        { firstCorrect: 5, total: 5 },
      ], // 10
      delayedReviewFailing: false,
    };
    expect(computeMastery(e)).toEqual({ score: 100, status: "STABLE" });
  });

  it("marks MASTERED when 70+ but no delayed-review evidence yet", () => {
    const e: MasteryEvidence = {
      ...empty,
      guidedCompleted: true,
      firstLearnFirstCorrect: 5,
      firstLearnTotal: 5, // 40
      consolidationOutcomes: new Array(8).fill(true), // 25
      checkpointFirstCorrect: 1, // 5 => 70
    };
    expect(computeMastery(e)).toEqual({ score: 70, status: "MASTERED" });
  });

  it("marks NEEDS_REPAIR when delayed review is failing", () => {
    const e: MasteryEvidence = {
      ...empty,
      guidedCompleted: true,
      firstLearnFirstCorrect: 5,
      firstLearnTotal: 5,
      consolidationOutcomes: new Array(8).fill(true),
      checkpointFirstCorrect: 5,
      delayedReviewFailing: true,
    };
    expect(computeMastery(e).status).toBe("NEEDS_REPAIR");
  });
});
