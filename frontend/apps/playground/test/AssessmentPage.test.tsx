// @vitest-environment happy-dom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACTIVE_ASSESSMENT_KEY,
  ASSESSMENT_COMPLETED_KEY,
  EventQueue,
  assessmentKnowledgePointIds,
  materializeAssessmentQuestions,
  type ActiveAssessmentSession,
  type EventStore,
  type LearningEvent,
  type SnapshotStorage,
} from "@cc/application";
import {
  initAssessment,
  type Corpus,
  type GeneratedQuestion,
} from "@cc/domain";
import { AssessmentPage } from "../src/pages/AssessmentPage";
import {
  demoCorpus,
  kindForKp,
} from "../src/mock/learning-content";
import { learningEventSchema } from "@cc/content-schema";
import { CORRECT_FEEDBACK_MS } from "@cc/ui";
import {
  CONTENT_VERSION,
  createSessionState,
  type SessionState,
} from "../src/session-state";

interface MemoryStorage extends SnapshotStorage {
  writes: string[];
}

let container: HTMLDivElement;
let root: Root;

// 诗词专用语料：去掉成语，并把 sc-chunxiao 提升到 level 1，
// 使 abilityLevel 1 的探索首题稳定命中 POEM_FILL（该 seed 下 index 0 为填空）。
const assessmentPoemCorpus: Corpus = {
  ...demoCorpus,
  poems: demoCorpus.poems.map((poem) =>
    poem.id === "sc-chunxiao" ? { ...poem, level: 1 } : poem,
  ),
  idioms: [],
  characters: [],
};

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function memoryStorage(
  initial: Record<string, unknown> = {},
  ignoreCompletion = false,
  log: string[] = [],
): MemoryStorage {
  const values = new Map(Object.entries(initial));
  const writes: string[] = [];
  return {
    writes,
    read: <T,>(key: string) => (values.get(key) as T | undefined) ?? null,
    write: <T,>(key: string, value: T) => {
      if (ignoreCompletion && key === ASSESSMENT_COMPLETED_KEY) return;
      values.set(key, value);
      writes.push(key);
      log.push(`snapshot:${key}`);
    },
    remove: (key) => values.delete(key),
  };
}

function assessment(
  overrides: Partial<ActiveAssessmentSession> = {},
): ActiveAssessmentSession {
  return {
    state: initAssessment(0),
    round: 0,
    questionIndex: 0,
    correctCount: 0,
    startedAt: 1_000,
    contentVersion: CONTENT_VERSION,
    contentSelection: {
      childProfileId: "debug-child",
      authentication: "GUEST",
      version: CONTENT_VERSION,
      abilityLevel: 5,
    },
    updatedAt: 1_000,
    ...overrides,
  };
}

function eventQueue(log: string[] = [], rejectCount = 0): {
  queue: EventQueue;
  events: LearningEvent[];
  attemptedEvents: LearningEvent[];
} {
  const events: LearningEvent[] = [];
  const attemptedEvents: LearningEvent[] = [];
  let remainingRejections = rejectCount;
  const store: EventStore = {
    append: async (event) => {
      attemptedEvents.push(event);
      if (remainingRejections > 0) {
        remainingRejections -= 1;
        throw new Error("save failed");
      }
      events.push(event);
      log.push("event");
    },
    pending: async (limit) => events.slice(0, limit),
    ack: async () => undefined,
    all: async () => [...events],
  };
  return { queue: new EventQueue(store), events, attemptedEvents };
}

function renderAssessment(
  state: SessionState,
  queue: EventQueue,
  strict = false,
  now: () => number = () => 2_000,
  corpus: Corpus = demoCorpus,
  abilityLevel = 5,
): void {
  const page = (
    <AssessmentPage
      state={state}
      queue={queue}
      now={now}
      cuePlayer={{ play: () => undefined }}
      corpus={corpus}
      abilityLevel={abilityLevel}
    />
  );
  act(() => root.render(strict ? <StrictMode>{page}</StrictMode> : page));
}

