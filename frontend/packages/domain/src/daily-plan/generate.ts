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

// 依次遍历多个候选来源，取第一个尚未使用的知识点并登记，保证同一批槽位彼此不重复。
// 仅当所有来源都被用尽（语料不足）时才回退到 fallback，此时才可能出现重复。
function pickDistinct(
  used: Set<KnowledgePointId>,
  sources: readonly (readonly KnowledgePointId[])[],
  fallback: KnowledgePointId,
): KnowledgePointId {
  for (const source of sources) {
    for (const kpId of source) {
      if (!used.has(kpId)) {
        used.add(kpId);
        return kpId;
      }
    }
  }
  return fallback;
}

export function generateDailyPlan(input: DailyPlanInput): LevelPlan[] {
  // 热身 5 个槽位共享一个「已用知识点」集合，确保彼此不重复（避免同一诗/成语连续出现）。
  const usedInWakeup = new Set<KnowledgePointId>();
  const wakeup: PlanSlot[] = [];
  for (let i = 0; i < 3; i++)
    wakeup.push({
      role: "DUE_REVIEW",
      kpId: pickDistinct(usedInWakeup, [input.dueReviewKpIds], input.newKpId),
    });
  const hasWeak = input.recentWeakKpIds.length > 0;
  for (let i = 0; i < 2; i++) {
    if (hasWeak) {
      wakeup.push({
        role: "RECENT_WEAK",
        kpId: pickDistinct(
          usedInWakeup,
          [input.recentWeakKpIds],
          input.newKpId,
        ),
      });
    } else {
      // 无薄弱点时回退到「上一课巩固」：优先上一个知识点，再从复习池/混合池补足，
      // 使两个回退槽位落在不同知识点上，而非固定复用同一个 previousKpId。
      wakeup.push({
        role: "PREV_CONSOLIDATION",
        kpId: pickDistinct(
          usedInWakeup,
          input.previousKpId === null
            ? [input.dueReviewKpIds, input.mixedReviewKpIds]
            : [
                [input.previousKpId],
                input.dueReviewKpIds,
                input.mixedReviewKpIds,
              ],
          input.newKpId,
        ),
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
