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
