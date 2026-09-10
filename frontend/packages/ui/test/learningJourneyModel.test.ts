import { describe, expect, it } from "vitest";
import {
  asKnowledgePointId,
  type KnowledgePointId,
} from "@cc/content-schema";
import type { DailyPlan, LevelPlan, PlanSlot } from "@cc/domain";
import {
  buildLearningJourneyModel,
  questionContextFor,
  type KnowledgeWorld,
} from "../src";

const sky = asKnowledgePointId("sky");
const moon = asKnowledgePointId("moon");
const poem = asKnowledgePointId("poem");
const slots = (role: string, kpId = sky): PlanSlot[] =>
  Array.from({ length: 5 }, () => ({ role, kpId }));
const plan: DailyPlan = [
  {
    name: "WAKEUP",
    slots: [
      { role: "DUE_REVIEW", kpId: sky },
      { role: "DUE_REVIEW", kpId: moon },
      { role: "DUE_REVIEW", kpId: sky },
      { role: "RECENT_WEAK", kpId: poem },
      { role: "RECENT_WEAK", kpId: moon },
    ],
  },
  { name: "NEW", slots: slots("PRACTICE") },
  { name: "CONSOLIDATION", slots: slots("MIXED", poem) },
];
const titleForKp = (kpId: KnowledgePointId): string => {
  if (kpId === sky) return "天空";
  if (kpId === moon) return "月亮";
  return "静夜思";
};
const worldsForLevel = (level: LevelPlan): readonly KnowledgeWorld[] => {
  if (level.name === "WAKEUP") return ["pinyin", "poem"];
  if (level.name === "NEW") return ["pinyin"];
  return ["poem", "idiom", "poem"];
};

describe("buildLearningJourneyModel", () => {
  it("builds Chinese stage cards and clamps every requested progress boundary", () => {
    const initial = buildLearningJourneyModel(
      plan,
      0,
      titleForKp,
      worldsForLevel,
    );
    expect(initial).toEqual({
      total: 15,
      completed: 0,
      allDone: false,
      actionLabel: "开始热身 · 共 5 题",
      tasks: [
        {
          name: "WAKEUP",
          order: 1,
          icon: "🌅",
          title: "热身",
          purpose: "复习认识的字，找回手感",
          worlds: ["pinyin", "poem"],
          knowledgeTitle: "天空、月亮",
          completed: 0,
          total: 5,
          status: "current",
        },
        {
          name: "NEW",
          order: 2,
          icon: "✨",
          title: "学新招",
          purpose: "学习新汉字，再放进词语或诗句里",
          worlds: ["pinyin"],
          knowledgeTitle: "天空",
          completed: 0,
          total: 5,
          status: "locked",
        },
        {
          name: "CONSOLIDATION",
          order: 3,
          icon: "💪",
          title: "巩固挑战",
          purpose: "混合练习，完成一句古诗",
          worlds: ["poem", "idiom"],
          knowledgeTitle: "静夜思",
          completed: 0,
          total: 5,
          status: "locked",
        },
      ],
    });

    const cases = [
      {
        count: -1,
        completed: 0,
        statuses: ["current", "locked", "locked"],
        taskCompleted: [0, 0, 0],
        actionLabel: "开始热身 · 共 5 题",
      },
      {
        count: 2,
        completed: 2,
        statuses: ["current", "locked", "locked"],
        taskCompleted: [2, 0, 0],
        actionLabel: "继续热身 · 第 3 题",
      },
      {
        count: 5,
        completed: 5,
        statuses: ["done", "current", "locked"],
        taskCompleted: [5, 0, 0],
        actionLabel: "开始学新招 · 共 5 题",
      },
      {
        count: 10,
        completed: 10,
        statuses: ["done", "done", "current"],
        taskCompleted: [5, 5, 0],
        actionLabel: "开始巩固挑战 · 共 5 题",
      },
      {
        count: 15,
        completed: 15,
        statuses: ["done", "done", "done"],
        taskCompleted: [5, 5, 5],
        actionLabel: "查看今日奖励",
      },
      {
        count: 16,
        completed: 15,
        statuses: ["done", "done", "done"],
        taskCompleted: [5, 5, 5],
        actionLabel: "查看今日奖励",
      },
    ] as const;

    for (const testCase of cases) {
      const model = buildLearningJourneyModel(
        plan,
        testCase.count,
        titleForKp,
        worldsForLevel,
      );
      expect(model.completed).toBe(testCase.completed);
      expect(model.tasks.map((task) => task.status)).toEqual(
        testCase.statuses,
      );
      expect(model.tasks.map((task) => task.completed)).toEqual(
        testCase.taskCompleted,
      );
      expect(model.actionLabel).toBe(testCase.actionLabel);
      expect(model.allDone).toBe(testCase.completed === 15);
    }
  });
});

describe("questionContextFor", () => {
  it("returns stage, knowledge, group, and overall progress with safe bounds", () => {
    expect(questionContextFor(plan, 6, titleForKp)).toEqual({
      stageName: "NEW",
      stageTitle: "学新招",
      stagePurpose: "学习新汉字，再放进词语或诗句里",
      knowledgeTitle: "天空",
      groupIndex: 2,
      groupTotal: 5,
      overallIndex: 7,
      overallTotal: 15,
    });

    expect(questionContextFor(plan, -1, titleForKp)).toMatchObject({
      stageName: "WAKEUP",
      knowledgeTitle: "天空",
      groupIndex: 1,
      overallIndex: 1,
    });
    expect(questionContextFor(plan, 16, titleForKp)).toMatchObject({
      stageName: "CONSOLIDATION",
      knowledgeTitle: "静夜思",
      groupIndex: 5,
      overallIndex: 15,
    });
  });

  it("throws a clear error for an empty daily plan", () => {
    expect(() => questionContextFor([], 0, titleForKp)).toThrow(
      "daily plan must contain at least one question",
    );
  });
});
