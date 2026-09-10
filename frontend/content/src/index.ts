import {
  asKnowledgePointId,
  characterSchema,
  idiomSchema,
  poemSchema,
  type Character,
  type ContentMetadata,
  type Idiom,
  type Poem,
} from "@cc/content-schema";
import characterBank from "../corpus/character-bank.json";
import idiomBank from "../corpus/idiom-bank.json";
import poemBank from "../corpus/poem-bank.json";

export interface ChallengeCorpus {
  characters: Character[];
  poems: Poem[];
  idioms: Idiom[];
}

export interface ChallengeContent {
  readonly corpus: ChallengeCorpus;
  readonly contentVersion: string;
}

function active<T extends ContentMetadata>(entries: readonly T[]): T[] {
  return entries.filter((entry) => entry.status === "ACTIVE");
}

const characters = characterSchema.array().parse(characterBank.characters).map(
  (entry) => ({ ...entry, id: asKnowledgePointId(entry.id) }),
);
const poems = poemSchema.array().parse(poemBank.poems).map((entry) => ({
  ...entry,
  id: asKnowledgePointId(entry.id),
  charRefs: entry.charRefs?.map(asKnowledgePointId),
}));
const idioms = idiomSchema.array().parse(idiomBank.idioms).map((entry) => ({
  ...entry,
  id: asKnowledgePointId(entry.id),
}));

export const challengeContent: ChallengeContent = {
  corpus: {
    characters: active(characters),
    poems: active(poems),
    idioms: active(idioms),
  },
  contentVersion: characterBank.version,
};
export const {
  corpus: challengeCorpus,
  contentVersion: challengeContentVersion,
} = challengeContent;
