import type {
  ContentLevel,
  ContentMetadata,
  Idiom,
  Poem,
} from "@cc/content-schema";
import { asKnowledgePointId } from "@cc/content-schema";
import { describe, expect, it } from "vitest";
import {
  adaptChineseChallenge,
  availableChallengeDimensions,
  difficultyForParticipant,
  difficultyOrderForParticipant,
  dimensionQuestionTypes,
  eligibleKnowledgePoints,
  parentTargetDifficulty,
  type ChineseChallengeConfig,
  type Corpus,
} from "../src";

function withActiveMetadata<T extends { difficulty: ContentLevel }>(
  item: T,
): T & ContentMetadata {
  return {
    ...item,
    level: item.difficulty,
    promotionRequired: true,
    status: "ACTIVE",
    tags: [],
    revision: 1,
  };
}

function poem(id: string, difficulty: ContentLevel): Poem {
  return withActiveMetadata({
    id: asKnowledgePointId(id),
    title: `诗-${id}`,
    author: "作者",
    lines: ["床前明月光", "疑是地上霜"],
    difficulty,
  });
}

function idiom(
  id: string,
  text: string,
  head: string,
  tail: string,
  difficulty: 1 | 2 | 3 | 4 | 5,
): Idiom {
  return withActiveMetadata({
    id: asKnowledgePointId(id),
    text,
    meaning: "释义",
    headPinyin: head,
    tailPinyin: tail,
    difficulty,
  });
}

const corpus: Corpus = {
  poems: [
    poem("sc-a", 1),
    poem("sc-b", 3),
    poem("sc-hard", 4),
    poem("sc-expert", 5),
  ],
  idioms: [
    idiom("cy-yi", "一心一意", "yi", "yi", 1),
    idiom("cy-yiqi", "意气风发", "yi", "fa", 1),
    idiom("cy-cheng", "成千上万", "cheng", "wan", 3),
    idiom("cy-wan", "万众一心", "wan", "xin", 3),
    idiom("cy-hard-a", "月明星稀", "yue", "xi", 4),
    idiom("cy-hard-b", "喜气洋洋", "xi", "yang", 4),
    idiom("cy-expert-a", "虎头虎脑", "hu", "nao", 5),
    idiom("cy-expert-b", "恼羞成怒", "nao", "nu", 5),
  ],
};

function config(
  overrides: Partial<ChineseChallengeConfig>,
): ChineseChallengeConfig {
  return {
    mode: "TIMED",
    tier: "STANDARD",
    dimension: "POEM",
    childDifficulty: 1,
    abilityLevel: 5,
    durationMs: 60_000,
    questionCount: 10,
    contentVersion: "corpus-v5",
    ruleVersion: "challenge-v4",
    ...overrides,
  };
}

describe("challenge difficulty order", () => {
  it("pins parent tiers to L4/L5", () => {
    expect(parentTargetDifficulty(1, "STANDARD")).toBe(4);
    expect(parentTargetDifficulty(5, "STANDARD")).toBe(4);
    expect(parentTargetDifficulty(1, "EXPERT")).toBe(5);
    expect(parentTargetDifficulty(5, "EXPERT")).toBe(5);
  });

  it("orders child fallback below the target before harder levels", () => {
    expect(
      difficultyOrderForParticipant(config({ childDifficulty: 1 }), "CHILD"),
    ).toEqual([1, 2, 3, 4, 5]);
    expect(
      difficultyOrderForParticipant(config({ childDifficulty: 3 }), "CHILD"),
    ).toEqual([3, 2, 1, 4, 5]);
    expect(
      difficultyOrderForParticipant(config({ childDifficulty: 5 }), "CHILD"),
    ).toEqual([5, 4, 3, 2, 1]);
  });

  it("puts the parent tier first, then harder, then falls back down", () => {
    // 家长优先出目标难度,其次向上加难,最后逐级向下兜底,
    // 让低等级语料也能凑齐家长半场。
    expect(
      difficultyOrderForParticipant(config({ tier: "STANDARD" }), "PARENT"),
    ).toEqual([4, 5, 3, 2, 1]);
    expect(
      difficultyOrderForParticipant(config({ tier: "EXPERT" }), "PARENT"),
    ).toEqual([5, 4, 3, 2, 1]);
  });
});

describe("difficultyForParticipant", () => {
  it("uses child difficulty for child and the tier target for parent", () => {
    const cfg = config({ childDifficulty: 2, tier: "STANDARD" });
    expect(difficultyForParticipant(cfg, "CHILD")).toBe(2);
    expect(difficultyForParticipant(cfg, "PARENT")).toBe(4);
    expect(
      difficultyForParticipant(
        config({ childDifficulty: 2, tier: "EXPERT" }),
        "PARENT",
      ),
    ).toBe(5);
  });
});

