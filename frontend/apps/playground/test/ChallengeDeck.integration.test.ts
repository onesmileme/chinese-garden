import { challengeCorpus } from "@cc/content";
import type { QuestionType } from "@cc/content-schema";
import {
  CHALLENGE_QUESTION_COUNT,
  CHALLENGE_RULE_VERSION,
  adaptChineseChallenge,
  buildChallengeDeck,
  type ChallengeDimension,
  type ChineseChallengeConfig,
  type ParentTier,
} from "@cc/domain";
import { describe, expect, it } from "vitest";

const dimensions: ChallengeDimension[] = ["POEM", "IDIOM"];
const tiers: ParentTier[] = ["STANDARD", "EXPERT"];
const questionTypesByDimension = {
  POEM: ["POEM_FILL", "POEM_MATCH_NEXT"],
  IDIOM: ["IDIOM_CHAIN", "IDIOM_MEANING"],
} as const satisfies Record<ChallengeDimension, readonly QuestionType[]>;
const corpusByDimension = {
  POEM: challengeCorpus.poems,
  IDIOM: challengeCorpus.idioms,
} satisfies Record<
  ChallengeDimension,
  readonly { id: string; difficulty: number }[]
>;

function config(
  dimension: ChallengeDimension,
  tier: ParentTier,
): ChineseChallengeConfig {
  return {
    mode: "FIXED_RACE",
    tier,
    dimension,
    childDifficulty: 1,
    abilityLevel: 5,
    durationMs: 60_000,
    questionCount: CHALLENGE_QUESTION_COUNT,
    contentVersion: "corpus-v5",
    ruleVersion: CHALLENGE_RULE_VERSION,
  };
}

function difficultyFor(
  dimension: ChallengeDimension,
  knowledgePointId: string,
): number {
  const entry = corpusByDimension[dimension].find(
    (candidate) => candidate.id === knowledgePointId,
  );
  if (!entry) {
    throw new Error(`missing ${dimension} knowledge point: ${knowledgePointId}`);
  }
  return entry.difficulty;
}

describe("published challenge corpus", () => {
  it.each(dimensions)("supports ten unique %s questions per turn", (dimension) => {
    for (const tier of tiers) {
      const value = config(dimension, tier);
      const challengeId = `published-corpus:${dimension}:${tier}`;
      const adapted = adaptChineseChallenge(
        value,
        challengeCorpus,
        challengeId,
      );
      expect(adapted.childCapacity).toBeGreaterThanOrEqual(
        CHALLENGE_QUESTION_COUNT,
      );
      expect(adapted.parentCapacity).toBeGreaterThanOrEqual(
        CHALLENGE_QUESTION_COUNT,
      );

      for (const participant of ["CHILD", "PARENT"] as const) {
        const deck = buildChallengeDeck(
          challengeId,
          value,
          participant,
          challengeCorpus,
        );
        const firstTen = deck.slice(0, CHALLENGE_QUESTION_COUNT);
        expect(firstTen).toHaveLength(CHALLENGE_QUESTION_COUNT);
        expect(
          new Set(firstTen.map((entry) => entry.knowledgePointId)).size,
        ).toBe(CHALLENGE_QUESTION_COUNT);
        for (const entry of firstTen) {
          expect(questionTypesByDimension[dimension]).toContain(
            entry.questionType,
          );
          expect(entry.questionSeed).toMatch(
            new RegExp(`^${challengeId}:${participant}:`),
          );
        }
      }
    }
  });

  it.each(dimensions)("orders all %s parent questions by tier", (dimension) => {
    for (const tier of tiers) {
      const deck = buildChallengeDeck(
        `parent-levels:${dimension}:${tier}`,
        config(dimension, tier),
        "PARENT",
        challengeCorpus,
      );
      const levels = deck.map((entry) =>
        difficultyFor(dimension, entry.knowledgePointId),
      );
      const expectedOrder = [...levels].sort((left, right) =>
        tier === "STANDARD" ? left - right : right - left,
      );

      expect(new Set(levels)).toEqual(new Set([4, 5]));
      expect(levels).toEqual(expectedOrder);
    }
  });
});
