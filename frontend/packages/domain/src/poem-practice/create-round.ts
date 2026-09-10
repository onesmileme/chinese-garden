import type { ContentLevel } from "@cc/content-schema";
import { corpusAtOrBelow } from "../content/levels";
import type { Corpus, GeneratedQuestion } from "../questions/generate";
import {
  canGeneratePoemFill,
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
