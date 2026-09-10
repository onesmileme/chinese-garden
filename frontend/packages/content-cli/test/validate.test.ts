import { describe, expect, it } from "vitest";
import "../src/model";
import "../src/ports";
import { validateBundle } from "../src/validate";
import type { ContentBundle, PublishOptions } from "../src/model";

const options: PublishOptions = {
  version: "corpus-v4",
  ruleVersion: "mastery-v1",
  contentLevelRuleVersion: "content-level-v1",
  minClientVersion: "1.0.0",
  approvedBy: "reviewer",
  dryRun: true,
};

const activeMetadata = {
  level: 1,
  promotionRequired: true,
  status: "ACTIVE",
  tags: [],
  revision: 1,
} as const;

function bundle(): ContentBundle {
  return {
    characterBank: {
      version: "corpus-v4",
      characters: [
        {
          id: "hz-ma-妈",
          char: "妈",
          pinyin: "mā",
          imageId: "img-ma",
          theme: "family",
          strokes: 6,
          difficulty: 1,
          ...activeMetadata,
        },
      ],
    },
    poemBank: {
      version: "corpus-v4",
      poems: [
        {
          id: "sc-x",
          title: "诗",
          author: "甲",
          lines: ["妈妈爱我们"],
          charRefs: ["hz-ma-妈"],
          difficulty: 1,
          ...activeMetadata,
        },
      ],
    },
    idiomBank: {
      version: "corpus-v4",
      idioms: [
        {
          id: "cy-dagonggaocheng",
          text: "大功告成",
          meaning: "重要的事情顺利完成",
          headPinyin: "da",
          tailPinyin: "cheng",
          difficulty: 1,
          ...activeMetadata,
        },
        {
          id: "cy-chengqianshangwan",
          text: "成千上万",
          meaning: "数量非常多",
          headPinyin: "cheng",
          tailPinyin: "wan",
          difficulty: 1,
          ...activeMetadata,
        },
        {
          id: "cy-wanzhongyixin",
          text: "万众一心",
          meaning: "大家团结一心",
          headPinyin: "wan",
          tailPinyin: "xin",
          difficulty: 1,
          ...activeMetadata,
        },
        {
          id: "cy-xinxiangshicheng",
          text: "心想事成",
          meaning: "心里的愿望顺利实现",
          headPinyin: "xin",
          tailPinyin: "cheng",
          difficulty: 1,
          ...activeMetadata,
        },
      ],
    },
    masteryRules: {
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
    },
    progressionRules: {
      ruleVersion: "progression-v1",
      maxLevel: 30,
      baseXpPerLevel: 100,
      xpStepPerLevel: 20,
      accuracyBonus: { full: 10, high: 5, highThreshold: 0.9 },
      weeklyGoalDays: 5,
    },
    contentLevelRules: {
      ruleVersion: "content-level-v1",
      minimumCumulativeContent: {
        "1": { characters: 1, poems: 1, chainableIdioms: 4 },
        "2": { characters: 1, poems: 1, chainableIdioms: 4 },
        "3": { characters: 1, poems: 1, chainableIdioms: 4 },
        "4": { characters: 1, poems: 1, chainableIdioms: 4 },
        "5": { characters: 1, poems: 1, chainableIdioms: 4 },
      },
    },
    questionsVector: { contentVersion: "corpus-v4", cases: [] },
    testVectors: {},
  };
}

