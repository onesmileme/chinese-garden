// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EventQueue,
  type EventStore,
  type LearningEvent,
} from "@cc/application";
import {
  asKnowledgePointId,
  learningEventSchema,
  type ContentLevel,
  type ContentMetadata,
  type Idiom,
} from "@cc/content-schema";
import {
  createMixedIdiomRound,
  IDIOM_ROUND_SIZE,
  type Corpus,
  type GeneratedQuestion,
} from "@cc/domain";
import { CORRECT_FEEDBACK_MS } from "@cc/ui";
import { App } from "../src/App";
import { idiomCorpus } from "../src/mock/idiom-corpus";
import { IdiomPracticePage } from "../src/pages/IdiomPracticePage";
import { sessionState } from "../src/session-state";

// 古文乐园 demo 语料只含难度 1 的成语，无法生成"进阶"（难度 ≥ 3）轮次。
// 为覆盖进阶交互，这里构造一个含初级/进阶闭合接龙的本地测试语料，
// 其中进阶段包含一对互为异位词的后继，保证任意轮次里都存在一个
// 拥有多个可接受答案的题目（备选答案总能由候选字拼出）。
const withActiveMetadata = <T extends { difficulty: ContentLevel }>(
  items: T[],
): Array<T & ContentMetadata> =>
  items.map((item) => ({
    ...item,
    level: item.difficulty,
    promotionRequired: true,
    status: "ACTIVE",
    tags: [],
    revision: 1,
  }));

const advancedCorpus: Corpus = {
  poems: [],
  idioms: withActiveMetadata<Idiom>([
    // 初级闭合接龙（难度 1-2）
    { id: asKnowledgePointId("cy-yixinyiyi"), text: "一心一意", meaning: "释义一", headPinyin: "yi", tailPinyin: "yi", difficulty: 1 },
    { id: asKnowledgePointId("cy-yiqifengfa"), text: "意气风发", meaning: "释义二", headPinyin: "yi", tailPinyin: "fa", difficulty: 2 },
    { id: asKnowledgePointId("cy-fayangguangda"), text: "发扬光大", meaning: "释义三", headPinyin: "fa", tailPinyin: "da", difficulty: 1 },
    { id: asKnowledgePointId("cy-dagonggaocheng"), text: "大功告成", meaning: "释义四", headPinyin: "da", tailPinyin: "cheng", difficulty: 2 },
    { id: asKnowledgePointId("cy-chengqianshangwan"), text: "成千上万", meaning: "释义五", headPinyin: "cheng", tailPinyin: "wan", difficulty: 1 },
    { id: asKnowledgePointId("cy-wanzhongyixin"), text: "万众一心", meaning: "释义六", headPinyin: "wan", tailPinyin: "xin", difficulty: 2 },
    { id: asKnowledgePointId("cy-xinxiangshicheng"), text: "心想事成", meaning: "释义七", headPinyin: "xin", tailPinyin: "cheng", difficulty: 1 },
    // 进阶闭合接龙（难度 3-5），"承前启后"→ 头为 hou 的两条后继互为异位词
    { id: asKnowledgePointId("cy-chengqiankaihou"), text: "承前启后", meaning: "释义八", headPinyin: "cheng", tailPinyin: "hou", difficulty: 3 },
    { id: asKnowledgePointId("cy-houlaijushang"), text: "后来居上", meaning: "释义九", headPinyin: "hou", tailPinyin: "shang", difficulty: 3 },
    { id: asKnowledgePointId("cy-jushanglaihou"), text: "居上来后", meaning: "释义十", headPinyin: "hou", tailPinyin: "lai", difficulty: 4 },
    { id: asKnowledgePointId("cy-shanghangxiaxiao"), text: "上行下效", meaning: "释义十一", headPinyin: "shang", tailPinyin: "xiao", difficulty: 5 },
    { id: asKnowledgePointId("cy-lairifangchang"), text: "来日方长", meaning: "释义十二", headPinyin: "lai", tailPinyin: "chang", difficulty: 4 },
    { id: asKnowledgePointId("cy-xiaofachengqian"), text: "效法承前", meaning: "释义十三", headPinyin: "xiao", tailPinyin: "cheng", difficulty: 5 },
    { id: asKnowledgePointId("cy-changzhijiuan"), text: "长治久安", meaning: "释义十四", headPinyin: "chang", tailPinyin: "an", difficulty: 5 },
    { id: asKnowledgePointId("cy-anfenshouji"), text: "安分守己", meaning: "释义十五", headPinyin: "an", tailPinyin: "ji", difficulty: 5 },
  ]),
};

