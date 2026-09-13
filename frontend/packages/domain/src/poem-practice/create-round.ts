import type { ContentLevel } from "@cc/content-schema";
import { corpusAtOrBelow } from "../content/levels";
import type { Corpus, GeneratedQuestion } from "../questions/generate";
import {
  canGeneratePoemFill,
  canGeneratePoemMatch,
  generateQuestion,
} from "../questions/generate";
import {
  makeSeededRng,
  seededShuffle,
} from "../questions/deterministic-random";

export const POEM_ROUND_SIZE = 10;

export function createPoemPracticeRound(
  corpus: Corpus,
  seed: string,
  abilityLevel: ContentLevel = 5,
): GeneratedQuestion[] {
  const leveledCorpus = corpusAtOrBelow(corpus, abilityLevel);
  const eligible = leveledCorpus.poems.filter(canGeneratePoemFill);
  if (eligible.length === 0) {
    throw new Error("no poems for poem practice");
  }
  const ordered = seededShuffle(
    eligible,
    makeSeededRng(`poem-round:${seed}`),
  );

  return Array.from({ length: POEM_ROUND_SIZE }, (_, index) => {
    const poem = ordered[index % ordered.length]!;
    return generateQuestion(
      "POEM_FILL",
      poem.id,
      leveledCorpus,
      `${seed}:${index}`,
    );
  });
}

/**
 * 诗词世界一轮:POEM_FILL 与 POEM_MATCH_NEXT 各 5 题,按偶数序位填空、
 * 奇数序位连连看固定交替。两条题型各自在 leveled 语料内确定性洗牌,
 * 缺任一题型语料则整轮报错,不做降级混排。
 */
export function createMixedPoemRound(
  corpus: Corpus,
  seed: string,
  abilityLevel: ContentLevel = 5,
): GeneratedQuestion[] {
  const leveledCorpus = corpusAtOrBelow(corpus, abilityLevel);
  const fillEligible = leveledCorpus.poems.filter(canGeneratePoemFill);
  if (fillEligible.length === 0) {
    throw new Error("no poems for poem practice");
  }
  const matchEligible = leveledCorpus.poems.filter(canGeneratePoemMatch);
  if (matchEligible.length === 0) {
    throw new Error("no poems for poem-match practice");
  }
  const fillOrdered = seededShuffle(
    fillEligible,
    makeSeededRng(`poem-round:${seed}`),
  );
  const matchOrdered = seededShuffle(
    matchEligible,
    makeSeededRng(`poem-match-round:${seed}`),
  );

  return Array.from({ length: POEM_ROUND_SIZE }, (_, index) => {
    const half = Math.floor(index / 2);
    if (index % 2 === 0) {
      const poem = fillOrdered[half % fillOrdered.length]!;
      return generateQuestion(
        "POEM_FILL",
        poem.id,
        leveledCorpus,
        `${seed}:${index}`,
      );
    }
    const poem = matchOrdered[half % matchOrdered.length]!;
    return generateQuestion(
      "POEM_MATCH_NEXT",
      poem.id,
      leveledCorpus,
      `${seed}:${index}`,
    );
  });
}
