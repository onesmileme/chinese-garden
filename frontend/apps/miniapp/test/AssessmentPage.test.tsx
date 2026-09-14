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
  assessmentKnowledgePointIds,
  describeKnowledgePoint,
  EventQueue,
  materializeAssessmentQuestions,
  type EventStore,
  type LearningEvent,
} from "@cc/application";
import { challengeContent } from "@cc/content";
import { learningEventSchema } from "@cc/content-schema";
import {
  initAssessment,
  type Corpus,
  type GeneratedQuestion,
} from "@cc/domain";
import { CORRECT_FEEDBACK_MS } from "@cc/ui";
import AssessmentPage from "../src/pages/assessment";
import { makeState } from "./page-fixtures";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const assessmentPoemCorpus: Corpus = {
  poems: challengeContent.corpus.poems,
  idioms: [],
  characters: [],
};

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

function answerCompoundCorrectly(question: GeneratedQuestion): void {
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
      throw new Error(`candidate button not found: ${blank.answer}`);
    }
    used.add(candidate);
    fireEvent.click(candidate);
    fireEvent.click(
      screen.getByRole("button", { name: `空缺${position + 1}` }),
    );
  });
  fireEvent.click(exactButton("确定"));
}

describe("miniapp AssessmentPage", () => {
  it("creates the first checkpoint and omits daily total progress", async () => {
    render(
      <AssessmentPage
        state={makeState({ assessmentCompleted: false })}
        now={() => 100}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByText(/能力探索/).length).toBeGreaterThan(0);
    });
    expect(screen.getByText("1 / 5")).toBeTruthy();
    expect(screen.queryByText(/今日总进度/)).toBeNull();
    expect(screen.getByLabelText("答题区")).toBeTruthy();
    expect(screen.getByLabelText("题目提示")).toBeTruthy();
  });

  it("records a schema-valid V1 answer with real question timing", async () => {
    const state = makeState({ assessmentCompleted: false });
    const recorded = eventQueue();
    const now = vi
      .fn(() => 3_000)
      .mockReturnValueOnce(500)
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(2_250);
    render(
      <AssessmentPage state={state} queue={recorded.queue} now={now} />,
    );
    await waitFor(() => {
      expect(state.getState().activeAssessment).not.toBeNull();
    });
    const snapshot = state.getState().activeAssessment!;
    const kpId = assessmentKnowledgePointIds(
      challengeContent.corpus,
      5,
    )[snapshot.state.currentLevelIndex]!;
    const question = materializeAssessmentQuestions(
      kpId,
      snapshot.round,
      challengeContent.corpus,
      (id) => describeKnowledgePoint(challengeContent.corpus, id),
    )[snapshot.questionIndex]!;

    fireEvent.click(exactButton(question.correctAnswer));

    await waitFor(() => expect(recorded.events).toHaveLength(1));
    expect(() => learningEventSchema.parse(recorded.events[0])).not.toThrow();
    expect(recorded.events[0]).toMatchObject({
      childProfileId: "miniapp-child",
      deviceId: "miniapp-device",
      sessionId: "assessment:500",
      eventType: "ASSESSMENT_ANSWER",
      clientSequence: 0,
      contentVersion: "corpus-v5",
      ruleVersion: "mastery-v1",
      occurredAt: 2_250,
      payload: {
        payloadVersion: 1,
        context: "ASSESSMENT",
        participant: "CHILD",
        knowledgePointId: kpId,
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
    expect(state.getState().activeAssessment?.updatedAt).toBe(2_250);
  });

  it("keeps first-submission timing through wrong feedback and enqueue retry", async () => {
    const state = makeState({ assessmentCompleted: false });
    const attempted = eventQueue(1);
    let currentTime = 1_000;
    render(
      <AssessmentPage
        state={state}
        queue={attempted.queue}
        now={() => currentTime}
      />,
    );
    await waitFor(() => {
      expect(state.getState().activeAssessment).not.toBeNull();
    });
    const snapshot = state.getState().activeAssessment!;
    const kpId = assessmentKnowledgePointIds(
      challengeContent.corpus,
      5,
    )[snapshot.state.currentLevelIndex]!;
    const question = materializeAssessmentQuestions(
      kpId,
      snapshot.round,
      challengeContent.corpus,
      (id) => describeKnowledgePoint(challengeContent.corpus, id),
    )[snapshot.questionIndex]!;
    const wrongAnswer = question.options.find(
      (option) => option !== question.correctAnswer,
    );
    if (wrongAnswer === undefined) {
      throw new Error("question has no wrong option");
    }

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

  it("remounts POEM_FILL after a correct persistence rejection", async () => {
    vi.useFakeTimers();
    const state = makeState({ assessmentCompleted: false });
    const saved = {
      state: initAssessment(0),
      round: 0,
      questionIndex: 0,
      correctCount: 0,
      startedAt: 500,
      contentVersion: "corpus-v5",
      contentSelection: {
        childProfileId: "miniapp-child",
        authentication: "GUEST" as const,
        version: "corpus-v5",
        abilityLevel: 1 as const,
      },
      updatedAt: 500,
    };
    state.setActiveAssessment(saved);
    const attempted = eventQueue(1);
    const kpId = assessmentKnowledgePointIds(
      assessmentPoemCorpus,
      1,
    )[0]!;
    const question = materializeAssessmentQuestions(
      kpId,
      saved.round,
      assessmentPoemCorpus,
      (id) => describeKnowledgePoint(assessmentPoemCorpus, id),
    )[saved.questionIndex]!;
    expect(question.questionType).toBe("POEM_FILL");
    let currentTime = 1_000;
    render(
      <AssessmentPage
        state={state}
        queue={attempted.queue}
        now={() => currentTime}
        corpus={assessmentPoemCorpus}
        abilityLevel={1}
      />,
    );

    currentTime = 2_250;
    answerCompoundCorrectly(question);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CORRECT_FEEDBACK_MS);
    });

    expect(state.getState().activeAssessment).toEqual(saved);
    expect(
      screen
        .getAllByRole("button", { name: /，候选/ })
        .some((candidate) => !candidate.hasAttribute("disabled")),
    ).toBe(true);

    currentTime = 9_000;
    answerCompoundCorrectly(question);
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

  it("redirects completed learners home", async () => {
    const redirectTo = vi.spyOn(Taro, "redirectTo");
    render(<AssessmentPage state={makeState()} />);

    await waitFor(() => {
      expect(redirectTo).toHaveBeenCalledWith({
        url: "/pages/home/index",
      });
    });
  });
});
