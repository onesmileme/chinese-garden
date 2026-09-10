import type { KnowledgePointId } from "@cc/content-schema";
import type { DailyPlan, LevelPlan } from "@cc/domain";
import type { KnowledgeWorld } from "./knowledgeWorldModel";

export type TaskStatus = "done" | "current" | "locked";

export interface LearningTaskVM {
  name: LevelPlan["name"];
  order: number;
  icon: string;
  title: string;
  purpose: string;
  worlds: KnowledgeWorld[];
  knowledgeTitle: string;
  completed: number;
  total: number;
  status: TaskStatus;
}

export interface LearningJourneyVM {
  tasks: LearningTaskVM[];
  completed: number;
  total: number;
  actionLabel: string;
  allDone: boolean;
}

export interface DailyQuestionContext {
  stageName: LevelPlan["name"];
  stageTitle: string;
  stagePurpose: string;
  knowledgeTitle: string;
  groupIndex: number;
  groupTotal: number;
  overallIndex: number;
  overallTotal: number;
}

interface StageMeta {
  icon: string;
  title: string;
  purpose: string;
}

const META = {
  WAKEUP: {
    icon: "🌅",
    title: "热身",
    purpose: "复习认识的字，找回手感",
  },
  NEW: {
    icon: "✨",
    title: "学新招",
    purpose: "学习新汉字，再放进词语或诗句里",
  },
  CONSOLIDATION: {
    icon: "💪",
    title: "巩固挑战",
    purpose: "混合练习，完成一句古诗",
  },
} satisfies Record<LevelPlan["name"], StageMeta>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function knowledgeTitles(
  level: LevelPlan,
  titleForKp: (kpId: KnowledgePointId) => string,
): string {
  return [...new Set(level.slots.map((slot) => titleForKp(slot.kpId)))]
    .slice(0, 2)
    .join("、");
}

export function buildLearningJourneyModel(
  plan: DailyPlan,
  completedCount: number,
  titleForKp: (kpId: KnowledgePointId) => string,
  worldsForLevel: (level: LevelPlan) => readonly KnowledgeWorld[],
): LearningJourneyVM {
  const total = plan.reduce((sum, level) => sum + level.slots.length, 0);
  const completed = clamp(completedCount, 0, total);
  let offset = 0;
  const tasks = plan.map((level, index): LearningTaskVM => {
    const meta = META[level.name];
    const localCompleted = clamp(completed - offset, 0, level.slots.length);
    const status: TaskStatus =
      localCompleted === level.slots.length
        ? "done"
        : completed >= offset
          ? "current"
          : "locked";
    offset += level.slots.length;
    return {
      name: level.name,
      order: index + 1,
      icon: meta.icon,
      title: meta.title,
      purpose: meta.purpose,
      worlds: [...new Set(worldsForLevel(level))],
      knowledgeTitle: knowledgeTitles(level, titleForKp),
      completed: localCompleted,
      total: level.slots.length,
      status,
    };
  });
  const allDone = completed === total;
  if (allDone) {
    return {
      tasks,
      completed,
      total,
      actionLabel: "查看今日奖励",
      allDone,
    };
  }

  const current = tasks.find((task) => task.status === "current")!;
  return {
    tasks,
    completed,
    total,
    actionLabel:
      current.completed === 0
        ? `开始${current.title} · 共 ${current.total} 题`
        : `继续${current.title} · 第 ${current.completed + 1} 题`,
    allDone,
  };
}

export function questionContextFor(
  plan: DailyPlan,
  globalIndex: number,
  titleForKp: (kpId: KnowledgePointId) => string,
): DailyQuestionContext {
  const total = plan.reduce((sum, level) => sum + level.slots.length, 0);
  const safeIndex = clamp(globalIndex, 0, Math.max(total - 1, 0));
  let offset = 0;
  for (const level of plan) {
    const nextOffset = offset + level.slots.length;
    if (safeIndex < nextOffset) {
      const slot = level.slots[safeIndex - offset]!;
      const meta = META[level.name];
      return {
        stageName: level.name,
        stageTitle: meta.title,
        stagePurpose: meta.purpose,
        knowledgeTitle: titleForKp(slot.kpId),
        groupIndex: safeIndex - offset + 1,
        groupTotal: level.slots.length,
        overallIndex: safeIndex + 1,
        overallTotal: total,
      };
    }
    offset = nextOffset;
  }
  throw new Error("daily plan must contain at least one question");
}