describe("validateBundle", () => {
  it("accepts a schema-valid and semantically valid corpus", () => {
    expect(validateBundle(bundle(), options)).toEqual([]);
  });

  it("reports a missing poem charRef", () => {
    const value = bundle();
    (value.poemBank.poems[0] as { charRefs: string[] }).charRefs = [
      "hz-none",
    ];

    expect(
      validateBundle(value, options).some(
        (issue) => issue.code === "POEM_CHAR_REF_MISSING",
      ),
    ).toBe(true);
  });

  it("accepts a poem that declares no charRefs", () => {
    // 古文乐园诗库可不引用字库：charRefs 缺省时不应触发任何 charRef 校验。
    const value = bundle();
    delete (value.poemBank.poems[0] as { charRefs?: string[] }).charRefs;

    expect(validateBundle(value, options)).toEqual([]);
  });

  it("maps duplicate IDs to the stable management error code", () => {
    const value = bundle();
    (value.poemBank.poems[0] as { id: string }).id = "hz-ma-妈";

    expect(validateBundle(value, options)).toContainEqual(
      expect.objectContaining({
        code: "CONTENT_ID_DUPLICATE",
        path: "hz-ma-妈",
      }),
    );
  });

  it("preserves legacy corpus codes outside the management mapping", () => {
    const value = bundle();
    (value.poemBank.poems[0] as { lines: string[] }).lines = ["妈"];

    expect(validateBundle(value, options)).toContainEqual(
      expect.objectContaining({
        code: "POEM_FILL_NO_CANDIDATE",
        path: "sc-x",
      }),
    );
  });

  it("reports a poem charRef above the poem level", () => {
    const value = bundle();
    (value.characterBank.characters[0] as { level: number }).level = 2;

    expect(validateBundle(value, options)).toContainEqual(
      expect.objectContaining({
        stage: "CORPUS",
        path: "sc-x",
        code: "POEM_CHAR_LEVEL_TOO_HIGH",
      }),
    );
  });

  it("reports an inactive poem charRef once using the existing missing code", () => {
    const value = bundle();
    (value.characterBank.characters[0] as { status: string }).status = "DRAFT";

    const issues = validateBundle(value, options).filter(
      (issue) => issue.path === "sc-x",
    );

    expect(issues).toEqual([
      expect.objectContaining({
        stage: "CORPUS",
        code: "POEM_CHAR_REF_MISSING",
      }),
    ]);
  });

  it("reports an idiom whose successor is above the source level", () => {
    const value = bundle();
    (value.idiomBank.idioms[1] as { level: number }).level = 2;

    expect(validateBundle(value, options)).toContainEqual(
      expect.objectContaining({
        stage: "CORPUS",
        path: "cy-dagonggaocheng",
        code: "IDIOM_CHAIN_BROKEN_AT_LEVEL",
      }),
    );
  });

  it("reports an idiom whose only matching successor is inactive", () => {
    const value = bundle();
    (value.idiomBank.idioms[1] as { status: string }).status = "ARCHIVED";

    expect(validateBundle(value, options)).toContainEqual(
      expect.objectContaining({
        stage: "CORPUS",
        path: "cy-dagonggaocheng",
        code: "IDIOM_CHAIN_BROKEN_AT_LEVEL",
      }),
    );
  });

  it("does not duplicate validateCorpus no-successor issues", () => {
    const value = bundle();
    (value.idiomBank.idioms[0] as { tailPinyin: string }).tailPinyin = "none";

    expect(
      validateBundle(value, options).filter(
        (issue) => issue.path === "cy-dagonggaocheng",
      ),
    ).toEqual([
      expect.objectContaining({
        code: "IDIOM_CHAIN_BROKEN_AT_LEVEL",
      }),
    ]);
  });

  it("reports rule-driven cumulative insufficiency for every level", () => {
    const value = bundle();
    for (const level of ["1", "2", "3", "4", "5"] as const) {
      value.contentLevelRules.minimumCumulativeContent[level].characters = 2;
    }

    const issues = validateBundle(value, options).filter(
      (issue) => issue.code === "LEVEL_CONTENT_INSUFFICIENT",
    );

    expect(issues.map((issue) => issue.path)).toEqual([
      "level/1",
      "level/2",
      "level/3",
      "level/4",
      "level/5",
    ]);
  });

  it("counts only ACTIVE content cumulatively through each level", () => {
    const value = bundle();
    value.characterBank.characters.push(
      {
        ...(value.characterBank.characters[0] as object),
        id: "hz-er-二",
        char: "二",
        level: 2,
      },
      {
        ...(value.characterBank.characters[0] as object),
        id: "hz-san-三",
        char: "三",
        level: 1,
        status: "DRAFT",
      },
    );
    value.contentLevelRules.minimumCumulativeContent["1"].characters = 2;
    value.contentLevelRules.minimumCumulativeContent["2"].characters = 2;

    expect(
      validateBundle(value, options)
        .filter((issue) => issue.code === "LEVEL_CONTENT_INSUFFICIENT")
        .map((issue) => issue.path),
    ).toEqual(["level/1"]);
  });

  it("reports a content version mismatch before packing", () => {
    const value = bundle();
    value.questionsVector.contentVersion = "corpus-v2";

    expect(
      validateBundle(value, options).some(
        (issue) => issue.code === "CONTENT_VERSION_MISMATCH",
      ),
    ).toBe(true);
  });

  it("includes the idiom bank in content version validation", () => {
    const value = bundle();
    value.idiomBank.version = "corpus-v2";

    expect(
      validateBundle(value, options).some(
        (issue) => issue.code === "CONTENT_VERSION_MISMATCH",
      ),
    ).toBe(true);
  });

  it("reports a mastery rule version mismatch", () => {
    const value = bundle();
    value.masteryRules.ruleVersion = "mastery-v2";

    expect(
      validateBundle(value, options).some(
        (issue) => issue.code === "RULE_VERSION_MISMATCH",
      ),
    ).toBe(true);
  });

  it("reports a content-level rule version mismatch", () => {
    expect(
      validateBundle(bundle(), {
        ...options,
        contentLevelRuleVersion: "content-level-v2",
      }),
    ).toContainEqual(
      expect.objectContaining({
        stage: "VERSION",
        path: "rules/content-level-v1.json",
        code: "CONTENT_LEVEL_RULE_VERSION_MISMATCH",
      }),
    );
  });

  it("reports schema errors for invalid poems and rules", () => {
    const value = bundle();
    (value.poemBank.poems[0] as { lines: string[] }).lines = [];
    (
      value.masteryRules as {
        evidenceCaps: { firstLearn: number };
      }
    ).evidenceCaps.firstLearn = 30;
    (value.progressionRules as { maxLevel: number }).maxLevel = 0;

    expect(validateBundle(value, options)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "corpus/poem-bank.json.poems[0]",
          code: "SCHEMA_INVALID",
        }),
        expect.objectContaining({
          path: "rules/mastery.json",
          code: "SCHEMA_INVALID",
        }),
        expect.objectContaining({
          path: "rules/progression.json",
          code: "SCHEMA_INVALID",
        }),
      ]),
    );
  });

  it("reports an empty progression rule version", () => {
    const value = bundle();
    value.progressionRules.ruleVersion = "";

    expect(validateBundle(value, options)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "PROGRESSION_RULE_VERSION_MISSING",
        }),
      ]),
    );
  });

  it("reports schema errors for invalid content-level rules", () => {
    const value = bundle();
    value.contentLevelRules.minimumCumulativeContent["1"].characters = -1;

    expect(validateBundle(value, options)).toContainEqual(
      expect.objectContaining({
        stage: "SCHEMA",
        path: "rules/content-level-v1.json",
        code: "SCHEMA_INVALID",
        message: expect.stringContaining("characters"),
      }),
    );
  });

  it("reports schema errors with the exact character path and Zod message", () => {
    const value = bundle();
    (value.characterBank.characters[0] as { strokes: number }).strokes = 0;

    expect(validateBundle(value, options)).toContainEqual(
      expect.objectContaining({
        stage: "SCHEMA",
        path: "corpus/character-bank.json.characters[0]",
        code: "SCHEMA_INVALID",
        message: expect.stringContaining("strokes"),
      }),
    );
  });

  it("reports schema errors with the exact idiom path", () => {
    const value = bundle();
    (value.idiomBank.idioms[0] as { headPinyin: string }).headPinyin =
      "gōng";

    expect(validateBundle(value, options)).toContainEqual(
      expect.objectContaining({
        stage: "SCHEMA",
        path: "corpus/idiom-bank.json.idioms[0]",
        code: "SCHEMA_INVALID",
        message: expect.stringContaining("headPinyin"),
      }),
    );
  });
});