let container: HTMLDivElement;
let root: Root;

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function candidateButtons(): HTMLButtonElement[] {
  return [
    ...container.querySelectorAll<HTMLButtonElement>(
      'button[aria-label*="，候选"]',
    ),
  ];
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

async function choose(answer: string): Promise<void> {
  // IDIOM_MEANING 复用单选：答案整串作为单个选项按钮直接点击；
  // IDIOM_CHAIN 则从候选字逐字拼出答案。
  const directOption = [...container.querySelectorAll("button")].find(
    (item) => !item.disabled && item.textContent?.trim() === answer,
  );
  if (directOption instanceof HTMLButtonElement) {
    click(directOption);
  } else {
    const used = new Set<HTMLButtonElement>();
    for (const character of Array.from(answer)) {
      const candidate = candidateButtons().find(
        (item) => !used.has(item) && item.textContent?.trim() === character,
      );
      if (candidate === undefined) {
        throw new Error(`candidate not found for ${character} in ${answer}`);
      }
      used.add(candidate);
      click(candidate);
    }
  }
  await act(async () => {
    await vi.advanceTimersByTimeAsync(CORRECT_FEEDBACK_MS);
  });
}

function questions(
  level: "BEGINNER" | "ADVANCED",
  round = 0,
  corpus: Corpus = level === "ADVANCED" ? advancedCorpus : idiomCorpus,
): GeneratedQuestion[] {
  return createMixedIdiomRound(
    corpus,
    level,
    `playground:${level}:${round}`,
  );
}

function recordingQueue(rejectCount = 0, rejectAfter = 0): {
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

describe("IdiomPracticePage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.location.hash = "#/idiom-practice";
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("is available from the route with a beginner question", async () => {
    await act(async () => root.render(<App />));

    expect(container.textContent).toContain("成语世界");
    expect(container.textContent).toContain("1 / 10");
    expect(candidateButtons()).toHaveLength(8);
    expect(button("初级").getAttribute("aria-pressed")).toBe("true");
    expect(button("进阶").getAttribute("aria-pressed")).toBe("false");
    expect(button("撤销")).toBeTruthy();
    expect(
      container.querySelector('[data-question-stage="true"]'),
    ).not.toBeNull();
    expect(container.querySelector('[aria-label="题目提示"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="学习状态"]')).toBeNull();
  });

  it("advances locally without changing SessionState", async () => {
    const before = structuredClone(sessionState.getState());
    act(() => root.render(<IdiomPracticePage corpus={idiomCorpus} />));

    await choose(questions("BEGINNER")[0]!.correctAnswer);

    expect(container.textContent).toContain("2 / 10");
    expect(sessionState.getState()).toEqual(before);
  });

  it("records one schema-valid practice answer with real question facts", async () => {
    const recorded = recordingQueue();
    const question = questions("BEGINNER")[0]!;
    const now = vi
      .fn(() => 3_000)
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(2_250);
    act(() =>
      root.render(
        <IdiomPracticePage
          corpus={idiomCorpus}
          queue={recorded.queue}
          now={now}
          idGen={{ ulid: () => "idiom-practice-session" }}
        />,
      ),
    );

    await choose(question.correctAnswer);

    expect(recorded.events).toHaveLength(1);
    expect(() => learningEventSchema.parse(recorded.events[0])).not.toThrow();
    expect(recorded.events[0]).toMatchObject({
      childProfileId: "debug-child",
      deviceId: "playground-browser",
      sessionId: "idiom-practice-session",
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

  it("accepts a non-canonical answer", async () => {
    const recorded = recordingQueue();
    const round = questions("ADVANCED", 1);
    const targetIndex = round.findIndex(
      (question) => (question.acceptedAnswers?.length ?? 0) > 1,
    );
    expect(targetIndex).toBeGreaterThanOrEqual(0);

    act(() =>
      root.render(
        <IdiomPracticePage
          corpus={advancedCorpus}
          queue={recorded.queue}
          idGen={{ ulid: () => "idiom-practice-session" }}
        />,
      ),
    );
    click(button("进阶"));
    for (let index = 0; index < targetIndex; index += 1) {
      await choose(round[index]!.correctAnswer);
    }
    const target = round[targetIndex]!;
    const alternative = target.acceptedAnswers!.find(
      (answer) => answer !== target.correctAnswer,
    );
    expect(alternative).toBeDefined();

    await choose(alternative!);

    expect(container.textContent).toContain(`${targetIndex + 2} / 10`);
    expect(container.textContent).toContain(`本轮正确 ${targetIndex + 1} 题`);
    expect(recorded.events).toHaveLength(targetIndex + 1);
    expect(recorded.events[targetIndex]).toMatchObject({
      sessionId: "idiom-practice-session",
      clientSequence: targetIndex,
      payload: {
        questionIndex: targetIndex,
        submittedAnswer: alternative,
        correctAnswer: target.correctAnswer,
        correct: true,
      },
    });
  });

  it("keeps first-submission facts and the question retryable after rejection", async () => {
    const recorded = recordingQueue(1);
    const question = questions("BEGINNER")[0]!;
    const wrongAnswer = Array.from(question.correctAnswer).reverse().join("");
    expect(question.acceptedAnswers).not.toContain(wrongAnswer);
    let currentTime = 1_000;
    act(() =>
      root.render(
        <IdiomPracticePage
          corpus={idiomCorpus}
          queue={recorded.queue}
          now={() => currentTime}
          idGen={{ ulid: () => "idiom-practice-session" }}
        />,
      ),
    );

    currentTime = 2_250;
    await choose(wrongAnswer);
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
        submittedAnswer: wrongAnswer,
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

  it("retries a rejected accepted answer with the frozen first answer", async () => {
    const round = questions("ADVANCED", 1);
    const targetIndex = round.findIndex(
      (question) => (question.acceptedAnswers?.length ?? 0) > 1,
    );
    expect(targetIndex).toBeGreaterThanOrEqual(0);
    const target = round[targetIndex]!;
    const alternative = target.acceptedAnswers!.find(
      (answer) => answer !== target.correctAnswer,
    );
    expect(alternative).toBeDefined();
    const recorded = recordingQueue(1, targetIndex);
    let currentTime = 1_000;
    act(() =>
      root.render(
        <IdiomPracticePage
          corpus={advancedCorpus}
          queue={recorded.queue}
          now={() => currentTime}
          idGen={{ ulid: () => "idiom-practice-session" }}
        />,
      ),
    );
    click(button("进阶"));
    for (let index = 0; index < targetIndex; index += 1) {
      await choose(round[index]!.correctAnswer);
    }

    currentTime = 2_250;
    await choose(target.correctAnswer);
    expect(container.textContent).toContain(`${targetIndex + 1} / 10`);

    currentTime = 9_000;
    await choose(alternative!);

    expect(recorded.attemptedEvents).toHaveLength(targetIndex + 2);
    expect(recorded.attemptedEvents[targetIndex + 1]).toEqual(
      recorded.attemptedEvents[targetIndex],
    );
    expect(recorded.events[targetIndex]).toMatchObject({
      occurredAt: 2_250,
      payload: {
        submittedAnswer: target.correctAnswer,
        correct: true,
      },
    });
    expect(container.textContent).toContain(`${targetIndex + 2} / 10`);
    expect(container.textContent).toContain(
      `本轮正确 ${targetIndex + 1} 题`,
    );
  });

  it("keeps event indexes contiguous when difficulty changes mid-round", async () => {
    const recorded = recordingQueue();
    act(() =>
      root.render(
        <IdiomPracticePage
          corpus={advancedCorpus}
          queue={recorded.queue}
          idGen={{ ulid: () => "idiom-practice-session" }}
        />,
      ),
    );

    await choose(questions("BEGINNER", 0, advancedCorpus)[0]!.correctAnswer);
    click(button("进阶"));
    await choose(questions("ADVANCED", 1)[0]!.correctAnswer);

    expect(recorded.events.map((event) => event.clientSequence)).toEqual([
      0, 1,
    ]);
    expect(recorded.events.map((event) => event.payload.questionIndex)).toEqual(
      [0, 1],
    );
  });

  it("switches to advanced and resets progress with twelve candidates", async () => {
    act(() => root.render(<IdiomPracticePage corpus={advancedCorpus} />));
    await choose(questions("BEGINNER", 0, advancedCorpus)[0]!.correctAnswer);
    expect(container.textContent).toContain("2 / 10");

    click(button("进阶"));

    expect(container.textContent).toContain("1 / 10");
    expect(container.textContent).toContain("本轮正确 0 题");
    expect(candidateButtons()).toHaveLength(12);
    expect(button("进阶").getAttribute("aria-pressed")).toBe("true");
  });

  it("shows a returnable error when the level has no playable idioms", () => {
    act(() =>
      root.render(
        <IdiomPracticePage corpus={{ ...idiomCorpus, idioms: [] }} />,
      ),
    );

    expect(container.textContent).toContain("成语内容暂时不可用");
    click(button("返回首页"));
    expect(window.location.hash).toBe("#/home");
  });

  it("settles ten questions, starts another round, and returns home", async () => {
    const recorded = recordingQueue();
    act(() =>
      root.render(
        <IdiomPracticePage
          corpus={idiomCorpus}
          queue={recorded.queue}
          idGen={{ ulid: () => "idiom-practice-session" }}
        />,
      ),
    );
    for (const question of questions("BEGINNER")) {
      await choose(question.correctAnswer);
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

    await choose(questions("BEGINNER", 1)[0]!.correctAnswer);
    expect(recorded.events).toHaveLength(11);
    expect(recorded.events[10]).toMatchObject({
      sessionId: "idiom-practice-session",
      clientSequence: 10,
      payload: { questionIndex: 10 },
    });
  });
});
