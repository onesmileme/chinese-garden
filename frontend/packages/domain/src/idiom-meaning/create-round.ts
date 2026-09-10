import type { ContentLevel } from "@cc/content-schema";
import { corpusAtOrBelow } from "../content/levels";
import type { Corpus, GeneratedQuestion } from "../questions/generate";
import { generateQuestion } from "../questions/generate";
import {
  makeSeededRng,
  seededShuffle,
} from "../questions/deterministic-random";

export const IDIOM_MEANING_ROUND_SIZE = 10;

/**
 * 成语释义辨析练习：给成语、四选一释义。
 * 需语料内至少 4 条成语可提供释义干扰项。
 */
export function createIdiomMeaningRound(
  corpus: Corpus,
  seed: string,
  abilityLevel: ContentLevel = 5,
): GeneratedQuestion[] {
  const leveledCorpus = corpusAtOrBelow(corpus, abilityLevel);
  const eligible = leveledCorpus.idioms;
  if (eligible.length < 4) {
    throw new Error("not enough idioms for idiom-meaning practice");
  }
  const ordered = seededShuffle(
    eligible,
    makeSeededRng(`idiom-meaning-round:${seed}`),
  );

  return Array.from({ length: IDIOM_MEANING_ROUND_SIZE }, (_, index) => {
    const idiom = ordered[index % ordered.length]!;
    return generateQuestion(
      "IDIOM_MEANING",
      idiom.id,
      leveledCorpus,
      `${seed}:${index}`,
    );
  });
}
