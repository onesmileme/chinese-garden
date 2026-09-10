import { describe, it, expect } from "vitest";
import {
  scoreFirstLearn,
  scoreConsolidation,
  scoreCheckpoint,
  scoreDelayedReview,
} from "../src/mastery/score";

describe("scoreFirstLearn", () => {
  it("gives 0 when guided part is not completed", () => {
    expect(scoreFirstLearn(false, 5, 5)).toBe(0);
  });
  it("gives 20 for guided completion plus round(20 * accuracy)", () => {
    expect(scoreFirstLearn(true, 5, 5)).toBe(40); // 20 + round(20*1)
    expect(scoreFirstLearn(true, 3, 5)).toBe(32); // 20 + round(20*0.6)=20+12
    expect(scoreFirstLearn(true, 0, 5)).toBe(20); // 20 + 0
  });
  it("rounds half up", () => {
    expect(scoreFirstLearn(true, 1, 3)).toBe(27); // 20 + round(20*0.3333)=20+7
  });
  it("guards divide-by-zero when there are no independent questions", () => {
    expect(scoreFirstLearn(true, 0, 0)).toBe(20); // 20 + round(20*0)
  });
});

describe("scoreConsolidation", () => {
  it("uses the first 8 independent outcomes", () => {
    const outcomes = [
      true,
      true,
      true,
      true,
      false,
      false,
      false,
      false,
      true,
      true,
    ];
    expect(scoreConsolidation(outcomes)).toBe(13); // round(25 * 4/8)=round(12.5)=13
  });
  it("returns 0 for empty outcomes", () => {
    expect(scoreConsolidation([])).toBe(0);
  });
  it("caps input at 8 even when more provided", () => {
    expect(scoreConsolidation(new Array(20).fill(true))).toBe(25); // round(25 * 8/8)
  });
});

describe("scoreCheckpoint", () => {
  it("gives 5 points per first-correct answer", () => {
    expect(scoreCheckpoint(5)).toBe(25);
    expect(scoreCheckpoint(4)).toBe(20);
    expect(scoreCheckpoint(0)).toBe(0);
  });
});

describe("scoreDelayedReview", () => {
  it("gives 5 per session that reaches 4/5, else 0, capped at 10", () => {
    expect(
      scoreDelayedReview([
        { firstCorrect: 4, total: 5 },
        { firstCorrect: 5, total: 5 },
      ]),
    ).toBe(10);
    expect(
      scoreDelayedReview([
        { firstCorrect: 4, total: 5 },
        { firstCorrect: 3, total: 5 },
      ]),
    ).toBe(5);
    expect(scoreDelayedReview([{ firstCorrect: 2, total: 5 }])).toBe(0);
  });
});
