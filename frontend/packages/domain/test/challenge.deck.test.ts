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

  it("leads the parent deck with the tier target, harder next, then lower fallback", () => {
    // 家长优先出目标难度(标准 L4 / 高手 L5),其次向上加难,
    // 最后逐级向下兜底;高难度充足时目标难度仍排在最前。
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

    const standardLevels = standard.map((entry) =>
      levelOf(entry.knowledgePointId),
    );
    const expertLevels = expert.map((entry) => levelOf(entry.knowledgePointId));
    // 目标难度全部排在最前,次一档紧随其后。
    expect(standardLevels.slice(0, 10)).toEqual([
      ...Array(5).fill(4),
      ...Array(5).fill(5),
    ]);
    expect(expertLevels.slice(0, 10)).toEqual([
      ...Array(5).fill(5),
      ...Array(5).fill(4),
    ]);
    // 兜底难度按 3 → 2 递减跟随,难度序列整体非严格单调的分段。
    expect(standardLevels.slice(10)).toEqual(expertLevels.slice(10));
    expect(new Set(standardLevels.slice(10))).toEqual(new Set([3, 2]));
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

  it("reports a capacity shortage when even fallback cannot fill the race", () => {
    // 两半场如今遍历全部难度带,容量一致;仅保留 5 首诗(L4×3 + L5×2),
    // 即便向下兜底也不足 10 题,固定赛应抛出容量错误。
    const keptHigh = new Set(
      [
        ...challengeCorpus.poems
          .filter((entry) => entry.difficulty === 4)
          .slice(0, 3),
        ...challengeCorpus.poems
          .filter((entry) => entry.difficulty === 5)
          .slice(0, 2),
      ].map((entry) => entry.id),
    );
    const sparse: Corpus = {
      ...challengeCorpus,
      poems: challengeCorpus.poems.filter((entry) => keptHigh.has(entry.id)),
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
      expect(error.participant).toBe("CHILD");
      expect(error.required).toBe(10);
      expect(error.available).toBe(5);
    }
  });
});
