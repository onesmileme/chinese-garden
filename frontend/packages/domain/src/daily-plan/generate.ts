import type { KnowledgePointId } from "@cc/content-schema";

export interface DailyPlanInput {
  dueReviewKpIds: KnowledgePointId[];
  recentWeakKpIds: KnowledgePointId[];
  previousKpId: KnowledgePointId | null;
  newKpId: KnowledgePointId;
  mixedReviewKpIds: KnowledgePointId[];
}
export interface PlanSlot {
  role: string;
  kpId: KnowledgePointId;
}
export interface LevelPlan {
  name: "WAKEUP" | "NEW" | "CONSOLIDATION";
  slots: PlanSlot[];
}
/** 每日计划：generateDailyPlan 的产出，即三个关卡（唤醒/新知/巩固）的有序数组。 */
export type DailyPlan = LevelPlan[];

// 从来源列表按 index 取值并在耗尽时回绕，保证槽位始终被填满。
function pick(
  source: KnowledgePointId[],
  index: number,
  fallback: KnowledgePointId,
): KnowledgePointId {
  if (source.length === 0) return fallback;
  return source[index % source.length]!;
}

export function generateDailyPlan(input: DailyPlanInput): LevelPlan[] {
  const wakeup: PlanSlot[] = [];
  for (let i = 0; i < 3; i++)
    wakeup.push({
      role: "DUE_REVIEW",
      kpId: pick(input.dueReviewKpIds, i, input.newKpId),
    });
  const hasWeak = input.recentWeakKpIds.length > 0;
  for (let i = 0; i < 2; i++) {
    if (hasWeak) {
      wakeup.push({
        role: "RECENT_WEAK",
        kpId: pick(input.recentWeakKpIds, i, input.newKpId),
      });
    } else {
      wakeup.push({
        role: "PREV_CONSOLIDATION",
        kpId: input.previousKpId ?? input.newKpId,
      });
    }
  }

  const knew: PlanSlot[] = [
    ...Array.from({ length: 2 }, () => ({
      role: "GUIDED",
      kpId: input.newKpId,
    })),
    ...Array.from({ length: 2 }, () => ({
      role: "PRACTICE",
      kpId: input.newKpId,
    })),
    { role: "TRANSFER", kpId: input.newKpId },
  ];

  const consolidation: PlanSlot[] = [
    ...Array.from({ length: 2 }, () => ({
      role: "NEW_KNOWLEDGE",
      kpId: input.newKpId,
    })),
    ...Array.from({ length: 2 }, (_v, i) => ({
      role: "MIXED",
      kpId: pick(input.mixedReviewKpIds, i, input.newKpId),
    })),
    { role: "CHALLENGE", kpId: input.newKpId },
  ];

  return [
    { name: "WAKEUP", slots: wakeup },
    { name: "NEW", slots: knew },
    { name: "CONSOLIDATION", slots: consolidation },
  ];
}
