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
import { asKnowledgePointId } from "@cc/content-schema";
import { createIdiomPracticeRound, type Corpus } from "@cc/domain";
import { CORRECT_FEEDBACK_MS } from "@cc/ui";
import { demoCorpus } from "../src/mock/content";
import IdiomPracticePage from "../src/pages/idiom-practice";
import { sessionState } from "../src/session-state";

// The K12-free demo mock only ships difficulty-1 idioms, so the ADVANCED level
// (difficulty >= 3) has no playable content. The page and domain still fully
// support ADVANCED rounds (12 candidates, multi-accepted chains), so these
// tests use a test-local corpus that keeps BEGINNER identical to the mock and
// adds a closed difficulty-3 chain to exercise the advanced path.
const advancedDemoCorpus: Corpus = {
  poems: demoCorpus.poems,
  idioms: [
    ...demoCorpus.idioms,
    ...[
      "春夏秋冬",
      "春夏秋雨",
      "春夏秋风",
      "春夏秋雪",
      "春夏秋月",
      "春夏秋日",
      "春夏秋光",
      "春夏秋水",
    ].map((text, index) => ({
      id: asKnowledgePointId(`cy-adv-${index}`),
      text,
      meaning: `进阶成语${index}`,
      headPinyin: "chun",
      tailPinyin: "chun",
      difficulty: 3 as const,
      level: 3 as const,
      promotionRequired: true,
      status: "ACTIVE" as const,
      tags: [] as string[],
      revision: 1,
    })),
  ],
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function candidateButtons(): HTMLButtonElement[] {
  return screen.getAllByRole("button", { name: /，候选/ });
}

function eventQueue(rejectCount = 0, rejectAfter = 0): {
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
      if (
        attemptedEvents.length > rejectAfter &&
        remainingRejections > 0
      ) {
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

async function choose(answer: string): Promise<void> {
  const used = new Set<HTMLButtonElement>();
  for (const character of Array.from(answer)) {
    const candidate = candidateButtons().find(
      (button) =>
        !used.has(button) && button.textContent?.trim() === character,
    );
    if (candidate === undefined) {
      throw new Error(`candidate not found for ${character} in ${answer}`);
    }
    used.add(candidate);
    fireEvent.click(candidate);
  }
  await act(async () => {
    await vi.advanceTimersByTimeAsync(CORRECT_FEEDBACK_MS);
  });
}

describe("miniapp IdiomPracticePage", () => {
  it("starts a beginner round and returns through miniapp navigation", () => {
    const navigateBack = vi.spyOn(Taro, "navigateBack");
    render(<IdiomPracticePage corpus={demoCorpus} />);

    expect(screen.getAllByText(/成语世界/).length).toBeGreaterThan(0);
    expect(screen.getByText("1 / 10")).toBeTruthy();
    expect(screen.getByLabelText("答题区")).toBeTruthy();
    expect(screen.getByLabelText("题目提示")).toBeTruthy();
    expect(candidateButtons()).toHaveLength(8);
    expect(
      screen.getByRole("button", { name: "初级" }).getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "进阶" }).getAttribute(
        "aria-pressed",
      ),
    ).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "返回学习路线" }));
    expect(navigateBack).toHaveBeenCalledWith({ delta: 1 });
  });

  it("advances locally without changing SessionState", async () => {
    const before = structuredClone(sessionState.getState());
    const [question] = createIdiomPracticeRound(
      demoCorpus,
      "BEGINNER",
      "miniapp:BEGINNER:0",
    );
    render(<IdiomPracticePage corpus={demoCorpus} />);

    await choose(question!.correctAnswer);

    expect(screen.getByText("2 / 10")).toBeTruthy();
    expect(sessionState.getState()).toEqual(before);
  });

  it("records one schema-valid practice answer before advancing", async () => {
    const recorded = eventQueue();
    const question = createIdiomPracticeRound(
      demoCorpus,
      "BEGINNER",
      "miniapp:BEGINNER:0",
    )[0]!;
    const now = vi
      .fn(() => 3_000)
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(2_250);
    const idGen = { ulid: vi.fn(() => "idiom-page-session") };
    render(
      <IdiomPracticePage
        corpus={demoCorpus}
        queue={recorded.queue}
        now={now}
        idGen={idGen}
      />,
    );

    await choose(question.correctAnswer);

    expect(recorded.events).toHaveLength(1);
    expect(() => learningEventSchema.parse(recorded.events[0])).not.toThrow();
    expect(recorded.events[0]).toMatchObject({
      childProfileId: "miniapp-child",
      deviceId: "miniapp-device",
      sessionId: "idiom-page-session",
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

  it("records an accepted non-canonical answer as correct", async () => {
    const recorded = eventQueue();
    const round = Array.from({ length: 20 }, (_, index) => index * 2 + 1).find(
      (candidateRound) =>
        createIdiomPracticeRound(
          advancedDemoCorpus,
          "ADVANCED",
          `miniapp:ADVANCED:${candidateRound}`,
        ).some((question) => (question.acceptedAnswers?.length ?? 0) > 1),
    );
    expect(round).toBeDefined();
    const questions = createIdiomPracticeRound(
      advancedDemoCorpus,
      "ADVANCED",
      `miniapp:ADVANCED:${round}`,
    );
    const targetIndex = questions.findIndex(
      (question) => (question.acceptedAnswers?.length ?? 0) > 1,
    );
    expect(targetIndex).toBeGreaterThanOrEqual(0);

    render(
      <IdiomPracticePage
        corpus={advancedDemoCorpus}
        queue={recorded.queue}
        idGen={{ ulid: () => "idiom-page-session" }}
      />,
    );
    for (let currentRound = 1; currentRound <= round!; currentRound += 1) {
      fireEvent.click(
        screen.getByRole("button", {
          name: currentRound % 2 === 1 ? "进阶" : "初级",
        }),
      );
    }
    for (let index = 0; index < targetIndex; index += 1) {
      await choose(questions[index]!.correctAnswer);
    }
    const target = questions[targetIndex]!;
    const alternative = target.acceptedAnswers!.find(
      (answer) => answer !== target.correctAnswer,
    );
    expect(alternative).toBeDefined();

    await choose(alternative!);

    expect(recorded.events).toHaveLength(targetIndex + 1);
    expect(recorded.events[targetIndex]).toMatchObject({
      clientSequence: targetIndex,
      payload: {
        questionIndex: targetIndex,
        submittedAnswer: alternative,
        correctAnswer: target.correctAnswer,
        correct: true,
      },
    });
    if (targetIndex === questions.length - 1) {
      expect(screen.getByText("本轮完成")).toBeTruthy();
      expect(screen.getByText("答对 10 / 10 题")).toBeTruthy();
    } else {
      expect(screen.getByText(`${targetIndex + 2} / 10`)).toBeTruthy();
      expect(
        screen.getByText(
          new RegExp(`本轮正确 ${targetIndex + 1} 题`),
        ),
      ).toBeTruthy();
    }
  });

  it("keeps the question and frozen event when enqueue rejects", async () => {
    const attempted = eventQueue(1);
    const question = createIdiomPracticeRound(
      demoCorpus,
      "BEGINNER",
      "miniapp:BEGINNER:0",
    )[0]!;
    let currentTime = 1_000;
    render(
      <IdiomPracticePage
        corpus={demoCorpus}
        queue={attempted.queue}
        now={() => currentTime}
        idGen={{ ulid: () => "idiom-page-session" }}
      />,
    );

    currentTime = 2_250;
    await choose(question.correctAnswer);

    expect(screen.getByText("1 / 10")).toBeTruthy();
    expect(attempted.attemptedEvents).toHaveLength(1);

    currentTime = 9_000;
    await choose(question.correctAnswer);

    expect(attempted.attemptedEvents).toHaveLength(2);
    expect(attempted.attemptedEvents[1]).toEqual(
      attempted.attemptedEvents[0],
    );
    expect(attempted.events).toHaveLength(1);
    expect(screen.getByText("2 / 10")).toBeTruthy();
  });

  it("retries a different accepted answer with the frozen first event", async () => {
    const roundNumber = Array.from(
      { length: 20 },
      (_, index) => index * 2 + 1,
    ).find((candidateRound) =>
      createIdiomPracticeRound(
        advancedDemoCorpus,
        "ADVANCED",
        `miniapp:ADVANCED:${candidateRound}`,
      ).some((question) => (question.acceptedAnswers?.length ?? 0) > 1),
    );
    expect(roundNumber).toBeDefined();
    const round = createIdiomPracticeRound(
      advancedDemoCorpus,
      "ADVANCED",
      `miniapp:ADVANCED:${roundNumber}`,
    );
    const targetIndex = round.findIndex(
      (question) => (question.acceptedAnswers?.length ?? 0) > 1,
    );
    const target = round[targetIndex]!;
    const alternative = target.acceptedAnswers!.find(
      (answer) => answer !== target.correctAnswer,
    );
    expect(alternative).toBeDefined();
    const attempted = eventQueue(1, targetIndex);
    let currentTime = 1_000;
    render(
      <IdiomPracticePage
        corpus={advancedDemoCorpus}
        queue={attempted.queue}
        now={() => currentTime}
        idGen={{ ulid: () => "idiom-page-session" }}
      />,
    );
    for (
      let currentRound = 1;
      currentRound <= roundNumber!;
      currentRound += 1
    ) {
      fireEvent.click(
        screen.getByRole("button", {
          name: currentRound % 2 === 1 ? "进阶" : "初级",
        }),
      );
    }
    for (let index = 0; index < targetIndex; index += 1) {
      await choose(round[index]!.correctAnswer);
    }

    currentTime = 2_250;
    await choose(target.correctAnswer);
    currentTime = 9_000;
    await choose(alternative!);

    expect(attempted.attemptedEvents).toHaveLength(targetIndex + 2);
    expect(attempted.attemptedEvents[targetIndex + 1]).toEqual(
      attempted.attemptedEvents[targetIndex],
    );
    expect(attempted.events[targetIndex]).toMatchObject({
      occurredAt: 2_250,
      payload: {
        submittedAnswer: target.correctAnswer,
        correct: true,
      },
    });
    if (targetIndex === round.length - 1) {
      expect(screen.getByText("本轮完成")).toBeTruthy();
      expect(screen.getByText("答对 10 / 10 题")).toBeTruthy();
    } else {
      expect(screen.getByText(`${targetIndex + 2} / 10`)).toBeTruthy();
    }
  });

  it("switches to advanced and resets round progress", async () => {
    const [question] = createIdiomPracticeRound(
      advancedDemoCorpus,
      "BEGINNER",
      "miniapp:BEGINNER:0",
    );
    render(<IdiomPracticePage corpus={advancedDemoCorpus} />);
    await choose(question!.correctAnswer);

    fireEvent.click(screen.getByRole("button", { name: "进阶" }));

    expect(screen.getByText("1 / 10")).toBeTruthy();
    expect(screen.getByText(/本轮正确 0 题/)).toBeTruthy();
    expect(candidateButtons()).toHaveLength(12);
    expect(
      screen.getByRole("button", { name: "进阶" }).getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");
  });

  it("shows a returnable error when the level has no playable idioms", () => {
    const navigateBack = vi.spyOn(Taro, "navigateBack");
    render(
      <IdiomPracticePage corpus={{ ...demoCorpus, idioms: [] }} />,
    );

    expect(screen.getByText("成语内容暂时不可用")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "返回首页" }));
    expect(navigateBack).toHaveBeenCalledWith({ delta: 1 });
  });

  it("settles ten questions, starts another round, and returns home", async () => {
    const navigateBack = vi.spyOn(Taro, "navigateBack");
    const questions = createIdiomPracticeRound(
      demoCorpus,
      "BEGINNER",
      "miniapp:BEGINNER:0",
    );
    render(<IdiomPracticePage corpus={demoCorpus} />);

    for (const question of questions) {
      await choose(question.correctAnswer);
    }

    expect(screen.getByText("本轮完成")).toBeTruthy();
    expect(screen.getByText("答对 10 / 10 题")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "返回首页" }));
    expect(navigateBack).toHaveBeenCalledWith({ delta: 1 });

    fireEvent.click(screen.getByRole("button", { name: "再来一轮" }));
    expect(screen.getByText("1 / 10")).toBeTruthy();
    expect(screen.getByText(/本轮正确 0 题/)).toBeTruthy();
  });
});