function questionFor(
  snapshot: ActiveAssessmentSession,
  corpus: Corpus = demoCorpus,
  abilityLevel = 5,
) {
  const kpId = assessmentKnowledgePointIds(corpus, abilityLevel)[
    snapshot.state.currentLevelIndex
  ]!;
  return materializeAssessmentQuestions(
    kpId,
    snapshot.round,
    corpus,
    (id) => {
      if (corpus.poems.some(({ id: poemId }) => poemId === id)) {
        return { kind: "POEM" as const };
      }
      return kindForKp(id);
    },
  )[snapshot.questionIndex]!;
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

function click(element: HTMLElement): void {
  element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

// 逐字点选成语接龙候选，组装出正确答案。每次点选单独 act，
// 让 IdiomChain 内部的 picked 状态在下一次点选前刷新。
function selectIdiomChain(question: GeneratedQuestion): void {
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
}

async function answerCorrectly(snapshot: ActiveAssessmentSession): Promise<void> {
  const question = questionFor(snapshot);

  if (question.questionType === "POEM_FILL") {
    await answerCompoundCorrectly(question);
    return;
  }

  if (question.questionType === "IDIOM_CHAIN") {
    selectIdiomChain(question);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    return;
  }

  await act(async () => {
    click(exactButton(question.correctAnswer));
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function answerCompoundCorrectly(
  question: GeneratedQuestion,
): Promise<void> {
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
    if (candidate === undefined) {
      throw new Error(`candidate button not found: ${blank.answer}`);
    }
    used.add(candidate);
    act(() => click(candidate));
    act(() =>
      click(
        container.querySelector(
          `button[aria-label="空缺${position + 1}"]`,
        ) as HTMLButtonElement,
      ),
    );
  });
  act(() => click(exactButton("确定")));
}

describe("AssessmentPage", () => {
  beforeEach(() => {
    window.location.hash = "#/assessment";
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("creates and persists one assessment session under StrictMode", () => {
    const storage = memoryStorage();
    const state = createSessionState({ storage });
    const { queue } = eventQueue();

    renderAssessment(state, queue, true);

    expect(
      storage.writes.filter((key) => key === ACTIVE_ASSESSMENT_KEY),
    ).toHaveLength(1);
    expect(state.getState().activeAssessment).toMatchObject({
      round: 0,
      questionIndex: 0,
      correctCount: 0,
      contentVersion: CONTENT_VERSION,
    });
    expect(container.textContent).toContain("1 / 5");
    expect(container.textContent).not.toContain("/ 15");
    expect(
      container.querySelector('[data-question-stage="true"]'),
    ).not.toBeNull();
    expect(container.querySelector('[aria-label="题目提示"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="学习状态"]')).toBeNull();
  });

  it("resumes at 3/5 and returns without clearing progress", () => {
    const saved = assessment({ questionIndex: 2, correctCount: 1 });
    const storage = memoryStorage({ [ACTIVE_ASSESSMENT_KEY]: saved });
    const state = createSessionState({ storage });
    const { queue } = eventQueue();
    renderAssessment(state, queue);

    expect(container.textContent).toContain("3 / 5");
    expect(container.textContent).not.toContain("3 / 15");
    act(() =>
      click(
        container.querySelector(
          'button[aria-label="返回学习路线"]',
        ) as HTMLButtonElement,
      ),
    );

    expect(window.location.hash).toBe("#/home");
    expect(state.getState().activeAssessment).toEqual(saved);
  });

  it("writes the learning event before advancing and persisting", async () => {
    const order: string[] = [];
    const saved = assessment();
    const storage = memoryStorage(
      { [ACTIVE_ASSESSMENT_KEY]: saved },
      false,
      order,
    );
    const state = createSessionState({ storage });
    const { queue, events } = eventQueue(order);
    const question = questionFor(saved);
    const knowledgePointId = assessmentKnowledgePointIds(demoCorpus, 5)[0]!;
    const now = (() => {
      const clock = [1_000, 2_250];
      return () => clock.shift() ?? 3_000;
    })();
    renderAssessment(state, queue, false, now);

    await answerCorrectly(saved);

    expect(events).toHaveLength(1);
    expect(() => learningEventSchema.parse(events[0])).not.toThrow();
    expect(events[0]).toMatchObject({
      childProfileId: "debug-child",
      deviceId: "playground-browser",
      sessionId: "assessment:1000",
      eventType: "ASSESSMENT_ANSWER",
      clientSequence: 0,
      contentVersion: CONTENT_VERSION,
      ruleVersion: "mastery-v1",
      occurredAt: 2_250,
      payload: {
        payloadVersion: 1,
        context: "ASSESSMENT",
        participant: "CHILD",
        knowledgePointId,
        questionType: question.questionType,
        questionSeed: question.seed,
        questionIndex: 0,
        submittedAnswer: question.correctAnswer,
        correctAnswer: question.correctAnswer,
        correct: true,
        firstAttempt: true,
        hintCount: 0,
        responseTimeMs: 1_250,
      },
    });
    expect(order).toEqual(["event", `snapshot:${ACTIVE_ASSESSMENT_KEY}`]);
    expect(state.getState().activeAssessment).toMatchObject({
      questionIndex: 1,
      correctCount: 1,
      updatedAt: 2_250,
    });
    expect(container.textContent).toContain("2 / 5");
  });

  it("starts the next response time after prior correct feedback unlocks", async () => {
    vi.useFakeTimers();
    const saved = assessment();
    const state = createSessionState({
      storage: memoryStorage({ [ACTIVE_ASSESSMENT_KEY]: saved }),
    });
    const { queue, events } = eventQueue();
    let currentTime = 1_000;
    renderAssessment(state, queue, false, () => currentTime);

    currentTime = 1_250;
    await answerCorrectly(saved);
    const next = state.getState().activeAssessment;
    if (next === null) {
      throw new Error("assessment unexpectedly completed");
    }

    currentTime = 1_850;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    currentTime = 2_250;
    await answerCorrectly(next);

    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      occurredAt: 2_250,
      payload: { responseTimeMs: 400 },
    });
  });

  it("keeps first-submission timing through wrong feedback and enqueue retry", async () => {
    const saved = assessment();
    const state = createSessionState({
      storage: memoryStorage({ [ACTIVE_ASSESSMENT_KEY]: saved }),
    });
    const attempted = eventQueue([], 1);
    const question = questionFor(saved);
    const wrongAnswer = question.options.find(
      (option) => option !== question.correctAnswer,
    );
    if (wrongAnswer === undefined) {
      throw new Error("question has no wrong option");
    }
    let currentTime = 1_000;
    renderAssessment(state, attempted.queue, false, () => currentTime);

    currentTime = 2_250;
    act(() => click(exactButton(wrongAnswer)));
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

  it("remounts POEM_FILL after a correct persistence rejection", async () => {
    vi.useFakeTimers();
    const saved = assessment();
    const state = createSessionState({
      storage: memoryStorage({ [ACTIVE_ASSESSMENT_KEY]: saved }),
    });
    const attempted = eventQueue([], 1);
    const question = questionFor(saved, assessmentPoemCorpus, 1);
    expect(question.questionType).toBe("POEM_FILL");
    let currentTime = 1_000;
    renderAssessment(
      state,
      attempted.queue,
      false,
      () => currentTime,
      assessmentPoemCorpus,
      1,
    );

    currentTime = 2_250;
    await answerCompoundCorrectly(question);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CORRECT_FEEDBACK_MS);
    });

    expect(state.getState().activeAssessment).toEqual(saved);
    expect(
      [...container.querySelectorAll<HTMLButtonElement>(
        'button[aria-label*="，候选"]',
      )].some((candidate) => !candidate.disabled),
    ).toBe(true);

    currentTime = 9_000;
    await answerCompoundCorrectly(question);
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
    expect(state.getState().activeAssessment).toMatchObject({
      questionIndex: 1,
      correctCount: 1,
      updatedAt: 2_250,
    });
  });

  it("switches a 3/5 checkpoint to the two-question extra block", async () => {
    const saved = assessment({ questionIndex: 4, correctCount: 2 });
    const state = createSessionState({
      storage: memoryStorage({ [ACTIVE_ASSESSMENT_KEY]: saved }),
    });
    const { queue } = eventQueue();
    renderAssessment(state, queue);

    await answerCorrectly(saved);

    expect(state.getState().activeAssessment).toMatchObject({
      questionIndex: 5,
      correctCount: 3,
      extraCorrectCount: 0,
    });
    expect(container.textContent).toContain("1 / 2");
    expect(container.textContent).not.toContain("6 / 5");
  });

  it("marks a finished assessment before returning home", () => {
    const finished = assessment({
      state: {
        ...initAssessment(0),
        finished: true,
        resultLevelIndex: 0,
      },
    });
    const state = createSessionState({
      storage: memoryStorage({ [ACTIVE_ASSESSMENT_KEY]: finished }),
    });
    const { queue } = eventQueue();

    renderAssessment(state, queue);

    expect(state.getState()).toMatchObject({
      activeAssessment: null,
      assessmentCompleted: true,
    });
    expect(window.location.hash).toBe("#/home");
  });

  it("keeps a finished snapshot when the completion marker cannot persist", () => {
    const finished = assessment({
      state: {
        ...initAssessment(0),
        finished: true,
        resultLevelIndex: 0,
      },
    });
    const state = createSessionState({
      storage: memoryStorage(
        { [ACTIVE_ASSESSMENT_KEY]: finished },
        true,
      ),
    });
    const { queue } = eventQueue();

    renderAssessment(state, queue);

    expect(state.getState()).toMatchObject({
      activeAssessment: finished,
      assessmentCompleted: false,
    });
    expect(window.location.hash).toBe("#/assessment");
  });

  it("redirects completed learners home without creating a new session", () => {
    const storage = memoryStorage({ [ASSESSMENT_COMPLETED_KEY]: true });
    const state = createSessionState({ storage });
    const { queue } = eventQueue();

    renderAssessment(state, queue, true);

    expect(window.location.hash).toBe("#/home");
    expect(state.getState().activeAssessment).toBeNull();
    expect(storage.writes).not.toContain(ACTIVE_ASSESSMENT_KEY);
  });
});
