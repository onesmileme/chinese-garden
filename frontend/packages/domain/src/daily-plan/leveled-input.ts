import type {
  ContentLevel,
  KnowledgePointId,
} from "@cc/content-schema";
import { corpusAtOrBelow } from "../content/levels";
import {
  makeSeededRng,
  seededShuffle,
} from "../questions/deterministic-random";
import type { Corpus } from "../questions/generate";
import type { DailyPlanInput } from "./generate";

export interface LeveledDailyPlanInput {
  corpus: Corpus;
  abilityLevel: ContentLevel;
  remediation: boolean;
  due: readonly KnowledgePointId[];
  weak: readonly KnowledgePointId[];
  mastered: readonly KnowledgePointId[];
  seed: string;
}

export function createLeveledDailyPlanInput(
  input: LeveledDailyPlanInput,
): DailyPlanInput {
  const corpus = corpusAtOrBelow(input.corpus, input.abilityLevel);
  const entries = [...corpus.poems, ...corpus.idioms];
  if (entries.length === 0) {
    throw new Error("no unlocked content for daily plan");
  }
  if (corpus.poems.length === 0) {
    throw new Error("no unlocked poem for daily plan challenge");
  }
  const eligible = new Set(entries.map(({ id }) => id));
  const current = corpus.poems
    .filter(({ level }) => level === input.abilityLevel)
    .map(({ id }) => id);
  const lower = entries
    .filter(({ level }) => level < input.abilityLevel)
    .map(({ id }) => id);
  const currentPool =
    current.length > 0 ? current : corpus.poems.map(({ id }) => id);
  const reviewPool =
    input.remediation && lower.length > 0
      ? lower
      : entries.map(({ id }) => id);
  const filterEligible = (ids: readonly KnowledgePointId[]) =>
    ids.filter((id, index) => eligible.has(id) && ids.indexOf(id) === index);
  const ordered = (
    preferred: readonly KnowledgePointId[],
    fallback: readonly KnowledgePointId[],
    suffix: string,
  ) =>
    seededShuffle(
      [...new Set([...filterEligible(preferred), ...fallback])],
      makeSeededRng(`${input.seed}:${suffix}`),
    );
  const dueReviewKpIds = ordered(input.due, reviewPool, "due");
  const recentWeakKpIds =
    input.remediation || filterEligible(input.weak).length > 0
      ? ordered(input.weak, reviewPool, "weak")
      : [];
  const mixedReviewKpIds = ordered(
    [...input.mastered, ...input.due, ...input.weak],
    reviewPool,
    "mixed",
  );
  const newKpId = seededShuffle(
    [...currentPool],
    makeSeededRng(`${input.seed}:new`),
  )[0]!;
  const previousKpId = ordered(input.mastered, reviewPool, "previous")[0]!;
  return {
    dueReviewKpIds,
    recentWeakKpIds,
    previousKpId,
    newKpId,
    mixedReviewKpIds,
  };
}
