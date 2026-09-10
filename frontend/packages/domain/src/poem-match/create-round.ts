import type { ContentLevel } from "@cc/content-schema";
import { corpusAtOrBelow } from "../content/levels";
import type { Corpus, GeneratedQuestion } from "../questions/generate";
import { canGeneratePoemMatch, generateQuestion } from "../questions/generate";
import {
  makeSeededRng,
  seededShuffle,
} from "../questions/deterministic-random";

export const POEM_MATCH_ROUND_SIZE = 10;

/**
 * 上下句连连看练习：给上句、四选一下句。
 * 需语料内至少 4 句可作干扰项，否则整轮无法稳定生成。
 */
export function createPoemMatchRound(
  corpus: Corpus,
  seed: string,
  abilityLevel: ContentLevel = 5,
): GeneratedQuestion[] {
  const leveledCorpus = corpusAtOrBelow(corpus, abilityLevel);
  const eligible = leveledCorpus.poems.filter(canGeneratePoemMatch);
  if (eligible.length === 0) {
    throw new Error("no poems for poem-match practice");
  }
  const ordered = seededShuffle(
    eligible,
    makeSeededRng(`poem-match-round:${seed}`),
  );

  return Array.from({ length: POEM_MATCH_ROUND_SIZE }, (_, index) => {
    const poem = ordered[index % ordered.length]!;
    return generateQuestion(
      "POEM_MATCH_NEXT",
      poem.id,
      leveledCorpus,
      `${seed}:${index}`,
    );
  });
}
