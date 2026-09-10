// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EventQueue,
  type EventStore,
  type LearningEvent,
} from "@cc/application";
import { learningEventSchema } from "@cc/content-schema";
import {
  createPoemPracticeRound,
  type GeneratedQuestion,
} from "@cc/domain";
import { CORRECT_FEEDBACK_MS } from "@cc/ui";
import { App } from "../src/App";
import { demoCorpus } from "../src/mock/corpus";
import { PoemPracticePage } from "../src/pages/PoemPracticePage";
import { sessionState } from "../src/session-state";

let container: HTMLDivElement;
let root: Root;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

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

function candidateButtons(): HTMLButtonElement[] {
  return [
    ...container.querySelectorAll<HTMLButtonElement>(
      'button[aria-label*="，候选"]',
    ),
  ];
}

function blankButtons(): HTMLButtonElement[] {
  return [
    ...container.querySelectorAll<HTMLButtonElement>(
      'button[aria-label^="空缺"]',
    ),
  ];
}

function click(element: HTMLElement): void {
  act(() =>
    element.dispatchEvent(new MouseEvent("click", { bubbles: true })),
  );
}

function submitAnswers(
  question: GeneratedQuestion,
  answers: readonly string[],
): void {
  const usedCandidates = new Set<HTMLButtonElement>();
  const blanks = question.blanks ?? [];
  answers.forEach((answer, position) => {
    const candidate = candidateButtons().find(
      (item) =>
        !usedCandidates.has(item) &&
        !item.disabled &&
        item.textContent?.trim() === answer,
    );
    if (candidate === undefined) {
      throw new Error(`candidate not found for ${answer}`);
    }
    usedCandidates.add(candidate);
    click(candidate);
    click(blankButtons()[position]!);
  });
  if (answers.length !== blanks.length) {
    throw new Error("answer count does not match poem blanks");
  }
  click(button("确定"));
}

async function solve(question: GeneratedQuestion): Promise<void> {
  submitAnswers(
    question,
    (question.blanks ?? []).map((blank) => blank.answer),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(CORRECT_FEEDBACK_MS);
  });
}

function questions(round = 0): GeneratedQuestion[] {
  return createPoemPracticeRound(demoCorpus, `playground:${round}`);
}

function recordingQueue(rejectCount = 0): {
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
    },
    pending: async (limit) => events.slice(0, limit),
    ack: async () => undefined,
    all: async () => [...events],
  };
  return { queue: new EventQueue(store), events, attemptedEvents };
}

