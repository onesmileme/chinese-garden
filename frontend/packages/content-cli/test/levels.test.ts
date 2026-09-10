import { describe, expect, it } from "vitest";
import { sliceBundleAtLevel } from "../src/levels";
import type { RuntimePackBundle } from "../src/model";

const metadata = {
  difficulty: 1,
  promotionRequired: false,
  status: "ACTIVE",
  tags: [],
  revision: 1,
} as const;

const bundle = {
  characterBank: {
    version: "corpus-v6",
    characters: [
      { id: "c1", level: 1, ...metadata },
      { id: "c3", level: 3, ...metadata },
    ],
  },
  poemBank: {
    version: "corpus-v6",
    poems: [{ id: "p2", level: 2, ...metadata }],
  },
  idiomBank: {
    version: "corpus-v6",
    idioms: [{ id: "i5", level: 5, ...metadata }],
  },
  curriculumMap: { version: "curriculum-v1", themes: [] },
  masteryRules: { ruleVersion: "mastery-v1" },
  progressionRules: { ruleVersion: "progression-v1" },
  contentLevelRules: {
    ruleVersion: "content-level-v1",
    minimumCumulativeContent: {
      "1": { characters: 0, poems: 0, chainableIdioms: 0 },
      "2": { characters: 0, poems: 0, chainableIdioms: 0 },
      "3": { characters: 0, poems: 0, chainableIdioms: 0 },
      "4": { characters: 0, poems: 0, chainableIdioms: 0 },
      "5": { characters: 0, poems: 0, chainableIdioms: 0 },
    },
  },
  questionsVector: { contentVersion: "corpus-v6", cases: [] },
  testVectors: {},
} satisfies RuntimePackBundle;

describe("sliceBundleAtLevel", () => {
  it("creates cumulative level snapshots", () => {
    const l2 = sliceBundleAtLevel(bundle, 2);
    expect(l2.characterBank.characters).toHaveLength(1);
    expect(l2.poemBank.poems).toHaveLength(1);
    expect(l2.idiomBank.idioms).toHaveLength(0);
  });
});
