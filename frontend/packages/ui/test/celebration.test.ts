import { describe, expect, it } from "vitest";
import {
  buildCelebration,
  type CelebrationSettlement,
  type CelebrationVM,
} from "../src/child/celebration";

function settlement(firstCorrectRate: number): CelebrationSettlement {
  return {
    firstCorrectRate,
    xpAwarded: 25,
    accuracyBonus: 5,
  };
}

describe("buildCelebration", () => {
  it.each<[number, CelebrationVM]>([
    [0.9, { stars: 3, cheer: "great", headline: "太棒啦！" }],
    [0.899, { stars: 2, cheer: "good", headline: "做得好！" }],
    [0.6, { stars: 2, cheer: "good", headline: "做得好！" }],
    [0.599, { stars: 1, cheer: "tryagain", headline: "再来一次会更好！" }],
  ])("maps first-correct rate %s at the star thresholds", (rate, expected) => {
    expect(buildCelebration(settlement(rate))).toEqual(expected);
  });
});
