import type { KnowledgePointId } from "@cc/content-schema";
import type { KnowledgePointDescription } from "@cc/application";
import type { ChildDifficulty, DailyPlanInput } from "@cc/domain";
import { demoCorpus } from "./corpus";

function findKnowledgePoint(kpId: KnowledgePointId):
  | { kind: "IDIOM"; title: string }
  | { kind: "POEM"; title: string } {
  const poem = demoCorpus.poems.find(({ id }) => id === kpId);
  if (poem) return { kind: "POEM", title: poem.title };

  const idiom = demoCorpus.idioms.find(({ id }) => id === kpId);
  if (idiom) return { kind: "IDIOM", title: idiom.text };

  throw new Error(`knowledge point not found: ${kpId}`);
}

/** 将计划知识点映射为挑战基准难度（clamp 到 1–5）。 */
export function resolveDifficulty(kpId: KnowledgePointId): ChildDifficulty {
  const poem = demoCorpus.poems.find(({ id }) => id === kpId);
  const idiom = demoCorpus.idioms.find(({ id }) => id === kpId);
  const raw = poem?.difficulty ?? idiom?.difficulty;
  if (raw === undefined) {
    throw new Error(`knowledge point not found: ${kpId}`);
  }
  return Math.min(5, Math.max(1, raw)) as ChildDifficulty;
}

function existingKpId(value: string): KnowledgePointId {
  const kpId = value as KnowledgePointId;
  findKnowledgePoint(kpId);
  return kpId;
}

export function kpTitle(kpId: KnowledgePointId): string {
  return findKnowledgePoint(kpId).title;
}

export function kindForKp(
  kpId: KnowledgePointId,
): KnowledgePointDescription {
  return { kind: findKnowledgePoint(kpId).kind };
}

export const assessmentLevelKpIds: readonly KnowledgePointId[] = [
  existingKpId("cy-yixinyiyi"),
  existingKpId("sc-jingyesi"),
  existingKpId("sc-chunxiao"),
];

export const dailyPlanInput: DailyPlanInput = {
  dueReviewKpIds: [
    existingKpId("cy-yixinyiyi"),
    existingKpId("cy-madaochenggong"),
    existingKpId("cy-fayangguangda"),
  ],
  recentWeakKpIds: [
    existingKpId("sc-jingyesi"),
    existingKpId("sc-yonge"),
  ],
  previousKpId: existingKpId("sc-yonge"),
  newKpId: existingKpId("sc-jingyesi"),
  mixedReviewKpIds: [
    existingKpId("cy-yixinyiyi"),
    existingKpId("sc-yonge"),
  ],
};

export { demoCorpus };
