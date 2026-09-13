import type { ContentLevel } from "@cc/content-schema";
import { corpusAtOrBelow } from "../content/levels";
import type {
  Corpus,
  GeneratedQuestion,
} from "../questions/generate";
import { generateQuestion } from "../questions/generate";
import {
  makeSeededRng,
  seededShuffle,
} from "../questions/deterministic-random";
import { findIdiomSuccessors } from "../questions/idiom-chain";

export const IDIOM_ROUND_SIZE = 10;

export type IdiomPracticeLevel = "BEGINNER" | "ADVANCED";

export function createIdiomPracticeRound(
  corpus: Corpus,
  level: IdiomPracticeLevel,
  seed: string,
  abilityLevel: ContentLevel = 5,
): GeneratedQuestion[] {
  const leveledCorpus = corpusAtOrBelow(corpus, abilityLevel);
  const eligible = leveledCorpus.idioms.filter((idiom) =>
    (level === "BEGINNER"
      ? idiom.difficulty <= 2
      : idiom.difficulty >= 3) &&
    findIdiomSuccessors(idiom, leveledCorpus.idioms).length > 0,
  );
  if (eligible.length === 0) {
    throw new Error(`no idioms for level: ${level}`);
  }
  const ordered = seededShuffle(
    eligible,
    makeSeededRng(`idiom-round:${level}:${seed}`),
  );

  return Array.from({ length: IDIOM_ROUND_SIZE }, (_, index) => {
    const idiom = ordered[index % ordered.length]!;
    return generateQuestion(
      "IDIOM_CHAIN",
      idiom.id,
      leveledCorpus,
      `${seed}:${index}`,
    );
  });
}

/**
 * 成语世界一轮:IDIOM_CHAIN 与 IDIOM_MEANING 各 5 题,按偶数序位接龙、
 * 奇数序位释义固定交替。接龙半场按难度带筛选(初级 ≤2、进阶 ≥3),
 * 释义半场在同一 leveled 语料内取材(需至少 4 条成语提供干扰项)。
 * 任一半场缺料则整轮报错,不做降级混排。
 */
export function createMixedIdiomRound(
  corpus: Corpus,
  level: IdiomPracticeLevel,
  seed: string,
  abilityLevel: ContentLevel = 5,
): GeneratedQuestion[] {
  const leveledCorpus = corpusAtOrBelow(corpus, abilityLevel);
  const chainEligible = leveledCorpus.idioms.filter((idiom) =>
    (level === "BEGINNER"
      ? idiom.difficulty <= 2
      : idiom.difficulty >= 3) &&
    findIdiomSuccessors(idiom, leveledCorpus.idioms).length > 0,
  );
  if (chainEligible.length === 0) {
    throw new Error(`no idioms for level: ${level}`);
  }
  const meaningEligible = leveledCorpus.idioms;
  if (meaningEligible.length < 4) {
    throw new Error("not enough idioms for idiom-meaning practice");
  }
  const chainOrdered = seededShuffle(
    chainEligible,
    makeSeededRng(`idiom-round:${level}:${seed}`),
  );
  const meaningOrdered = seededShuffle(
    meaningEligible,
    makeSeededRng(`idiom-meaning-round:${seed}`),
  );

  return Array.from({ length: IDIOM_ROUND_SIZE }, (_, index) => {
    const half = Math.floor(index / 2);
    if (index % 2 === 0) {
      const idiom = chainOrdered[half % chainOrdered.length]!;
      return generateQuestion(
        "IDIOM_CHAIN",
        idiom.id,
        leveledCorpus,
        `${seed}:${index}`,
      );
    }
    const idiom = meaningOrdered[half % meaningOrdered.length]!;
    return generateQuestion(
      "IDIOM_MEANING",
      idiom.id,
      leveledCorpus,
      `${seed}:${index}`,
    );
  });
}
