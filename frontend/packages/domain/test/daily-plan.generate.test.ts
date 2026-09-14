import { describe, it, expect } from "vitest";
import {
  generateDailyPlan,
  type DailyPlanInput,
} from "../src/daily-plan/generate";
import type { KnowledgePointId } from "@cc/content-schema";

const kp = (s: string) => s as KnowledgePointId;

const base: DailyPlanInput = {
  dueReviewKpIds: [kp("r1"), kp("r2"), kp("r3")],
  recentWeakKpIds: [kp("w1"), kp("w2")],
  previousKpId: kp("prev"),
  newKpId: kp("new"),
  mixedReviewKpIds: [kp("m1"), kp("m2")],
};

describe("generateDailyPlan", () => {
  it("produces three five-question levels", () => {
    const plan = generateDailyPlan(base);
    expect(plan.map((level) => [level.name, level.slots.length])).toEqual([
      ["WAKEUP", 5],
      ["NEW", 5],
      ["CONSOLIDATION", 5],
    ]);
    expect(plan.flatMap((level) => level.slots)).toHaveLength(15);
  });

  it("wakeup uses 3 due-review and 2 recent-weak slots", () => {
    const wakeup = generateDailyPlan(base)[0];
    expect(wakeup.slots.length).toBe(5);
    expect(wakeup.slots.filter((s) => s.role === "DUE_REVIEW").length).toBe(3);
    expect(wakeup.slots.filter((s) => s.role === "RECENT_WEAK").length).toBe(2);
  });

  it("falls back to previous-kp consolidation when there is no recent weak point", () => {
    const wakeup = generateDailyPlan({ ...base, recentWeakKpIds: [] })[0];
    const fallback = wakeup.slots.filter(
      (s) => s.role === "PREV_CONSOLIDATION",
    );
    expect(fallback.length).toBe(2);
    // 首个回退槽位使用上一个知识点，第二个从复习/混合池补足不同的知识点。
    expect(fallback[0]!.kpId).toBe(kp("prev"));
    expect(fallback[1]!.kpId).not.toBe(kp("prev"));
    expect(fallback[0]!.kpId).not.toBe(fallback[1]!.kpId);
  });

  it("keeps all five wakeup slots on distinct knowledge points (no repeats)", () => {
    // 复现「热身重复」缺陷的输入：无薄弱点 → 走 PREV_CONSOLIDATION 回退分支。
    const wakeup = generateDailyPlan({ ...base, recentWeakKpIds: [] })[0];
    const kpIds = wakeup.slots.map((s) => s.kpId);
    expect(kpIds.length).toBe(5);
    expect(new Set(kpIds).size).toBe(5);
  });

  it("new level uses 2 guided, 2 practice, and 1 transfer slots", () => {
    const slots = generateDailyPlan(base)[1]!.slots;
    expect(slots.map((slot) => slot.role)).toEqual([
      "GUIDED",
      "GUIDED",
      "PRACTICE",
      "PRACTICE",
      "TRANSFER",
    ]);
  });

  it("consolidation uses 2 new, 2 mixed, and 1 challenge slots", () => {
    const slots = generateDailyPlan(base)[2]!.slots;
    expect(slots.map((slot) => slot.role)).toEqual([
      "NEW_KNOWLEDGE",
      "NEW_KNOWLEDGE",
      "MIXED",
      "MIXED",
      "CHALLENGE",
    ]);
  });

  it("fills due-review slots with the new kp when there are no due reviews", () => {
    const wakeup = generateDailyPlan({ ...base, dueReviewKpIds: [] })[0];
    const due = wakeup.slots.filter((s) => s.role === "DUE_REVIEW");
    expect(due.length).toBe(3);
    expect(due.every((s) => s.kpId === kp("new"))).toBe(true);
  });

  it("draws distinct consolidation fallbacks from the review pool when previousKpId is null", () => {
    const wakeup = generateDailyPlan({
      ...base,
      recentWeakKpIds: [],
      previousKpId: null,
    })[0];
    const fallback = wakeup.slots.filter((s) => s.role === "PREV_CONSOLIDATION");
    expect(fallback.length).toBe(2);
    // due 池已被三个 DUE_REVIEW 用尽，回退到 mixed 池取两个不同的知识点。
    expect(fallback.map((s) => s.kpId)).toEqual([kp("m1"), kp("m2")]);
  });

  it("only repeats the new kp when every candidate pool is exhausted", () => {
    const wakeup = generateDailyPlan({
      dueReviewKpIds: [],
      recentWeakKpIds: [],
      previousKpId: null,
      newKpId: kp("new"),
      mixedReviewKpIds: [],
    })[0];
    // 语料确实不足时（所有来源为空），才允许回退到 newKpId 并出现重复。
    expect(wakeup.slots.every((s) => s.kpId === kp("new"))).toBe(true);
  });
});
