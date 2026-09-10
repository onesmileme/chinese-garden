import { describe, it, expect } from "vitest";
import {
  contentLevelRulesSchema,
  masteryRulesSchema,
  progressionRulesSchema,
} from "../src/rules";

const mastery = {
  ruleVersion: "mastery-v1",
  evidenceCaps: {
    firstLearn: 40,
    consolidation: 25,
    checkpoint: 25,
    delayedReview: 10,
  },
  guidedPoints: 20,
  statusThresholds: { practicing: 40, mastered: 70, stable: 85 },
  checkpointPassCorrect: 4,
};
const progression = {
  ruleVersion: "progression-v1",
  maxLevel: 30,
  baseXpPerLevel: 100,
  xpStepPerLevel: 20,
  accuracyBonus: { full: 10, high: 5, highThreshold: 0.9 },
  weeklyGoalDays: 5,
};
const contentLevel = {
  ruleVersion: "content-level-v1",
  minimumCumulativeContent: {
    "1": { characters: 10, poems: 1, chainableIdioms: 8 },
    "2": { characters: 20, poems: 3, chainableIdioms: 15 },
    "3": { characters: 40, poems: 6, chainableIdioms: 20 },
    "4": { characters: 60, poems: 10, chainableIdioms: 30 },
    "5": { characters: 80, poems: 15, chainableIdioms: 40 },
  },
};

describe("rules schemas", () => {
  it("accepts canonical mastery rules", () => {
    expect(masteryRulesSchema.parse(mastery).ruleVersion).toBe("mastery-v1");
  });
  it("rejects mastery caps that do not sum to 100", () => {
    expect(() =>
      masteryRulesSchema.parse({
        ...mastery,
        evidenceCaps: { ...mastery.evidenceCaps, delayedReview: 20 },
      }),
    ).toThrow(/sum to 100/);
  });
  it("accepts canonical progression rules", () => {
    expect(progressionRulesSchema.parse(progression).maxLevel).toBe(30);
  });
  it("accepts canonical content-level rules for all five levels", () => {
    expect(contentLevelRulesSchema.parse(contentLevel)).toEqual(contentLevel);
  });
  it("requires cumulative minimums for every content level", () => {
    const { "5": _levelFive, ...incompleteMinimums } =
      contentLevel.minimumCumulativeContent;

    expect(() =>
      contentLevelRulesSchema.parse({
        ...contentLevel,
        minimumCumulativeContent: incompleteMinimums,
      }),
    ).toThrow();
  });
});
