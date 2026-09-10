// @vitest-environment happy-dom
import { act, StrictMode } from "react";
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
  ACTIVE_DAILY_KEY,
  EventQueue,
  stableSettlementEventId,
  type ActiveDailySession,
  type LearningEvent,
  type SnapshotStorage,
} from "@cc/application";
import { generateDailyPlan } from "@cc/domain";
import { cueFor, type Cue } from "@cc/ui";
import { SummaryPage } from "../src/pages/SummaryPage";
import { dailyPlanInput } from "../src/mock/learning-content";
import {
  CONTENT_VERSION,
  RULE_VERSION,
  createSessionState,
  type SessionState,
} from "../src/session-state";

let container: HTMLDivElement;
let root: Root;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function memoryStorage(
  initial: Record<string, unknown> = {},
): SnapshotStorage & { values: Map<string, unknown> } {
  const values = new Map(Object.entries(initial));
  return {
    values,
    read: <T,>(key: string) => (values.get(key) as T | undefined) ?? null,
    write: <T,>(key: string, value: T) => {
      values.set(key, value);
    },
    remove: (key) => values.delete(key),
  };
}

function completedDaily(): ActiveDailySession {
  return {
    session: {
      sessionId: "completed-daily",
      levels: generateDailyPlan(dailyPlanInput),
      contentVersion: CONTENT_VERSION,
      ruleVersion: RULE_VERSION,
    },
    currentIndex: 15,
    firstAttemptOutcomes: Array.from({ length: 15 }, () => true),
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

function deferred(): {
  promise: Promise<void>;
  resolve(): void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function blockedQueue(gate: Promise<void>): EventQueue {
  const events: LearningEvent[] = [];
  return new EventQueue({
    append: async (event) => {
      await gate;
      events.push(event);
    },
    pending: async (limit) => events.slice(0, limit),
    ack: async () => undefined,
    all: async () => [...events],
  });
}

function renderSummary(
  state: SessionState,
  queue?: EventQueue,
  cuePlayer?: { play(cue: Cue): void },
  strict = false,
): void {
  const page = (
    <SummaryPage
      state={state}
      queue={queue}
      cuePlayer={cuePlayer}
    />
  );
  act(() =>
    root.render(
      strict ? <StrictMode>{page}</StrictMode> : page,
    ),
  );
}

function exactButton(label: string): HTMLButtonElement {
  const match = [...container.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === label,
  );
  if (!(match instanceof HTMLButtonElement)) {
    throw new Error(`button not found: ${label}`);
  }
  return match;
}

describe("SummaryPage", () => {
  beforeEach(() => {
    window.location.hash = "#/summary";
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("redirects home when no completed daily session is available", () => {
    renderSummary(createSessionState({ storage: memoryStorage() }));

    expect(window.location.hash).toBe("#/home");
    expect(container.textContent).toBe("");
  });

  it.each([
    [
      "daily index is below 15",
      {
        ...completedDaily(),
        currentIndex: 14,
        firstAttemptOutcomes: Array.from({ length: 14 }, () => true),
      },
      null,
    ],
    [
      "the completed result has fewer than 15 outcomes",
      {
        ...completedDaily(),
        firstAttemptOutcomes: Array.from({ length: 14 }, () => true),
      },
      null,
    ],
    [
      "the completed result belongs to another session",
      completedDaily(),
      {
        sessionId: "another-session",
        firstAttemptOutcomes: Array.from({ length: 15 }, () => true),
        answeredCount: 15,
      },
    ],
  ] as const)("redirects home when %s", (_case, active, result) => {
    const state = createSessionState({
      storage: memoryStorage({ [ACTIVE_DAILY_KEY]: active }),
    });
    if (result !== null) state.setLastSession(result);

    renderSummary(state);

    expect(window.location.hash).toBe("#/home");
    expect(state.getState().lastSettlement).toBeNull();
  });

  it("keeps daily progress pending and clears it only after settlement succeeds", async () => {
    const active = completedDaily();
    const storage = memoryStorage({ [ACTIVE_DAILY_KEY]: active });
    const state = createSessionState({ storage });
    const gate = deferred();
    const queue = blockedQueue(gate.promise);
    const enqueueOnce = vi.spyOn(queue, "enqueueOnce");

    await act(async () => {
      renderSummary(state, queue);
      await Promise.resolve();
    });

    expect(enqueueOnce).toHaveBeenCalledTimes(1);
    expect(enqueueOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: stableSettlementEventId(active.session.sessionId),
        eventType: "DAY_SETTLED",
      }),
    );
    expect(state.getState()).toMatchObject({
      activeDaily: active,
      lastSettlement: null,
      settledDayCount: 0,
    });
    expect(container.textContent).toContain("正在结算");

    gate.resolve();
    await act(async () => {
      await gate.promise;
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(state.getState()).toMatchObject({
      activeDaily: null,
      lastSettlement: {
        xpAwarded: 30,
        accuracyBonus: 10,
        firstCorrectRate: 1,
      },
      progression: { lifetimeXp: 30 },
      settledDayCount: 1,
    });
    expect(storage.values.has(ACTIVE_DAILY_KEY)).toBe(false);
  });

  it("keeps the completed session after rejection and retries with the same event id", async () => {
    const active = completedDaily();
    const storage = memoryStorage({ [ACTIVE_DAILY_KEY]: active });
    const state = createSessionState({ storage });
    const queue = blockedQueue(Promise.resolve());
    const enqueueOnce = vi
      .spyOn(queue, "enqueueOnce")
      .mockRejectedValueOnce(new Error("storage failed"))
      .mockImplementation(async (event) => event);

    renderSummary(state, queue);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(state.getState().activeDaily).toEqual(active);
    expect(state.getState().lastSettlement).toBeNull();
    expect(container.textContent).toContain("结算失败，请重试");

    await act(async () => {
      exactButton("重试结算").click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(enqueueOnce).toHaveBeenCalledTimes(2);
    expect(enqueueOnce.mock.calls[1]?.[0].eventId).toBe(
      enqueueOnce.mock.calls[0]?.[0].eventId,
    );
    expect(enqueueOnce.mock.calls[0]?.[0].eventId).toBe(
      stableSettlementEventId(active.session.sessionId),
    );
    expect(state.getState()).toMatchObject({
      activeDaily: null,
      settledDayCount: 1,
    });
  });

  it("finishes local settlement when the stable event is already stored", async () => {
    const active = completedDaily();
    const state = createSessionState({
      storage: memoryStorage({ [ACTIVE_DAILY_KEY]: active }),
    });
    const storedEvent: LearningEvent = {
      eventId: stableSettlementEventId(active.session.sessionId),
      childProfileId: "debug-child",
      deviceId: "debug-web",
      sessionId: active.session.sessionId,
      eventType: "DAY_SETTLED",
      clientSequence: 15,
      contentVersion: CONTENT_VERSION,
      ruleVersion: RULE_VERSION,
      occurredAt: 1_500,
      payload: {
        xpAwarded: 30,
        accuracyBonus: 10,
        firstCorrectRate: 1,
      },
    };
    const append = vi.fn(async () => undefined);
    const queue = new EventQueue({
      append,
      pending: async () => [storedEvent],
      ack: async () => undefined,
      all: async () => [storedEvent],
    });

    renderSummary(state, queue);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(append).not.toHaveBeenCalled();
    expect(state.getState()).toMatchObject({
      activeDaily: null,
      lastSettlement: {
        xpAwarded: 30,
        accuracyBonus: 10,
        firstCorrectRate: 1,
      },
      settledDayCount: 1,
    });
  });

  it("shows the celebration details and degrades a failed celebrate cue", async () => {
    const active = completedDaily();
    const state = createSessionState({
      storage: memoryStorage({ [ACTIVE_DAILY_KEY]: active }),
    });
    const queue = blockedQueue(Promise.resolve());
    const play = vi.fn(() => {
      throw new Error("audio unavailable");
    });

    renderSummary(state, queue, { play });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(play).toHaveBeenCalledWith(cueFor("celebrate"));
    expect(container.textContent).toContain("太棒啦！");
    expect(container.textContent).toContain("3 星");
    expect(container.textContent).toContain("获得 XP 30");
    expect(container.textContent).toContain("正确率奖励 +10 XP");
    expect(container.textContent).toContain("首次正确率 100%");

    act(() => exactButton("返回首页").click());
    expect(window.location.hash).toBe("#/home");
  });

  it("settles and clears only once under StrictMode effect replay", async () => {
    const active = completedDaily();
    const state = createSessionState({
      storage: memoryStorage({ [ACTIVE_DAILY_KEY]: active }),
    });
    const gate = deferred();
    const queue = blockedQueue(gate.promise);
    const enqueueOnce = vi.spyOn(queue, "enqueueOnce");
    const recordSettlement = vi.spyOn(state, "recordSettlement");
    const clearDailyProgress = vi.spyOn(state, "clearDailyProgress");

    renderSummary(state, queue, { play: () => undefined }, true);
    await act(async () => {
      await Promise.resolve();
    });

    expect(enqueueOnce).toHaveBeenCalledTimes(1);

    gate.resolve();
    await act(async () => {
      await gate.promise;
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(recordSettlement).toHaveBeenCalledTimes(1);
    expect(clearDailyProgress).toHaveBeenCalledTimes(1);
    expect(state.getState().settledDayCount).toBe(1);
  });

  it("mutates settlement state once when duplicate mounts share an in-flight event", async () => {
    const active = completedDaily();
    const state = createSessionState({
      storage: memoryStorage({ [ACTIVE_DAILY_KEY]: active }),
    });
    const gate = deferred();
    const queue = blockedQueue(gate.promise);
    const recordSettlement = vi.spyOn(state, "recordSettlement");
    const clearDailyProgress = vi.spyOn(state, "clearDailyProgress");
    const secondContainer = document.createElement("div");
    document.body.append(secondContainer);
    const secondRoot = createRoot(secondContainer);

    renderSummary(state, queue, { play: () => undefined });
    act(() => {
      secondRoot.render(
        <SummaryPage
          state={state}
          queue={queue}
          cuePlayer={{ play: () => undefined }}
        />,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    gate.resolve();
    await act(async () => {
      await gate.promise;
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(recordSettlement).toHaveBeenCalledTimes(1);
    expect(clearDailyProgress).toHaveBeenCalledTimes(1);
    expect(state.getState().settledDayCount).toBe(1);

    act(() => secondRoot.unmount());
    secondContainer.remove();
  });
});
