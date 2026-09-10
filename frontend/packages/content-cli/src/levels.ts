import type {
  ContentLevel,
  RuntimePackBundle,
} from "./model";

type Leveled = { level: number };

export function sliceBundleAtLevel(
  bundle: RuntimePackBundle,
  level: ContentLevel,
): RuntimePackBundle {
  const eligible = <T>(items: unknown[]): T[] =>
    items.filter((item) => (item as Leveled).level <= level) as T[];
  return {
    ...bundle,
    characterBank: {
      ...bundle.characterBank,
      characters: eligible(bundle.characterBank.characters),
    },
    poemBank: {
      ...bundle.poemBank,
      poems: eligible(bundle.poemBank.poems),
    },
    idiomBank: {
      ...bundle.idiomBank,
      idioms: eligible(bundle.idiomBank.idioms),
    },
  };
}