describe("PoemPracticePage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.location.hash = "#/poem-practice";
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("is available from the route with the first question", async () => {
    await act(async () => root.render(<App />));

    expect(container.textContent).toContain("诗词世界");
    expect(container.textContent).toContain("1 / 10");
    expect(button("撤销")).toBeTruthy();
    expect(
      container.querySelector('[data-question-stage="true"]'),
    ).not.toBeNull();
    expect(container.querySelector('[aria-label="题目提示"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="学习状态"]')).toBeNull();
  });

  it("advances locally without changing SessionState", async () => {
    const before = structuredClone(sessionState.getState());
    act(() => root.render(<PoemPracticePage corpus={demoCorpus} />));

    await solve(questions()[0]!);

    expect(container.textContent).toContain("2 / 10");
    expect(container.textContent).toContain("本轮正确 1 题");
    expect(sessionState.getState()).toEqual(before);
  });

  it("records one schema-valid practice answer with real question facts", async () => {
    const recorded = recordingQueue();
    const question = questions()[0]!;
    const now = vi
      .fn(() => 3_000)
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(2_250);
    act(() =>
      root.render(
        <PoemPracticePage
          corpus={demoCorpus}
          queue={recorded.queue}
          now={now}
          idGen={{ ulid: () => "poem-practice-session" }}
        />,
      ),
    );

    await solve(question);

    expect(recorded.events).toHaveLength(1);
    expect(() => learningEventSchema.parse(recorded.events[0])).not.toThrow();
    expect(recorded.events[0]).toMatchObject({
      childProfileId: "debug-child",
      deviceId: "playground-browser",
      sessionId: "poem-practice-session",
      eventType: "PRACTICE_ANSWER",
      clientSequence: 0,
      contentVersion: "corpus-v5",
      ruleVersion: "mastery-v1",
      occurredAt: 2_250,
      payload: {
        payloadVersion: 1,
        context: "FREE_PRACTICE",
        participant: "CHILD",
        knowledgePointId: question.knowledgePointId,
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
  });

  it("keeps first-submission facts and the question retryable after rejection", async () => {
    const recorded = recordingQueue(1);
    const question = questions()[0]!;
    const correctAnswers = (question.blanks ?? []).map(
      (blank) => blank.answer,
    );
    if (correctAnswers.length < 2) {
      throw new Error("question needs at least two blanks");
    }
    const wrongAnswers = [...correctAnswers];
    [wrongAnswers[0], wrongAnswers[1]] = [
      wrongAnswers[1]!,
      wrongAnswers[0]!,
    ];
    let currentTime = 1_000;
    act(() =>
      root.render(
        <PoemPracticePage
          corpus={demoCorpus}
          queue={recorded.queue}
          now={() => currentTime}
          idGen={{ ulid: () => "poem-practice-session" }}
        />,
      ),
    );

    currentTime = 2_250;
    submitAnswers(question, wrongAnswers);
    currentTime = 6_000;
    await act(async () => {
      click(button("我记住啦"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain("1 / 10");
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    currentTime = 9_000;
    await act(async () => {
      click(button("我记住啦"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(recorded.attemptedEvents).toHaveLength(2);
    expect(recorded.attemptedEvents[0]).toMatchObject({
      occurredAt: 2_250,
      payload: {
        correct: false,
        responseTimeMs: 1_250,
      },
    });
    expect(recorded.attemptedEvents[1]).toEqual(
      recorded.attemptedEvents[0],
    );
    expect(recorded.events).toHaveLength(1);
    expect(container.textContent).toContain("2 / 10");
  });

  it("remounts poem input after a correct answer fails to persist", async () => {
    const recorded = recordingQueue(1);
    const question = questions()[0]!;
    let currentTime = 1_000;
    act(() =>
      root.render(
        <PoemPracticePage
          corpus={demoCorpus}
          queue={recorded.queue}
          now={() => currentTime}
          idGen={{ ulid: () => "poem-practice-session" }}
        />,
      ),
    );

    currentTime = 2_250;
    await solve(question);
    expect(container.textContent).toContain("1 / 10");

    currentTime = 9_000;
    await solve(question);

    expect(recorded.attemptedEvents).toHaveLength(2);
    expect(recorded.attemptedEvents[1]).toEqual(
      recorded.attemptedEvents[0],
    );
    expect(recorded.events).toHaveLength(1);
    expect(container.textContent).toContain("2 / 10");
  });

  it("shows a returnable error when there is no poem content", () => {
    act(() =>
      root.render(
        <PoemPracticePage corpus={{ ...demoCorpus, poems: [] }} />,
      ),
    );

    expect(container.textContent).toContain("诗词内容暂时不可用");
    click(button("返回首页"));
    expect(window.location.hash).toBe("#/home");
  });

  it("settles ten questions, starts another round, and returns home", async () => {
    const recorded = recordingQueue();
    act(() =>
      root.render(
        <PoemPracticePage
          corpus={demoCorpus}
          queue={recorded.queue}
          idGen={{ ulid: () => "poem-practice-session" }}
        />,
      ),
    );
    for (const question of questions()) {
      await solve(question);
    }

    expect(container.textContent).toContain("本轮完成");
    expect(container.textContent).toContain("答对 10 / 10 题");
    expect(recorded.events).toHaveLength(10);
    expect(recorded.events.map((event) => event.clientSequence)).toEqual(
      Array.from({ length: 10 }, (_, index) => index),
    );

    click(button("返回首页"));
    expect(window.location.hash).toBe("#/home");

    click(button("再来一轮"));
    expect(container.textContent).toContain("1 / 10");
    expect(container.textContent).toContain("本轮正确 0 题");

    await solve(questions(1)[0]!);
    expect(recorded.events).toHaveLength(11);
    expect(recorded.events[10]).toMatchObject({
      sessionId: "poem-practice-session",
      clientSequence: 10,
      payload: { questionIndex: 10 },
    });
  });
});
