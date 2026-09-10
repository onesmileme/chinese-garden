// @vitest-environment happy-dom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACTIVE_ASSESSMENT_KEY,
  ACTIVE_DAILY_KEY,
  ASSESSMENT_COMPLETED_KEY,
  type ActiveDailySession,
  type SnapshotStorage,
} from "@cc/application";
import { generateDailyPlan, initAssessment } from "@cc/domain";
import { App } from "../src/App";
import { HomePage } from "../src/pages/HomePage";
import { dailyPlanInput } from "../src/mock/learning-content";
import {
  CONTENT_VERSION,
  RULE_VERSION,
  createSessionState,
  sessionState,
  type SessionState,
} from "../src/session-state";

interface MemoryStorage extends SnapshotStorage {
  writes: string[];
}

let container: HTMLDivElement;
let root: Root | null;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function memoryStorage(initial: Record<string, unknown> = {}): MemoryStorage {
  const values = new Map(Object.entries(initial));
  const writes: string[] = [];
  return {
    writes,
    read: <T,>(key: string) => (values.get(key) as T | undefined) ?? null,
    write: <T,>(key: string, value: T) => {
      values.set(key, value);
      writes.push(key);
    },
    remove: (key) => values.delete(key),
  };
}

function renderHome(state: SessionState, strict = false): void {
  const page = <HomePage state={state} />;
  act(() => root?.render(strict ? <StrictMode>{page}</StrictMode> : page));
}

function button(label: string): HTMLButtonElement {
  const match = [...container.querySelectorAll("button")].find(
    (item) =>
      item.textContent?.trim() === label ||
      item.getAttribute("aria-label") === label,
  );
  if (!(match instanceof HTMLButtonElement)) {
    throw new Error(`button not found: ${label}`);
  }
  return match;
}

function click(element: HTMLElement): void {
  act(() =>
    element.dispatchEvent(new MouseEvent("click", { bubbles: true })),
  );
}

