import { challengeCorpus } from "@cc/content";
import type { KnowledgePointId, Poem } from "@cc/content-schema";
import { asKnowledgePointId } from "@cc/content-schema";
import { describe, expect, it } from "vitest";
import {
  CHALLENGE_RULE_VERSION,
  ChallengeCapacityError,
  adaptChineseChallenge,
  buildChallengeDeck,
  generateChallengeQuestion,
  type ChallengeDimension,
  type ChineseChallengeConfig,
  type Corpus,
} from "../src";

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
    ruleVersion: CHALLENGE_RULE_VERSION,
    ...overrides,
  };
}

function entryOf(id: KnowledgePointId) {
  return (
    challengeCorpus.poems.find((entry) => entry.id === id) ??
    challengeCorpus.idioms.find((entry) => entry.id === id)
  )!;
}

function levelOf(id: KnowledgePointId): number {
  return entryOf(id).difficulty;
}

function reversedCorpus(): Corpus {
  return {
    poems: [...challengeCorpus.poems].reverse(),
    idioms: [...challengeCorpus.idioms].reverse(),
  };
}

describe("buildChallengeDeck", () => {
  it.each(["POEM", "IDIOM"] as ChallengeDimension[])(
    "does not repeat %s knowledge points for either participant",
    (dimension) => {
      for (const participant of ["CHILD", "PARENT"] as const) {
        const deck = buildChallengeDeck(
          "challenge-a",
          config({ dimension }),
          participant,
          challengeCorpus,
        );
        const ids = deck.map((entry) => entry.knowledgePointId);
        expect(new Set(ids).size).toBe(ids.length);
      }
    },
  );

  it("uses L4 then L5 for standard and L5 then L4 for expert", () => {
    // 诗词维度：L4/L5 各 5 首，家长卡组按 tier 决定难度顺序。
    const standard = buildChallengeDeck(
      "challenge-a",
      config({ tier: "STANDARD", dimension: "POEM" }),
      "PARENT",
      challengeCorpus,
    );
    const expert = buildChallengeDeck(
      "challenge-a",
      config({ tier: "EXPERT", dimension: "POEM" }),
      "PARENT",
      challengeCorpus,
    );

    expect(standard.map((entry) => levelOf(entry.knowledgePointId))).toEqual([
      ...Array(5).fill(4),
      ...Array(5).fill(5),
    ]);
    expect(expert.map((entry) => levelOf(entry.knowledgePointId))).toEqual([
      ...Array(5).fill(5),
      ...Array(5).fill(4),
    ]);
  });

  it.each(["POEM", "IDIOM"] as const)(
    "keeps %s decks and generated questions stable when corpus arrays are reordered",
    (dimension) => {
      const reorderedCorpus = reversedCorpus();
      const originalDeck = buildChallengeDeck(
        "challenge-a",
        config({ dimension }),
        "CHILD",
        challengeCorpus,
      );
      const reorderedDeck = buildChallengeDeck(
        "challenge-a",
        config({ dimension }),
        "CHILD",
        reorderedCorpus,
      );

      expect(originalDeck.length).toBeGreaterThan(0);
      expect(reorderedDeck).toEqual(originalDeck);
      expect(
        originalDeck.map((entry) =>
          generateChallengeQuestion(entry, challengeCorpus),
        ),
      ).toEqual(
        reorderedDeck.map((entry) =>
          generateChallengeQuestion(entry, reorderedCorpus),
        ),
      );
    },
  );

  it("deduplicates a knowledge point repeated across level bands", () => {
    const source = challengeCorpus.idioms.find(
      (entry) => entry.difficulty === 1,
    )!;
    const duplicated: Corpus = {
      ...challengeCorpus,
      idioms: [
        ...challengeCorpus.idioms,
        { ...source, difficulty: 2, level: 2 },
      ],
    };

    const deck = buildChallengeDeck(
      "challenge-a",
      config({ dimension: "IDIOM", childDifficulty: 1 }),
      "CHILD",
      duplicated,
    );

    expect(
      deck.filter((entry) => entry.knowledgePointId === source.id),
    ).toHaveLength(1);
  });

  it("uses participant-specific seeds and mixes a dimension's question types", () => {
    const child = buildChallengeDeck(
      "challenge-a",
      config({ dimension: "IDIOM" }),
      "CHILD",
      challengeCorpus,
    );
    const parent = buildChallengeDeck(
      "challenge-a",
      config({ dimension: "IDIOM" }),
      "PARENT",
      challengeCorpus,
    );

    expect(
      child.every((entry) =>
        entry.questionSeed.startsWith("challenge-a:CHILD:"),
      ),
    ).toBe(true);
    expect(
      parent.every((entry) =>
        entry.questionSeed.startsWith("challenge-a:PARENT:"),
      ),
    ).toBe(true);
    expect(new Set(parent.map((entry) => entry.questionType))).toEqual(
      new Set(["IDIOM_CHAIN", "IDIOM_MEANING"]),
    );
  });

  it("never uses content above the configured ability level", () => {
    // 能力上限按 level 过滤（可与 difficulty 不同）。
    const deck = buildChallengeDeck(
      "challenge-a",
      config({ dimension: "IDIOM", childDifficulty: 1, abilityLevel: 2 }),
      "CHILD",
      challengeCorpus,
    );

    expect(deck.length).toBeGreaterThan(0);
    expect(
      deck.every((entry) => entryOf(entry.knowledgePointId).level <= 2),
    ).toBe(true);
  });

  it("skips an eligible poem when no question type can be generated", () => {
    // 两句可满足“上下句连连看”的入选条件，但唯一字过少无法出填空题，
    // 且语料内没有其它诗句可作干扰项，连连看也无法凑齐四选一。
    // 该知识点应被整体跳过，卡组为空。
    const untappable: Poem = {
      id: asKnowledgePointId("sc-untappable"),
      title: "叠字",
      author: "佚名",
      lines: ["山山山", "水水水"],
      charRefs: [],
      difficulty: 1,
      level: 1,
      promotionRequired: true,
      status: "ACTIVE",
      tags: [],
      revision: 1,
    };

    const deck = buildChallengeDeck(
      "challenge-a",
      config({ dimension: "POEM", childDifficulty: 1 }),
      "CHILD",
      { poems: [untappable], idioms: [] },
    );

    expect(deck).toEqual([]);
  });

  it("reports the participant whose fixed deck is too small", () => {
    // 诗词 L4=5、L5=5；仅保留 2 首 L5，使家长卡组不足 10 题。
    const keptL5 = new Set(
      challengeCorpus.poems
        .filter((entry) => entry.difficulty === 5)
        .slice(0, 2)
        .map((entry) => entry.id),
    );
    const sparse: Corpus = {
      ...challengeCorpus,
      poems: challengeCorpus.poems.filter(
        (entry) => entry.difficulty <= 4 || keptL5.has(entry.id),
      ),
    };

    try {
      adaptChineseChallenge(
        config({ mode: "FIXED_RACE", dimension: "POEM" }),
        sparse,
        "challenge-a",
      );
      throw new Error("expected ChallengeCapacityError");
    } catch (error) {
      expect(error).toBeInstanceOf(ChallengeCapacityError);
      if (!(error instanceof ChallengeCapacityError)) throw error;
      expect(error.participant).toBe("PARENT");
      expect(error.required).toBe(10);
      expect(error.available).toBe(7);
    }
  });
});
