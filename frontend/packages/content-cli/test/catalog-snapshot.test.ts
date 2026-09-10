import { describe, expect, it } from "vitest";
import { bundleFromSnapshot } from "../src/catalog-snapshot";
import type {
  ReleaseSnapshotResponse,
  RuntimePackBundle,
} from "../src/model";

describe("bundleFromSnapshot", () => {
  it("uses active snapshot payloads instead of bundled seed banks", () => {
    const snapshot: ReleaseSnapshotResponse = {
      version: "corpus-v6",
      masteryRuleVersion: "mastery-v1",
      progressionRuleVersion: "progression-v1",
      contentLevelRuleVersion: "content-level-v1",
      minClientVersion: "1.0.0",
      items: [
        {
          id: "hz-new",
          type: "CHARACTER",
          status: "ACTIVE",
          revision: 2,
          level: 2,
          difficulty: 1,
          promotionRequired: false,
          tags: ["新"],
          payload: {
            char: "新",
            pinyin: "xīn",
            imageId: "img-new",
            theme: "word",
            strokes: 13,
          },
        },
      ],
    };
    const support = supportBundle();

    const result = bundleFromSnapshot(snapshot, support);

    expect(result.characterBank.characters).toEqual([
      expect.objectContaining({ id: "hz-new", char: "新", level: 2 }),
    ]);
    expect(result.characterBank.version).toBe("corpus-v6");
  });

  it.each([
    {
      name: "non-object payload",
      items: [
        snapshotItem({ id: "hz-invalid", payload: null as never }),
      ],
      message: "snapshot payload must be an object",
    },
    {
      name: "non-active item",
      items: [
        snapshotItem({ id: "hz-draft", status: "DRAFT" as never }),
      ],
      message: "snapshot item must be ACTIVE",
    },
    {
      name: "duplicate id",
      items: [
        snapshotItem({ id: "hz-duplicate" }),
        snapshotItem({ id: "hz-duplicate" }),
      ],
      message: "duplicate snapshot item",
    },
  ])("rejects $name", ({ items, message }) => {
    expect(() =>
      bundleFromSnapshot(
        {
          version: "corpus-v6",
          masteryRuleVersion: "mastery-v1",
          progressionRuleVersion: "progression-v1",
          contentLevelRuleVersion: "content-level-v1",
          minClientVersion: "1.0.0",
          items,
        },
        supportBundle(),
      ),
    ).toThrow(message);
  });
});

function snapshotItem(
  overrides: Partial<ReleaseSnapshotResponse["items"][number]> = {},
): ReleaseSnapshotResponse["items"][number] {
  return {
    id: "hz-new",
    type: "CHARACTER",
    status: "ACTIVE",
    revision: 2,
    level: 2,
    difficulty: 1,
    promotionRequired: false,
    tags: ["新"],
    payload: {
      char: "新",
      pinyin: "xīn",
      imageId: "img-new",
      theme: "word",
      strokes: 13,
    },
    ...overrides,
  };
}

function supportBundle(): RuntimePackBundle {
  return {
    characterBank: { version: "seed", characters: [] },
    poemBank: { version: "seed", poems: [] },
    idiomBank: { version: "seed", idioms: [] },
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
    questionsVector: { contentVersion: "seed", cases: [] },
    testVectors: {},
  };
}