describe("HomePage", () => {
  beforeEach(() => {
    window.location.hash = "#/home";
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root !== null) act(() => root?.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("creates one daily snapshot and routes the exact assessment CTA", () => {
    const storage = memoryStorage();
    const state = createSessionState({ storage });

    renderHome(state, true);

    expect(storage.writes.filter((key) => key === ACTIVE_DAILY_KEY)).toHaveLength(
      1,
    );
    expect(container.textContent).toContain("诗词");
    expect(container.textContent).toContain("古诗");
    expect(container.textContent).toContain("成语");
    expect(container.textContent).toContain("0 / 15");
    expect(container.textContent).toContain("热身");
    expect(container.textContent).toContain("学新招");
    expect(container.textContent).toContain("巩固挑战");

    click(button("先做能力探索 · 每轮 5 题"));
    expect(window.location.hash).toBe("#/assessment");
  });

  it("routes the current daily task to lesson after assessment completion", () => {
    const state = createSessionState({
      storage: memoryStorage({ [ASSESSMENT_COMPLETED_KEY]: true }),
    });
    renderHome(state);

    click(button("开始热身 · 共 5 题"));

    expect(window.location.hash).toBe("#/lesson");
  });

  it("routes the independent idiom entry without changing daily totals", () => {
    const state = createSessionState({ storage: memoryStorage() });
    renderHome(state);

    expect(container.textContent).toContain("今日进度 0 / 15");
    click(button("成语 自由练习"));

    expect(window.location.hash).toBe("#/idiom-practice");
    expect(state.getState().activeDaily?.currentIndex).toBe(0);
  });

  it("shows today's completed summary without creating another daily session", () => {
    const storage = memoryStorage({
      [ASSESSMENT_COMPLETED_KEY]: true,
    });
    const state = createSessionState({ storage });
    state.recordSettlement(
      {
        xpAwarded: 30,
        accuracyBonus: 10,
        firstCorrectRate: 1,
      },
      "settled-today",
    );

    renderHome(state, true);

    expect(
      storage.writes.filter((key) => key === ACTIVE_DAILY_KEY),
    ).toHaveLength(0);
    expect(state.getState().activeDaily).toBeNull();
    expect(container.textContent).toContain("今日任务已完成");
    expect(container.textContent).toContain("今日进度 15 / 15");
    expect(container.textContent).toContain("获得 30 XP");
    expect(container.textContent).toContain("首次正确率 100%");
    expect(container.textContent).not.toContain("正在准备今日任务");

    click(button("成语 自由练习"));
    expect(window.location.hash).toBe("#/idiom-practice");
  });

  it("keeps the idiom entry available while daily tasks are loading", () => {
    const state = createSessionState({ storage: memoryStorage() });
    state.setActiveDaily = vi.fn();

    renderHome(state);

    expect(container.textContent).toContain("正在准备今日任务");
    click(button("成语 自由练习"));
    expect(window.location.hash).toBe("#/idiom-practice");
  });

  it("keeps an in-progress assessment pinned without an update notice", () => {
    const storage = memoryStorage({
      [ACTIVE_ASSESSMENT_KEY]: {
        state: initAssessment(0),
        round: 0,
        questionIndex: 0,
        correctCount: 0,
        startedAt: 1,
        contentVersion: "outdated",
        contentSelection: {
          childProfileId: "debug-child",
          authentication: "GUEST",
          version: "outdated",
          abilityLevel: 5,
        },
        updatedAt: 1,
      },
    });
    const state = createSessionState({ storage });

    renderHome(state);
    expect(container.textContent).not.toContain("学习内容已更新");
    expect(state.getState().activeAssessment?.contentVersion).toBe("outdated");

    act(() => root?.unmount());
    root = createRoot(container);
    renderHome(state);

    expect(container.textContent).not.toContain("学习内容已更新");
  });

  it("opens guardian after holding the parent gate for three seconds", () => {
    vi.useFakeTimers();
    const state = createSessionState({ storage: memoryStorage() });
    renderHome(state);

    const gate = container.querySelector(
      'button[aria-label="长按进入家长中心"]',
    );
    if (!(gate instanceof HTMLButtonElement)) {
      throw new Error("parent gate not found");
    }
    act(() =>
      gate.dispatchEvent(new Event("pointerdown", { bubbles: true })),
    );
    act(() => vi.advanceTimersByTime(3_000));

    expect(window.location.hash).toBe("#/guardian");
  });
});

describe("App routes", () => {
  beforeEach(() => {
    sessionState.clearDailyProgress();
    sessionState.clearAssessmentProgress();
    sessionState.clearChallengeProgress();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root !== null) act(() => root?.unmount());
    container.remove();
  });

  it("renders the assessment page for the assessment hash", async () => {
    window.location.hash = "#/assessment";

    await act(async () => root?.render(<App />));

    expect(container.textContent).toContain("能力探索");
    expect(container.textContent).not.toContain("题型调试器");
  });

  it("renders the summary page for a completed daily session", async () => {
    const completed: ActiveDailySession = {
      session: {
        sessionId: "app-summary",
        levels: generateDailyPlan(dailyPlanInput),
        contentVersion: "bundled-corpus-v5-L5",
        ruleVersion: RULE_VERSION,
      },
      currentIndex: 15,
      firstAttemptOutcomes: Array.from({ length: 15 }, () => true),
      contentVersion: "bundled-corpus-v5-L5",
      contentSelection: {
        childProfileId: "debug-child",
        authentication: "GUEST",
        version: "bundled-corpus-v5-L5",
        abilityLevel: 5,
      },
      ruleVersion: RULE_VERSION,
      updatedAt: 1_000,
    };
    sessionState.setActiveDaily(completed);
    sessionState.setLastSession({
      sessionId: completed.session.sessionId,
      firstAttemptOutcomes: completed.firstAttemptOutcomes,
      answeredCount: 15,
    });
    window.location.hash = "#/summary";

    await act(async () => root?.render(<App />));

    expect(window.location.hash).toBe("#/summary");
    expect(container.textContent).toContain("今日结算");
  });

  it("safely redirects an unfinished summary route home", async () => {
    sessionState.clearDailyProgress();
    window.location.hash = "#/summary";

    await act(async () => root?.render(<App />));

    expect(window.location.hash).toBe("#/home");
    expect(container.textContent).toContain("今日学习");
  });

  it("renders the decoration-free guardian page for its route", async () => {
    window.location.hash = "#/guardian";

    await act(async () => root?.render(<App />));

    expect(window.location.hash).toBe("#/guardian");
    expect(container.textContent).toContain("家长中心");
    expect(
      container.querySelectorAll('[aria-label="ink-decor"]'),
    ).toHaveLength(0);
  });

  it("renders the idiom practice page for its route", async () => {
    window.location.hash = "#/idiom-practice";

    await act(async () => root?.render(<App />));

    expect(window.location.hash).toBe("#/idiom-practice");
    expect(container.textContent).toContain("成语世界");
  });
});
