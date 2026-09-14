// @vitest-environment happy-dom
import Taro from "@tarojs/taro";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  describeKnowledgePoint,
  EventQueue,
  materializeDailyQuestions,
  type EventStore,
  type LearningEvent,
} from "@cc/application";
import { challengeContent } from "@cc/content";
import { learningEventSchema } from "@cc/content-schema";
import type { GeneratedQuestion } from "@cc/domain";
import { CORRECT_FEEDBACK_MS } from "@cc/ui";
import LessonPage from "../src/pages/lesson";
import { makeDaily, makeState } from "./page-fixtures";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function eventQueue(rejectCount = 0): {
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

function exactButton(label: string): HTMLElement {
  const button = screen
    .getAllByRole("button")
    .find(
      (candidate) =>
        candidate.textContent?.trim() === label ||
        candidate.getAttribute("aria-label") === label,
    );
  if (button === undefined) {
    throw new Error(`button not found: ${label}`);
  }
  return button;
}

function answerCorrectly(question: GeneratedQuestion): void {
  if (question.questionType === "POEM_FILL") {
    const used = new Set<HTMLElement>();
    (question.blanks ?? []).forEach((blank, position) => {
      const candidate = screen
        .getAllByRole("button", { name: /，候选/ })
        .find(
          (option) =>
            !used.has(option) &&
            !option.hasAttribute("disabled") &&
            option.textContent?.trim() === blank.answer,
        );
      if (candidate === undefined) {
        throw new Error(`candidate not found: ${blank.answer}`);
      }
      used.add(candidate);
      fireEvent.click(candidate);
      fireEvent.click(screen.getByRole("button", { name: `空缺${position + 1}` }));
    });
    fireEvent.click(screen.getByRole("button", { name: "确定" }));
    return;
  }
  fireEvent.click(exactButton(question.correctAnswer));
}

describe("miniapp LessonPage", () => {
  it("renders persisted stage completion and returns home", () => {
    const redirectTo = vi.spyOn(Taro, "redirectTo");
    const state = makeState({
      daily: makeDaily(5, "热身"),
    });
    render(<LessonPage state={state} />);

    expect(screen.getByRole("dialog").textContent).toContain(
      "热身 · 阶段完成",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "回到任务路线" }),
    );

    expect(state.getState().activeDaily?.pendingStageCompletion).toBe(
      undefined,
    );
    expect(redirectTo).toHaveBeenCalledWith({
      url: "/pages/home/index",
    });
  });

  it("shows group and daily progress for an active question", () => {
    render(
      <LessonPage state={makeState({ daily: makeDaily(6) })} />,
    );

    expect(screen.getByText("2 / 5")).toBeTruthy();
    expect(screen.getByText(/★ 今日 7 \/ 15/)).toBeTruthy();
    expect(screen.getByLabelText("答题区")).toBeTruthy();
    expect(screen.getByLabelText("题目提示")).toBeTruthy();
  });

  it("records the real question context and one stable answer timestamp", async () => {
    const daily = makeDaily();
    const state = makeState({ daily });
    const recorded = eventQueue();
    const step = materializeDailyQuestions(
      daily.session,
      challengeContent.corpus,
      (kpId) => describeKnowledgePoint(challengeContent.corpus, kpId),
    )[0]!;
    const now = vi
      .fn(() => 3_000)
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(2_250);
    render(
      <LessonPage state={state} queue={recorded.queue} now={now} />,
    );

    answerCorrectly(step.question);

    await waitFor(() => expect(recorded.events).toHaveLength(1));
    expect(() => learningEventSchema.parse(recorded.events[0])).not.toThrow();
    expect(recorded.events[0]).toMatchObject({
      childProfileId: "miniapp-child",
      deviceId: "miniapp-device",
      sessionId: daily.session.sessionId,
      eventType: "LESSON_ANSWER",
      clientSequence: 0,
      contentVersion: daily.session.contentVersion,
      ruleVersion: daily.session.ruleVersion,
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

  it("keeps first-submission timing through wrong feedback and enqueue retry", async () => {
    const daily = makeDaily();
    const state = makeState({ daily });
    const attempted = eventQueue(1);
    const question = materializeDailyQuestions(
      daily.session,
      challengeContent.corpus,
      (kpId) => describeKnowledgePoint(challengeContent.corpus, kpId),
    )[0]!.question;
    const wrongAnswer = question.options.find(
      (option) => option !== question.correctAnswer,
    );
    if (wrongAnswer === undefined) {
      throw new Error("question has no wrong option");
    }
    let currentTime = 1_000;
    render(
      <LessonPage
        state={state}
        queue={attempted.queue}
        now={() => currentTime}
      />,
    );

    currentTime = 2_250;
    fireEvent.click(exactButton(wrongAnswer));
    currentTime = 6_000;
    fireEvent.click(exactButton("我记住啦"));

    await waitFor(() => {
      expect(attempted.attemptedEvents).toHaveLength(1);
      expect(screen.getByRole("button", { name: "我记住啦" })).toBeTruthy();
    });

    currentTime = 9_000;
    fireEvent.click(exactButton("我记住啦"));

    await waitFor(() =>
      expect(attempted.attemptedEvents).toHaveLength(2),
    );
    expect(attempted.attemptedEvents[0]).toMatchObject({
      occurredAt: 2_250,
      payload: { responseTimeMs: 1_250 },
    });
    expect(attempted.attemptedEvents[1]).toEqual(
      attempted.attemptedEvents[0],
    );
  });

  it("remounts final POEM_FILL after a correct persistence rejection", async () => {
    vi.useFakeTimers();
    const daily = makeDaily(14);
    const state = makeState({ daily });
    const attempted = eventQueue(1);
    const question = materializeDailyQuestions(
      daily.session,
      challengeContent.corpus,
      (kpId) => describeKnowledgePoint(challengeContent.corpus, kpId),
    )[14]!.question;
    expect(question.questionType).toBe("POEM_FILL");
    let currentTime = 1_000;
    render(
      <LessonPage
        state={state}
        queue={attempted.queue}
        now={() => currentTime}
      />,
    );

    currentTime = 2_250;
    answerCorrectly(question);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CORRECT_FEEDBACK_MS);
    });

    expect(state.getState().activeDaily).toEqual(daily);
    expect(
      screen
        .getAllByRole("button", { name: /，候选/ })
        .some((candidate) => !candidate.hasAttribute("disabled")),
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
});
