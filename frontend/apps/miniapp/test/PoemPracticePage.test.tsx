// @vitest-environment happy-dom
import Taro from "@tarojs/taro";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
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
import { demoCorpus } from "../src/mock/content";
import PoemPracticePage from "../src/pages/poem-practice";

beforeEach(() => {
  vi.useFakeTimers();
});

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
    .find((candidate) => candidate.textContent?.trim() === label);
  if (button === undefined) {
    throw new Error(`button not found: ${label}`);
  }
  return button;
}

function fillAnswer(question: GeneratedQuestion): void {
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
    fireEvent.click(
      screen.getByRole("button", { name: `空缺${position + 1}` }),
    );
  });
  fireEvent.click(exactButton("确定"));
}

describe("miniapp PoemPracticePage", () => {
  it("renders the shared question stage and returns through miniapp navigation", () => {
    const navigateBack = vi.spyOn(Taro, "navigateBack");
    render(<PoemPracticePage />);

    expect(screen.getByText("1 / 10")).toBeTruthy();
    expect(screen.getByLabelText("答题区")).toBeTruthy();
    expect(screen.getByLabelText("题目提示")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "返回学习路线" }));
    expect(navigateBack).toHaveBeenCalledWith({ delta: 1 });
  });

  it("records one schema-valid practice answer before advancing", async () => {
    const recorded = eventQueue();
    const question = createPoemPracticeRound(
      demoCorpus,
      "miniapp:0",
    )[0]!;
    const now = vi
      .fn(() => 3_000)
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(2_250);
    const idGen = { ulid: vi.fn(() => "poem-page-session") };
    render(
      <PoemPracticePage
        corpus={demoCorpus}
        queue={recorded.queue}
        now={now}
        idGen={idGen}
      />,
    );

    fillAnswer(question);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CORRECT_FEEDBACK_MS);
    });

    expect(recorded.events).toHaveLength(1);
    expect(() => learningEventSchema.parse(recorded.events[0])).not.toThrow();
    expect(recorded.events[0]).toMatchObject({
      childProfileId: "miniapp-child",
      deviceId: "miniapp-device",
      sessionId: "poem-page-session",
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
    expect(screen.getByText("2 / 10")).toBeTruthy();
    expect(idGen.ulid).toHaveBeenCalledTimes(1);
  });

  it("keeps the question and frozen event when enqueue rejects", async () => {
    const attempted = eventQueue(1);
    const question = createPoemPracticeRound(
      demoCorpus,
      "miniapp:0",
    )[0]!;
    let currentTime = 1_000;
    render(
      <PoemPracticePage
        corpus={demoCorpus}
        queue={attempted.queue}
        now={() => currentTime}
        idGen={{ ulid: () => "poem-page-session" }}
      />,
    );

    currentTime = 2_250;
    fillAnswer(question);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CORRECT_FEEDBACK_MS);
    });

    expect(screen.getByText("1 / 10")).toBeTruthy();
    expect(attempted.attemptedEvents).toHaveLength(1);

    currentTime = 9_000;
    fillAnswer(question);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CORRECT_FEEDBACK_MS);
    });

    expect(attempted.attemptedEvents).toHaveLength(2);
    expect(attempted.attemptedEvents[1]).toEqual(
      attempted.attemptedEvents[0],
    );
    expect(attempted.events).toHaveLength(1);
    expect(screen.getByText("2 / 10")).toBeTruthy();
  });
});
