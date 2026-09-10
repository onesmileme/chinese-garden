import type { ContentLevel } from "@cc/content-schema";
import type { Corpus } from "../questions/generate";

export function corpusAtOrBelow(
  corpus: Corpus,
  abilityLevel: ContentLevel,
): Corpus {
  return {
    poems: corpus.poems.filter(
      (item) => item.status === "ACTIVE" && item.level <= abilityLevel,
    ),
    idioms: corpus.idioms.filter(
      (item) => item.status === "ACTIVE" && item.level <= abilityLevel,
    ),
    characters: (corpus.characters ?? []).filter(
      (item) => item.status === "ACTIVE" && item.level <= abilityLevel,
    ),
  };
}
