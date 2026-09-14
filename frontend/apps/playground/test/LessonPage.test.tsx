// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACTIVE_DAILY_KEY,
  EventQueue,
  materializeDailyQuestions,
  type ActiveDailySession,
  type EventStore,
  type LearningEvent,
  type SnapshotStorage,
} from "@cc/application";
import {
  generateDailyPlan,
  type GeneratedQuestion,
} from "@cc/domain";
import { learningEventSchema } from "@cc/content-schema";
import { CORRECT_FEEDBACK_MS, type Cue } from "@cc/ui";
import { App } from "../src/App";
import { LessonPage } from "../src/pages/LessonPage";
import {
  dailyPlanInput,
  demoCorpus,
  kindForKp,
  kpTitle,
} from "../src/mock/learning-content";
import {
  RULE_VERSION,
  createSessionState,
  sessionState,
  type SessionState,
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

function activeDaily(
  overrides: Partial<ActiveDailySession> = {},
): ActiveDailySession {
  const contentVersion = "bundled-corpus-v5-L5";
  return {
    session: {
      sessionId: "daily-session",
      levels: generateDailyPlan(dailyPlanInput),
      contentVersion,
      ruleVersion: RULE_VERSION,
    },
    currentIndex: 0,
    firstAttemptOutcomes: [],
    contentVersion,
    contentSelection: {
      childProfileId: "debug-child",
      authentication: "GUEST",
      version: contentVersion,
      abilityLevel: 5,
    },
    ruleVersion: RULE_VERSION,
    updatedAt: 1_000,
    ...overrides,
  };
}

function eventQueue(rejectCount = 0): {
  queue: EventQueue;
  events: LearningEvent[];
  attemptedEventIds: string[];
  attemptedEvents: LearningEvent[];
} {
  const events: LearningEvent[] = [];
  const attemptedEventIds: string[] = [];
  const attemptedEvents: LearningEvent[] = [];
  let remainingRejections = rejectCount;
  const store: EventStore = {
    append: async (event) => {
      attemptedEventIds.push(event.eventId);
      attemptedEvents.push(event);
      if (remainingRejections > 0) {
        remainingRejections -= 1;
        throw new Error("save failed");
      }
      events.push(event);
    },
    pending: async (limit) => events.slice(0, limit),
    ack: async () => undefined,
    all: async () => [...events],
  };
  return {
    queue: new EventQueue(store),
    events,
    attemptedEventIds,
    attemptedEvents,
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

function blockedEventQueue(gate: Promise<void>): EventQueue {
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

function renderLesson(
  state: SessionState,
  queue = eventQueue().queue,
  cuePlayer: { play(cue: Cue): void } = {
    play: () => undefined,
  },
  now: () => number = () => 2_000,
): void {
  act(() =>
    root.render(
      <LessonPage
        state={state}
        queue={queue}
        now={now}
        cuePlayer={cuePlayer}
        corpus={demoCorpus}
      />,
    ),
  );
}

function exactButton(label: string): HTMLButtonElement {
  const buttons = [...container.querySelectorAll("button")];
  const match =
    buttons.find((button) => button.textContent?.trim() === label) ??
    buttons.find((button) => button.getAttribute("aria-label") === label);
  if (!(match instanceof HTMLButtonElement)) {
    throw new Error(`button not found: ${label}`);
  }
  return match;
}

function click(element: HTMLElement): void {
  element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function answerCorrectly(question: GeneratedQuestion): void {
  if (question.questionType === "POEM_FILL") {
    const used = new Set<HTMLButtonElement>();
    (question.blanks ?? []).forEach((blank, position) => {
      const candidate = [
        ...container.querySelectorAll<HTMLButtonElement>(
          'button[aria-label*="，候选"]',
        ),
      ].find(
        (option) =>
          !used.has(option) &&
          !option.disabled &&
          option.textContent?.trim() === blank.answer,
      );
      if (!(candidate instanceof HTMLButtonElement)) {
        throw new Error(`candidate button not found: ${blank.answer}`);
      }
      used.add(candidate);
      act(() => click(candidate));
      const slot = container.querySelector(
        `button[aria-label="空缺${position + 1}"]`,
      );
      if (!(slot instanceof HTMLButtonElement)) {
        throw new Error(`blank button not found: ${position + 1}`);
      }
      act(() => click(slot));
    });
    act(() => click(exactButton("确定")));
    return;
  }
  if (question.questionType === "IDIOM_CHAIN") {
    const used = new Set<HTMLButtonElement>();
    [...question.correctAnswer].forEach((character) => {
      const candidate = [
        ...container.querySelectorAll<HTMLButtonElement>(
          'button[aria-label*="，候选"]',
        ),
      ].find(
        (option) =>
          !used.has(option) &&
          !option.disabled &&
          option.textContent?.trim() === character,
      );
      if (!(candidate instanceof HTMLButtonElement)) {
        throw new Error(`idiom-chain candidate not found: ${character}`);
      }
      used.add(candidate);
      act(() => click(candidate));
    });
    return;
  }
  click(exactButton(question.correctAnswer));
}

// 组装一个确定错误的答案并返回被选中的串，供错误反馈流程复用。
function answerWrongly(question: GeneratedQuestion): string {
  if (question.questionType === "IDIOM_CHAIN") {
    const accepted = new Set(
      question.acceptedAnswers ?? [question.correctAnswer],
    );
    const wrong = [...question.correctAnswer].reverse().join("");
    if (accepted.has(wrong)) {
      throw new Error(`reversed idiom is still accepted: ${wrong}`);
    }
    const used = new Set<HTMLButtonElement>();
    [...wrong].forEach((character) => {
      const candidate = [
        ...container.querySelectorAll<HTMLButtonElement>(
          'button[aria-label*="，候选"]',
        ),
      ].find(
        (option) =>
          !used.has(option) &&
          !option.disabled &&
          option.textContent?.trim() === character,
      );
      if (!(candidate instanceof HTMLButtonElement)) {
        throw new Error(`idiom-chain candidate not found: ${character}`);
      }
      used.add(candidate);
      act(() => click(candidate));
    });
    return wrong;
  }
  const wrongAnswer = question.options.find(
    (option) => option !== question.correctAnswer,
  );
  if (wrongAnswer === undefined) {
    throw new Error("question has no wrong option");
  }
  act(() => click(exactButton(wrongAnswer)));
  return wrongAnswer;
}

describe("LessonPage", () => {
  beforeEach(() => {
    window.location.hash = "#/lesson";
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    sessionState.clearDailyProgress();
    vi.useRealTimers();
  });

  it("resumes index 4 with stage, knowledge, group, and daily progress", () => {
    const saved = activeDaily({
      currentIndex: 4,
      firstAttemptOutcomes: [true, true, false, true],
    });
    const state = createSessionState({
      storage: memoryStorage({ [ACTIVE_DAILY_KEY]: saved }),
    });

    renderLesson(state);

    const step = materializeDailyQuestions(
      saved.session,
      demoCorpus,
      kindForKp,
    )[4]!;
    expect(container.textContent).toContain("热身");
    expect(container.textContent).toContain(`正在学习：${kpTitle(step.kpId)}`);
    expect(container.textContent).toContain("5 / 5");
    expect(container.textContent).toContain("★ 今日 5 / 15");
    expect(
      container.querySelector('[data-question-stage="true"]'),
    ).not.toBeNull();
    expect(container.querySelector('[aria-label="题目提示"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="学习状态"]')).toBeNull();
  });

  it("records the real question context and one stable answer timestamp", async () => {
    const saved = activeDaily();
    const state = createSessionState({
      storage: memoryStorage({ [ACTIVE_DAILY_KEY]: saved }),
    });
    const recorded = eventQueue();
    const step = materializeDailyQuestions(
      saved.session,
      demoCorpus,
      kindForKp,
    )[0]!;
    const now = vi
      .fn(() => 3_000)
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(2_250);
    renderLesson(
      state,
      recorded.queue,
      { play: () => undefined },
      now,
    );

    answerCorrectly(step.question);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(recorded.events).toHaveLength(1);
    expect(() => learningEventSchema.parse(recorded.events[0])).not.toThrow();
    expect(recorded.events[0]).toMatchObject({
      childProfileId: "debug-child",
      deviceId: "debug-web",
      sessionId: saved.session.sessionId,
      eventType: "LESSON_ANSWER",
      clientSequence: 0,
      contentVersion: saved.session.contentVersion,
      ruleVersion: saved.session.ruleVersion,
      occurredAt: 2_250,
      payload: {
        payloadVersion: 1,
        context: "DAILY_LESSON",
        participant: "CHILD",
        knowledgePointId: step.kpId,
        questionType: step.question.questionType,
        questionSeed: step.question.seed,
        questionIndex: 0,
        submittedAnswer: step.question.correctAnswer,
        correctAnswer: step.question.correctAnswer,
        correct: true,
        firstAttempt: true,
        hintCount: 0,
        responseTimeMs: 1_250,
      },
    });
    expect(state.getState().activeDaily?.updatedAt).toBe(2_250);
  });

  it("keeps index 4 after rejection and retries with the same event ID", async () => {
    vi.useFakeTimers();
    const saved = activeDaily({
      currentIndex: 4,
      firstAttemptOutcomes: [true, true, false, true],
    });
    const state = createSessionState({
      storage: memoryStorage({ [ACTIVE_DAILY_KEY]: saved }),
    });
    const attempted = eventQueue(1);
    const question = materializeDailyQuestions(
      saved.session,
      demoCorpus,
      kindForKp,
    )[4]!.question;
    renderLesson(state, attempted.queue);

    answerCorrectly(question);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(CORRECT_FEEDBACK_MS);
    });

    expect(state.getState().activeDaily).toEqual(saved);
    const back = container.querySelector(
      'button[aria-label="返回学习路线"]',
    ) as HTMLButtonElement;
    expect(back.disabled).toBe(false);

    answerCorrectly(question);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(attempted.attemptedEventIds).toHaveLength(2);
    expect(attempted.attemptedEventIds[1]).toBe(
      attempted.attemptedEventIds[0],
    );
    expect(attempted.events).toHaveLength(1);
    expect(state.getState().activeDaily).toMatchObject({
      currentIndex: 5,
      firstAttemptOutcomes: [true, true, false, true, true],
      pendingStageCompletion: "热身",
      updatedAt: 2_000,
    });
  });

  it("remounts final POEM_FILL after a correct persistence rejection", async () => {
    vi.useFakeTimers();
    const saved = activeDaily({
      currentIndex: 14,
      firstAttemptOutcomes: Array.from({ length: 14 }, () => true),
    });
    const state = createSessionState({
      storage: memoryStorage({ [ACTIVE_DAILY_KEY]: saved }),
    });
    const attempted = eventQueue(1);
    const question = materializeDailyQuestions(
      saved.session,
      demoCorpus,
      kindForKp,
    )[14]!.question;
    expect(question.questionType).toBe("POEM_FILL");
    let currentTime = 1_000;
    renderLesson(
      state,
      attempted.queue,
      { play: () => undefined },
      () => currentTime,
    );

    currentTime = 2_250;
    answerCorrectly(question);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CORRECT_FEEDBACK_MS);
    });

    expect(state.getState().activeDaily).toEqual(saved);
    expect(
      [...container.querySelectorAll<HTMLButtonElement>(
        'button[aria-label*="，候选"]',
      )].some((candidate) => !candidate.disabled),
    ).toBe(true);

    currentTime = 9_000;
    answerCorrectly(question);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CORRECT_FEEDBACK_MS);
    });

    expect(attempted.attemptedEvents).toHaveLength(2);
    expect(attempted.attemptedEvents[0]).toMatchObject({
      occurredAt: 2_250,
      payload: {
        submittedAnswer: question.correctAnswer,
        correctAnswer: question.correctAnswer,
        correct: true,
        responseTimeMs: 1_250,
      },
    });
    expect(attempted.attemptedEvents[1]).toEqual(
      attempted.attemptedEvents[0],
    );
    expect(attempted.events).toHaveLength(1);
    expect(state.getState().activeDaily).toMatchObject({
      currentIndex: 15,
      firstAttemptOutcomes: Array.from({ length: 15 }, () => true),
      pendingStageCompletion: "巩固挑战",
      updatedAt: 2_250,
    });
  });

  it("restores a stage reward after remount and clears only its pending flag", () => {
    const saved = activeDaily({
      currentIndex: 5,
      firstAttemptOutcomes: [true, true, false, true, true],
      pendingStageCompletion: "热身",
      updatedAt: 2_000,
    });
    const state = createSessionState({
      storage: memoryStorage({ [ACTIVE_DAILY_KEY]: saved }),
    });
    renderLesson(state);

    expect(container.querySelector('[role="dialog"]')?.textContent).toContain(
      "热身",
    );
    expect(container.textContent).toContain("阶段完成");

    act(() => root.unmount());
    root = createRoot(container);
    renderLesson(state);

    expect(container.querySelector('[role="dialog"]')?.textContent).toContain(
      "热身",
    );
    act(() => click(exactButton("回到任务路线")));

    const { pendingStageCompletion: _pending, ...withoutPending } = saved;
    expect(state.getState().activeDaily).toEqual(withoutPending);
    expect(window.location.hash).toBe("#/home");
  });

  it("records the fifteenth outcome and keeps index 15 for summary", async () => {
    const priorOutcomes = [
      true,
      false,
      true,
      true,
      true,
      false,
      true,
      true,
      true,
      true,
      true,
      false,
      true,
      true,
    ];
    const saved = activeDaily({
      currentIndex: 14,
      firstAttemptOutcomes: priorOutcomes,
    });
    const state = createSessionState({
      storage: memoryStorage({ [ACTIVE_DAILY_KEY]: saved }),
    });
    const attempted = eventQueue();
    const question = materializeDailyQuestions(
      saved.session,
      demoCorpus,
      kindForKp,
    )[14]!.question;
    renderLesson(state, attempted.queue);

    answerCorrectly(question);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const outcomes = [...priorOutcomes, true];
    expect(state.getState().activeDaily).toMatchObject({
      currentIndex: 15,
      firstAttemptOutcomes: outcomes,
      pendingStageCompletion: "巩固挑战",
    });
    expect(state.getState().lastSession).toEqual({
      sessionId: "daily-session",
      firstAttemptOutcomes: outcomes,
      answeredCount: 15,
    });
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain(
      "巩固挑战",
    );
  });

  it.each([
    ["missing active session", null],
    [
      "index 15 without a pending reward",
      activeDaily({
        currentIndex: 15,
        firstAttemptOutcomes: Array.from({ length: 15 }, () => true),
      }),
    ],
    [
      "index above 15",
      activeDaily({
        currentIndex: 16,
        firstAttemptOutcomes: Array.from({ length: 15 }, () => true),
      }),
    ],
  ] as const)("redirects home for %s", (_case, saved) => {
    const state = createSessionState({
      storage: memoryStorage(
        saved === null ? {} : { [ACTIVE_DAILY_KEY]: saved },
      ),
    });

    renderLesson(state);

    expect(window.location.hash).toBe("#/home");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("locks return navigation while the answer event is being saved", async () => {
    vi.useFakeTimers();
    const saved = activeDaily();
    const state = createSessionState({
      storage: memoryStorage({ [ACTIVE_DAILY_KEY]: saved }),
    });
    const gate = deferred();
    const question = materializeDailyQuestions(
      saved.session,
      demoCorpus,
      kindForKp,
    )[0]!.question;
    const cues: Cue[] = [];
    renderLesson(state, blockedEventQueue(gate.promise), {
      play: (cue) => cues.push(cue),
    });

    answerCorrectly(question);
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(CORRECT_FEEDBACK_MS);
    });
    expect(cues).toHaveLength(1);
    expect(cues[0]?.sound).toBe("correct");
    expect(state.getState().activeDaily?.currentIndex).toBe(0);
    const back = container.querySelector(
      'button[aria-label="返回学习路线"]',
    ) as HTMLButtonElement;
    expect(back.disabled).toBe(true);
    act(() => click(back));
    expect(window.location.hash).toBe("#/lesson");

    gate.resolve();
    await act(async () => {
      await gate.promise;
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(state.getState().activeDaily?.currentIndex).toBe(1);
    expect(back.disabled).toBe(false);
  });

  it("uses QuestionFlow confirmation before persisting a wrong answer", async () => {
    const saved = activeDaily();
    const state = createSessionState({
      storage: memoryStorage({ [ACTIVE_DAILY_KEY]: saved }),
    });
    const attempted = eventQueue();
    const question = materializeDailyQuestions(
      saved.session,
      demoCorpus,
      kindForKp,
    )[0]!.question;
    const cues: Cue[] = [];
    renderLesson(state, attempted.queue, {
      play: (cue) => cues.push(cue),
    });

    const wrongAnswer = answerWrongly(question);

    expect(container.querySelector('[role="dialog"]')?.textContent).toContain(
      `你选的是：${wrongAnswer}`,
    );
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({
      sound: "encourage",
      haptic: "none",
    });
    expect(attempted.events).toHaveLength(0);
    expect(state.getState().activeDaily).toEqual(saved);

    await act(async () => {
      click(exactButton("我记住啦"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(attempted.events).toHaveLength(1);
    expect(attempted.events[0]?.payload).toMatchObject({
      submittedAnswer: wrongAnswer,
      correct: false,
    });
    expect(state.getState().activeDaily).toMatchObject({
      currentIndex: 1,
      firstAttemptOutcomes: [false],
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("keeps first-submission timing through wrong feedback and enqueue retry", async () => {
    const saved = activeDaily();
    const state = createSessionState({
      storage: memoryStorage({ [ACTIVE_DAILY_KEY]: saved }),
    });
    const attempted = eventQueue(1);
    const question = materializeDailyQuestions(
      saved.session,
      demoCorpus,
      kindForKp,
    )[0]!.question;
    let currentTime = 1_000;
    renderLesson(
      state,
      attempted.queue,
      { play: () => undefined },
      () => currentTime,
    );

    currentTime = 2_250;
    answerWrongly(question);
    currentTime = 6_000;
    await act(async () => {
      click(exactButton("我记住啦"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(attempted.attemptedEvents).toHaveLength(1);
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    currentTime = 9_000;
    await act(async () => {
      click(exactButton("我记住啦"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(attempted.attemptedEvents).toHaveLength(2);
    expect(attempted.attemptedEvents[0]).toMatchObject({
      occurredAt: 2_250,
      payload: { responseTimeMs: 1_250 },
    });
    expect(attempted.attemptedEvents[1]).toEqual(
      attempted.attemptedEvents[0],
    );
  });

  it("renders the lesson page from the App lesson route", async () => {
    sessionState.setActiveDaily(activeDaily());
    window.location.hash = "#/lesson";

    await act(async () => root.render(<App />));

    expect(window.location.hash).toBe("#/lesson");
    expect(container.textContent).toContain("★ 今日 1 / 15");
    expect(container.querySelector('[aria-label="返回学习路线"]')).not.toBeNull();
  });
});
