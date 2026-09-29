// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  ACTIVE_ASSESSMENT_KEY,
  ACTIVE_DAILY_KEY,
  ASSESSMENT_COMPLETED_KEY,
  createGuardianSettingsStore,
  type ActiveAssessmentSession,
  type ActiveDailySession,
  type GuardianSettingsRepository,
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
import { App } from "../src/App";

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

function createSettings(
  repository: GuardianSettingsRepository = {
    read: () => null,
    write: () => undefined,
  },
) {
  return createGuardianSettingsStore({ repository });
}

function setting(label: string): HTMLInputElement {
  const input = container.querySelector(`input[aria-label="${label}"]`);
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`setting not found: ${label}`);
  }
  return input;
}

function button(label: string): HTMLButtonElement {
  const candidate = [...container.querySelectorAll("button")].find(
    (item) => item.textContent?.includes(label),
  );
  if (!(candidate instanceof HTMLButtonElement)) {
    throw new Error(`button not found: ${label}`);
  }
  return candidate;
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

  it("shows learning data and ordered guardian settings", () => {
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

    act(() =>
      root.render(
        <GuardianPage state={state} settings={createSettings()} />,
      ),
    );

    expect(container.textContent).toContain("能力探索");
    expect(container.textContent).toContain("进行中 · 第 3 题");
    expect(container.textContent).toContain("今日进度");
    expect(container.textContent).toContain("7 / 15");
    expect(container.textContent).toContain("当前等级");
    expect(container.textContent).toContain("Lv.3");
    expect(container.textContent).toContain("累计成长值");
    expect(container.textContent).toContain("120");
    expect(container.textContent).toContain("已完成天数");
    expect(container.textContent).toContain("0 天");
    const copy = container.textContent ?? "";
    expect(copy.indexOf("学习状态")).toBeLessThan(
      copy.indexOf("成长记录"),
    );
    expect(copy.indexOf("成长记录")).toBeLessThan(
      copy.indexOf("声音与体验"),
    );
    expect(copy.indexOf("声音与体验")).toBeLessThan(
      copy.indexOf("数据管理"),
    );
    expect(
      ["背景音乐", "答题音效", "震动反馈", "护眼模式"].map(
        (label) => setting(label).checked,
      ),
    ).toEqual([true, true, true, false]);
    expect(setting("背景音乐").disabled).toBe(true);
    expect(container.textContent).toContain(
      "当前暂无背景音乐资源，暂不支持此设置",
    );
    expect(
      [...container.querySelectorAll<HTMLElement>("[data-setting-key]")].map(
        (row) => row.style.minHeight,
      ),
    ).toEqual(["64px", "64px", "64px", "64px"]);
    expect(
      container.querySelectorAll('[aria-label="ink-decor"]'),
    ).toHaveLength(0);

    act(() => {
      button("返回首页").click();
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

    act(() =>
      root.render(
        <GuardianPage state={state} settings={createSettings()} />,
      ),
    );

    expect(container.textContent).toContain("能力探索");
    expect(container.textContent).toContain("已完成");
    expect(container.textContent).toContain("已结算 · 15 / 15");
    expect(container.textContent).toContain("累计成长值");
    expect(container.textContent).toContain("30");
    expect(container.textContent).toContain("已完成天数");
    expect(container.textContent).toContain("1 天");
    expect(
      container.querySelectorAll('[aria-label="ink-decor"]'),
    ).toHaveLength(0);
  });

  it("commits setting changes and exposes storage rollback", async () => {
    const write = vi
      .fn<GuardianSettingsRepository["write"]>()
      .mockRejectedValueOnce(new Error("storage full"))
      .mockResolvedValue(undefined);
    const settings = createSettings({ read: () => null, write });

    await act(async () => {
      root.render(
        <GuardianPage
          state={createSessionState({ storage: memoryStorage() })}
          settings={settings}
        />,
      );
    });

    await act(async () => {
      setting("答题音效").click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(setting("答题音效").checked).toBe(true);
    expect(container.textContent).toContain("设置保存失败，请重试");

    await act(async () => {
      setting("答题音效").click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(setting("答题音效").checked).toBe(false);
    expect(container.textContent).not.toContain("设置保存失败，请重试");
  });

  it("requires confirmation and initially focuses cancellation", async () => {
    const clearRecords = vi.fn(async () => undefined);
    act(() =>
      root.render(
        <GuardianPage
          state={createSessionState({ storage: memoryStorage() })}
          settings={createSettings()}
          clearRecords={clearRecords}
        />,
      ),
    );

    act(() => button("清除学习记录").click());

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.textContent).toContain("清除后无法恢复");
    expect(document.activeElement).toBe(button("取消"));

    act(() => button("取消").click());
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(clearRecords).not.toHaveBeenCalled();

    act(() => button("清除学习记录").click());
    await act(async () => {
      button("确认清除").click();
      await Promise.resolve();
    });

    expect(clearRecords).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("keeps the confirmation open when clearing fails", async () => {
    const clearRecords = vi.fn(async () => {
      throw new Error("storage unavailable");
    });
    act(() =>
      root.render(
        <GuardianPage
          state={createSessionState({ storage: memoryStorage() })}
          settings={createSettings()}
          clearRecords={clearRecords}
        />,
      ),
    );

    act(() => button("清除学习记录").click());
    await act(async () => {
      button("确认清除").click();
      await Promise.resolve();
    });

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.textContent).toContain("清除学习记录失败，请重试");
  });
});

describe("playground App", () => {
  beforeEach(() => {
    window.location.hash = "#/home";
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("restores guardian preferences during startup", async () => {
    const ready = vi.fn(async () => undefined);
    const settings = {
      ...createSettings(),
      ready,
    };

    await act(async () => {
      root.render(<App settings={settings} />);
    });

    expect(ready).toHaveBeenCalledTimes(1);
  });
});