describe("dimensionQuestionTypes", () => {
  it("locks each dimension to its question types", () => {
    expect(dimensionQuestionTypes("POEM")).toEqual([
      "POEM_FILL",
      "POEM_MATCH_NEXT",
    ]);
    expect(dimensionQuestionTypes("IDIOM")).toEqual([
      "IDIOM_CHAIN",
      "IDIOM_MEANING",
    ]);
  });
});

describe("eligibleKnowledgePoints", () => {
  it("filters poems by difficulty", () => {
    expect(eligibleKnowledgePoints("POEM", 1, corpus)).toEqual(["sc-a"]);
    expect(eligibleKnowledgePoints("POEM", 3, corpus)).toEqual(["sc-b"]);
  });

  it("filters idioms with successors by difficulty", () => {
    // cy-yiqi (tail "fa") has no successor, so only cy-yi qualifies at level 1.
    expect(eligibleKnowledgePoints("IDIOM", 1, corpus)).toEqual(["cy-yi"]);
    expect(eligibleKnowledgePoints("IDIOM", 3, corpus)).toEqual(["cy-cheng"]);
  });
});

describe("adaptChineseChallenge", () => {
  it("returns child and raised parent difficulty for a usable dimension", () => {
    const adapted = adaptChineseChallenge(
      config({ dimension: "POEM", childDifficulty: 1, tier: "STANDARD" }),
      corpus,
    );
    expect(adapted).toMatchObject({
      dimension: "POEM",
      childDifficulty: 1,
      parentDifficulty: 4,
    });
    expect(adapted.childCapacity).toBeGreaterThan(0);
    expect(adapted.parentCapacity).toBeGreaterThan(0);
  });

  it("is idempotent", () => {
    const cfg = config({ dimension: "IDIOM", childDifficulty: 1 });
    expect(adaptChineseChallenge(cfg, corpus)).toEqual(
      adaptChineseChallenge(cfg, corpus),
    );
  });

  it("throws when the corpus has no usable content", () => {
    const empty: Corpus = { poems: [], idioms: [] };
    expect(() =>
      adaptChineseChallenge(
        config({ dimension: "POEM", childDifficulty: 2 }),
        empty,
      ),
    ).toThrow("challenge dimension is not usable");
  });

  it("falls the parent half back to lower levels when L4/L5 has no content", () => {
    // 只有 L1/L3 语料时,家长半场向下兜底而非报错,让低等级也能开挑战。
    const lowLevelsOnly: Corpus = {
      ...corpus,
      poems: corpus.poems.filter((entry) => entry.difficulty <= 3),
    };
    const adapted = adaptChineseChallenge(
      config({ dimension: "POEM", childDifficulty: 3, tier: "STANDARD" }),
      lowLevelsOnly,
    );
    expect(adapted.childCapacity).toBeGreaterThan(0);
    expect(adapted.parentCapacity).toBeGreaterThan(0);
  });

  it("throws when generation fails for an otherwise listed knowledge point", () => {
    // Poem with a single line cannot satisfy POEM_FILL nor POEM_MATCH_NEXT.
    const brokenPoem: Poem = {
      ...poem("sc-broken", 1),
      lines: ["月"],
    };
    const brokenCorpus: Corpus = { ...corpus, poems: [brokenPoem] };
    expect(() =>
      adaptChineseChallenge(
        config({ dimension: "POEM", childDifficulty: 1, tier: "EXPERT" }),
        brokenCorpus,
      ),
    ).toThrow("challenge dimension is not usable");
  });
});

describe("availableChallengeDimensions", () => {
  it("lists dimensions usable at both child and standard parent difficulty", () => {
    expect(availableChallengeDimensions(1, corpus)).toEqual(["POEM", "IDIOM"]);
  });

  it("uses fallback levels and returns an empty list for an empty corpus", () => {
    expect(availableChallengeDimensions(2, corpus)).toEqual(["POEM", "IDIOM"]);
    expect(
      availableChallengeDimensions(2, {
        poems: [],
        idioms: [],
      }),
    ).toEqual([]);
  });

  it("stays usable when only low-difficulty content exists", () => {
    // 模拟低能力等级:语料里没有 L4/L5 的题,家长半场应向下兜底而非落空。
    const lowLevelsOnly: Corpus = {
      poems: corpus.poems.filter((entry) => entry.difficulty <= 3),
      idioms: corpus.idioms.filter((entry) => entry.difficulty <= 3),
    };
    expect(availableChallengeDimensions(1, lowLevelsOnly)).toEqual([
      "POEM",
      "IDIOM",
    ]);
  });
});
