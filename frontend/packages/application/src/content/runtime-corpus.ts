import type {
  ContentLevel,
  KnowledgePointId,
} from "@cc/content-schema";
import type {
  ChildDifficulty,
  Corpus,
} from "@cc/domain";
import type { KnowledgePointDescription } from "../session/materialize-daily";

function learningEntry(corpus: Corpus, kpId: KnowledgePointId) {
  const poem = corpus.poems.find(({ id }) => id === kpId);
  if (poem) {
    return { kind: "POEM" as const, title: poem.title };
  }
  const idiom = corpus.idioms.find(({ id }) => id === kpId);
  if (idiom) {
    return { kind: "IDIOM" as const, title: idiom.text };
  }
  throw new Error(`knowledge point not found: ${kpId}`);
}

export function describeKnowledgePoint(
  corpus: Corpus,
  kpId: KnowledgePointId,
): KnowledgePointDescription {
  const { kind } = learningEntry(corpus, kpId);
  return { kind };
}

export function knowledgePointTitle(
  corpus: Corpus,
  kpId: KnowledgePointId,
): string {
  return learningEntry(corpus, kpId).title;
}

export function knowledgePointDifficulty(
  corpus: Corpus,
  kpId: KnowledgePointId,
): ChildDifficulty {
  const entry =
    corpus.poems.find(({ id }) => id === kpId) ??
    corpus.idioms.find(({ id }) => id === kpId);
  if (!entry) throw new Error(`knowledge point not found: ${kpId}`);
  return Math.min(5, Math.max(1, entry.difficulty)) as ChildDifficulty;
}

export function assessmentKnowledgePointIds(
  corpus: Corpus,
  abilityLevel: ContentLevel,
): KnowledgePointId[] {
  const entries = [...corpus.poems, ...corpus.idioms]
    .filter(
      ({ level, status }) =>
        status === "ACTIVE" && level <= abilityLevel,
    )
    .sort((left, right) => left.id.localeCompare(right.id, "en"));
  if (entries.length === 0) {
    throw new Error("no unlocked content for assessment");
  }
  return Array.from({ length: abilityLevel }, (_, index) => {
    const level = (index + 1) as ContentLevel;
    return (
      entries.find((entry) => entry.level === level) ??
      entries[entries.length - 1]!
    ).id;
  });
}
