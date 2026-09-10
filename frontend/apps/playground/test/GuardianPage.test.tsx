// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ACTIVE_ASSESSMENT_KEY,
  ACTIVE_DAILY_KEY,
  ASSESSMENT_COMPLETED_KEY,
  type ActiveAssessmentSession,
  type ActiveDailySession,
  type SnapshotStorage,
} from "@cc/application";
import { generateDailyPlan, initAssessment } from "@cc/domain";
import { GuardianPage } from "../src/pages/GuardianPage";
import { dailyPlanInput } from "../src/mock/learning-content";
import {
  CONTENT_VERSION,
  RULE_VERSION,
  createSessionState,
} from "../src/session-state";

let container: HTMLDivElement;
let root: Root;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function memoryStorage(
  initial: Record<string, unknown> = {},
): SnapshotStorage {
  const values = new Map(Object.entries(initial));
  return {
    read: <T,>(key: string) => (values.get(key) as T | undefined) ?? null,
    write: <T,>(key: string, value: T) => {
      values.set(key, value);
    },
    remove: (key) => values.delete(key),
  };
}

function activeDaily(): ActiveDailySession {
  return {
    session: {
      sessionId: "daily-progress",
      levels: generateDailyPlan(dailyPlanInput),
      contentVersion: CONTENT_VERSION,
      ruleVersion: RULE_VERSION,
    },
    currentIndex: 7,
    firstAttemptOutcomes: Array.from({ length: 7 }, () => true),
    contentVersion: CONTENT_VERSION,
    contentSelection: {
      childProfileId: "debug-child",
      authentication: "GUEST",
      version: CONTENT_VERSION,
      abilityLevel: 5,
    },
    ruleVersion: RULE_VERSION,
    updatedAt: 1_000,
  };
}

function activeAssessment(): ActiveAssessmentSession {
  return {
    state: initAssessment(0),
    round: 0,
    questionIndex: 2,
    correctCount: 1,
    startedAt: 500,
    contentVersion: CONTENT_VERSION,
    contentSelection: {
      childProfileId: "debug-child",
      authentication: "GUEST",
      version: CONTENT_VERSION,
      abilityLevel: 5,
    },
    updatedAt: 1_000,
  };
}

describe("GuardianPage", () => {
  beforeEach(() => {
    window.location.hash = "#/guardian";
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows active learning progress without child decorations", () => {
    const state = createSessionState({
      storage: memoryStorage({
        [ACTIVE_DAILY_KEY]: activeDaily(),
        [ACTIVE_ASSESSMENT_KEY]: activeAssessment(),
      }),
      initialProgression: {
        level: 3,
        lifetimeXp: 120,
        xpIntoLevel: 20,
        appliedEventIds: [],
      },
    });

    act(() => root.render(<GuardianPage state={state} />));

    expect(container.textContent).toContain("能力探索");
    expect(container.textContent).toContain("进行中 · 第 3 题");
    expect(container.textContent).toContain("今日进度");
    expect(container.textContent).toContain("7 / 15");
    expect(container.textContent).toContain("当前等级");
    expect(container.textContent).toContain("Lv.3");
    expect(container.textContent).toContain("累计经验");
    expect(container.textContent).toContain("120 XP");
    expect(container.textContent).toContain("已完成天数");
    expect(container.textContent).toContain("0 天");
    expect(
      container.querySelectorAll('[aria-label="ink-decor"]'),
    ).toHaveLength(0);

    act(() => {
      const button = [...container.querySelectorAll("button")].find(
        (candidate) => candidate.textContent?.includes("返回首页"),
      );
      button?.click();
    });
    expect(window.location.hash).toBe("#/home");
  });

  it("shows completed assessment and settled daily progress", () => {
    const state = createSessionState({
      storage: memoryStorage({
        [ASSESSMENT_COMPLETED_KEY]: true,
      }),
    });
    state.recordSettlement(
      {
        xpAwarded: 30,
        accuracyBonus: 10,
        firstCorrectRate: 1,
      },
      "settled-day",
    );

    act(() => root.render(<GuardianPage state={state} />));

    expect(container.textContent).toContain("能力探索");
    expect(container.textContent).toContain("已完成");
    expect(container.textContent).toContain("已结算 · 15 / 15");
    expect(container.textContent).toContain("累计经验");
    expect(container.textContent).toContain("30 XP");
    expect(container.textContent).toContain("已完成天数");
    expect(container.textContent).toContain("1 天");
    expect(
      container.querySelectorAll('[aria-label="ink-decor"]'),
    ).toHaveLength(0);
  });
});
