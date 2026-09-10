// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  ACTIVE_CHALLENGE_KEY,
  CHALLENGE_SOURCE_KEY,
  EventQueue,
  LAST_CHALLENGE_RESULT_KEY,
  RECENT_CHALLENGES_KEY,
  type ActiveChallengeSession,
  type EventStore,
  type LearningEvent,
} from "@cc/application";
import { challengeCorpus } from "@cc/content";
import {
  CHALLENGE_DURATION_MS,
  CHALLENGE_QUESTION_COUNT,
  CHALLENGE_RULE_VERSION,
  challengeTurnQuestionCount,
  confirmWrongFeedback,
  continueHandoff,
  createChallenge,
  pauseChallenge,
  questionForTurn,
  submitChallengeAnswer,
  type ChineseChallengeConfig,
  type Corpus,
  type GeneratedQuestion,
} from "@cc/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONTENT_VERSION } from "../src/session-state";

type MockTaro = (typeof import("@tarojs/taro"))["default"];

let isolatedTaro: MockTaro;
let emitDidHide: () => void;
let emitDidShow: () => void;
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

const renderedHeader = vi.hoisted(() => ({ total: 0 }));

vi.mock("@cc/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cc/ui")>();
  return {
    ...actual,
    ChallengeTurnHeader: (
      props: Parameters<typeof actual.ChallengeTurnHeader>[0],
    ) => {
      renderedHeader.total = props.total;
      return <actual.ChallengeTurnHeader {...props} />;
    },
  };
});

beforeEach(async () => {
  vi.resetModules();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const taroModule = await import("@tarojs/taro");
  isolatedTaro = taroModule.default;
  const lifecycle = taroModule as unknown as {
    emitDidHide(): void;
    emitDidShow(): void;
  };
  emitDidHide = lifecycle.emitDidHide;
  emitDidShow = lifecycle.emitDidShow;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const fixedConfig: ChineseChallengeConfig = {
  mode: "FIXED_RACE",
  tier: "STANDARD",
  dimension: "POEM",
  childDifficulty: 1,
  abilityLevel: 5,
  durationMs: CHALLENGE_DURATION_MS,
  questionCount: 1,
  contentVersion: CONTENT_VERSION,
  ruleVersion: CHALLENGE_RULE_VERSION,
};

function seedActiveChallenge(session: ActiveChallengeSession): void {
  isolatedTaro.setStorageSync(ACTIVE_CHALLENGE_KEY, {
    ...session,
    contentSelection:
      (session as Partial<ActiveChallengeSession>).contentSelection ?? {
        childProfileId: "miniapp-child",
        authentication: "GUEST",
        version: session.config.contentVersion,
        abilityLevel: session.config.abilityLevel,
      },
  });
}

function button(label: string): HTMLButtonElement {
  const match = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === label,
  );
  if (!(match instanceof HTMLButtonElement)) {
    throw new Error(`button not found: ${label}`);
  }
  return match;
}

function click(label: string): void {
  act(() => {
    button(label).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

// POEM_FILL 是复合题：轻点候选字选中，再轻点空缺放入，逐空填对后确定。
function answerPoemFill(question: GeneratedQuestion): void {
  const blanks = question.blanks ?? [];
  blanks.forEach((blank, position) => {
    const candidate = [...container.querySelectorAll("button")].find(
      (btn) =>
        (btn.getAttribute("aria-label") ?? "").startsWith(
          `${blank.answer}，候选`,
        ) && !(btn as HTMLButtonElement).disabled,
    );
    if (!(candidate instanceof HTMLButtonElement)) {
      throw new Error(`poem candidate not found: ${blank.answer}`);
    }
    act(() =>
      candidate.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );
    const slot = [...container.querySelectorAll("button")].find(
      (btn) => btn.getAttribute("aria-label") === `空缺${position + 1}`,
    );
    if (!(slot instanceof HTMLButtonElement)) {
      throw new Error(`poem blank not found: ${position + 1}`);
    }
    act(() => slot.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  });
  click("确定");
}

// 诗词世界（POEM）仍可出题，但删减到不足固定题量竞速所需的 10 道不重复题，
// 用于触发容量不足提示（成语语料清空后 POEM 是唯一可用维度）。
function sparsePoemCorpus(): Corpus {
  const parentPoems = challengeCorpus.poems
    .filter((poem) => poem.difficulty === 4)
    .slice(0, 3);
  const childPoems = challengeCorpus.poems
    .filter((poem) => poem.difficulty === 2)
    .slice(0, 2);
  return {
    ...challengeCorpus,
    poems: [...childPoems, ...parentPoems],
    idioms: [],
  };
}

function recordingQueue(): {
  queue: EventQueue;
  events: LearningEvent[];
} {
  const events: LearningEvent[] = [];
  const store: EventStore = {
    append: async (event) => void events.push(event),
    pending: async (limit) => events.slice(0, limit),
    ack: async () => undefined,
    all: async () => [...events],
  };
  return { queue: new EventQueue(store), events };
}

async function answerVisibleQuestionCorrectly(): Promise<void> {
  const sessionState = await import("../src/session-state");
  const session = sessionState.getState().activeChallenge!;
  answerPoemFill(questionForTurn(session, challengeCorpus));
  await act(async () => Promise.resolve());
}

function resultReadyHandoff(
  challengeId = "miniapp-result-ready",
): ActiveChallengeSession {
  const child = createChallenge({
    challengeId,
    config: fixedConfig,
    corpus: challengeCorpus,
    nowMs: 0,
  });
  const answered = submitChallengeAnswer(
    child,
    questionForTurn(child, challengeCorpus).correctAnswer,
    challengeCorpus,
    100,
  );
  const parent = continueHandoff(answered, 200);
  const parentQuestion = questionForTurn(parent, challengeCorpus);
  const parentWrong = parentQuestion.options.find(
    (option) => option !== parentQuestion.correctAnswer,
  )!;
  const pending = submitChallengeAnswer(
    parent,
    parentWrong,
    challengeCorpus,
    300,
  );
  return {
    ...confirmWrongFeedback(pending, challengeCorpus, 400),
    contentSelection: {
      childProfileId: "miniapp-child",
      authentication: "GUEST",
      version: fixedConfig.contentVersion,
      abilityLevel: fixedConfig.abilityLevel,
    },
  } as ActiveChallengeSession;
}

describe("miniapp ChallengePage", () => {
  it.each(["CHILD", "PARENT"] as const)(
    "records one %s challenge answer before updating the active snapshot",
    async (participant) => {
      const recorded = recordingQueue();
      const childTurn = createChallenge({
        challengeId: `miniapp-${participant.toLowerCase()}-answer`,
        config: fixedConfig,
        corpus: challengeCorpus,
        nowMs: 1_000,
      });
      const turn =
        participant === "CHILD"
          ? childTurn
          : continueHandoff(
              {
                ...childTurn,
                phase: "HANDOFF",
                handoffTarget: "PARENT_TURN",
                paused: true,
              },
              1_500,
            );
      seedActiveChallenge(turn as ActiveChallengeSession);
      const question = questionForTurn(turn, challengeCorpus);
      const { default: ChallengePage } = await import(
        "../src/pages/challenge/index"
      );

      await act(async () => {
        root.render(
          <ChallengePage
            queue={recorded.queue}
            clock={{ now: () => 2_000 }}
          />,
        );
        await Promise.resolve();
      });
      answerPoemFill(question);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(recorded.events).toHaveLength(1);
      expect(recorded.events[0]).toMatchObject({
        childProfileId: "miniapp-child",
        deviceId: "miniapp-device",
        sessionId: turn.challengeId,
        eventType: "CHALLENGE_ANSWER",
        contentVersion: CONTENT_VERSION,
        ruleVersion: CHALLENGE_RULE_VERSION,
        occurredAt: 2_000,
        payload: {
          context: "CHALLENGE",
          participant,
          knowledgePointId: question.knowledgePointId,
          questionType: question.questionType,
          questionSeed: question.seed,
          questionIndex: 0,
          submittedAnswer: question.correctAnswer,
          correctAnswer: question.correctAnswer,
          correct: true,
          challenge: {
            challengeId: turn.challengeId,
            dimension: "POEM",
            participantDifficulty: participant === "CHILD" ? 1 : 4,
          },
        },
      });
      const sessionState = await import("../src/session-state");
      const active = sessionState.getState().activeChallenge!;
      const attempts =
        participant === "CHILD" ? active.child.attempts : active.parent.attempts;
      expect(attempts).toEqual([
        expect.objectContaining({
          submittedAnswer: question.correctAnswer,
          correct: true,
        }),
      ]);
    },
  );

  it("shows the timed turn's unique deck capacity", async () => {
    const timed = createChallenge({
      challengeId: "miniapp-timed-capacity",
      config: { ...fixedConfig, mode: "TIMED" },
      corpus: challengeCorpus,
      nowMs: 0,
    });
    seedActiveChallenge(timed as ActiveChallengeSession);
    const { default: ChallengePage } = await import(
      "../src/pages/challenge/index"
    );

    await act(async () => root.render(<ChallengePage />));

    expect(renderedHeader.total).toBe(
      challengeTurnQuestionCount(timed, challengeCorpus),
    );
  });

  it("starts from a saved challenge source with injected content", async () => {
    const contentVersion = "injected-corpus-v1";
    isolatedTaro.setStorageSync(CHALLENGE_SOURCE_KEY, {
      childDifficulty: 1,
      contentVersion: CONTENT_VERSION,
      updatedAt: 1,
    });
    const { default: ChallengePage } = await import(
      "../src/pages/challenge/index"
    );
    await act(async () =>
      root.render(
        <ChallengePage
          content={{ corpus: challengeCorpus, contentVersion }}
        />,
      ),
    );

    click("下一步");
    click("下一步");
    click("下一步");
    click("小朋友先来");

    const sessionState = await import("../src/session-state");
    expect(sessionState.getState().activeChallenge).toMatchObject({
      phase: "CHILD_TURN",
      config: {
        mode: "TIMED",
        tier: "STANDARD",
        dimension: "POEM",
        childDifficulty: 1,
        contentVersion,
      },
    });
  });

  it("shows the fixed-race capacity error without creating a session", async () => {
    isolatedTaro.setStorageSync(CHALLENGE_SOURCE_KEY, {
      childDifficulty: 1,
      contentVersion: CONTENT_VERSION,
      updatedAt: 1,
    });
    const { default: ChallengePage } = await import(
      "../src/pages/challenge/index"
    );
    await act(async () =>
      root.render(
        <ChallengePage
          content={{
            corpus: sparsePoemCorpus(),
            contentVersion: "test-sparse-v1",
          }}
        />,
      ),
    );

    click("下一步");
    click("固定题量竞速");
    click("下一步");
    click("下一步");
    click("小朋友先来");

    const sessionState = await import("../src/session-state");
    expect(container.textContent).toContain("当前题库不足 10 道不重复题");
    expect(sessionState.getState().activeChallenge).toBeNull();
  });

  it("shows setup when the saved difficulty has a playable dimension", async () => {
    const redirect = vi.spyOn(isolatedTaro, "redirectTo");
    isolatedTaro.setStorageSync(CHALLENGE_SOURCE_KEY, {
      childDifficulty: 2,
      contentVersion: CONTENT_VERSION,
      updatedAt: 1,
    });
    const { default: ChallengePage } = await import(
      "../src/pages/challenge/index"
    );
    await act(async () => {
      root.render(<ChallengePage />);
      await Promise.resolve();
    });

    expect(container.textContent).toContain("选择挑战世界");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("runs both turns, stores compact result data, and replays", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    seedActiveChallenge(
      createChallenge({
        challengeId: "miniapp-challenge",
        config: fixedConfig,
        corpus: challengeCorpus,
        nowMs: 0,
      }) as ActiveChallengeSession,
    );
    isolatedTaro.setStorageSync(CHALLENGE_SOURCE_KEY, {
      childDifficulty: 1,
      contentVersion: CONTENT_VERSION,
      updatedAt: 1,
    });
    const { default: ChallengePage } = await import(
      "../src/pages/challenge/index"
    );
    const sessionState = await import("../src/session-state");
    const { platform } = await import("../src/platform");
    const before = {
      events: await platform.storage.all(),
      progression: sessionState.getState().progression,
      assessmentCompleted: sessionState.getState().assessmentCompleted,
      settledDayCount: sessionState.getState().settledDayCount,
    };
    await act(async () => root.render(<ChallengePage />));

    expect(container.querySelector('[aria-label="答题区"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="题目提示"]')).not.toBeNull();
    await answerVisibleQuestionCorrectly();
    expect(container.textContent).toContain("成绩已经藏好啦");

    act(() => {
      button("家长长按 2 秒开始").dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true }),
      );
      vi.advanceTimersByTime(2_000);
    });
    await act(async () => Promise.resolve());

    // 家长也答对，但比小朋友多花时间：FIXED_RACE 依用时判小朋友胜。
    act(() => vi.advanceTimersByTime(500));
    await answerVisibleQuestionCorrectly();
    click("一起看结果");
    await act(async () => Promise.resolve());

    expect(container.textContent).toContain("小朋友赢啦！");
    expect(
      isolatedTaro.getStorageSync(ACTIVE_CHALLENGE_KEY),
    ).toBeUndefined();
    expect(isolatedTaro.getStorageSync(LAST_CHALLENGE_RESULT_KEY)).toEqual({
      winner: "CHILD",
      mode: "FIXED_RACE",
      playedAt: expect.any(Number),
    });

    click("再来一局");
    click("下一步");
    click("下一步");
    click("下一步");
    click("小朋友先来");
    expect(sessionState.getState().activeChallenge?.config).toMatchObject({
      mode: "FIXED_RACE",
      tier: "STANDARD",
      dimension: "POEM",
    });
    expect(
      sessionState.getState().activeChallenge?.challengeId,
    ).not.toBe("miniapp-challenge");
    const challengeEvents = (await platform.storage.all()).slice(
      before.events.length,
    );
    expect(challengeEvents.map((event) => event.eventType)).toEqual([
      "CHALLENGE_ANSWER",
      "CHALLENGE_ANSWER",
      "CHALLENGE_COMPLETED",
    ]);
    expect(challengeEvents[0]?.eventId).not.toBe(challengeEvents[1]?.eventId);
    expect(challengeEvents[0]?.payload).toMatchObject({
      context: "CHALLENGE",
      participant: "CHILD",
      questionIndex: 0,
    });
    expect(challengeEvents[1]?.payload).toMatchObject({
      context: "CHALLENGE",
      participant: "PARENT",
      questionIndex: 0,
    });
    expect(isolatedTaro.getStorageSync(RECENT_CHALLENGES_KEY)).toMatchObject({
      version: 1,
      challenges: [
        {
          challengeId: "miniapp-challenge",
          child: { attempts: [expect.objectContaining({ correct: true })] },
          parent: { attempts: [expect.objectContaining({ correct: true })] },
        },
      ],
    });
    expect(sessionState.getState()).toMatchObject({
      progression: before.progression,
      assessmentCompleted: before.assessmentCompleted,
      settledDayCount: before.settledDayCount,
    });
  });

  it("pauses on useDidHide and resumes on useDidShow", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const timed = createChallenge({
      challengeId: "miniapp-timed",
      config: {
        ...fixedConfig,
        mode: "TIMED",
        questionCount: CHALLENGE_QUESTION_COUNT,
      },
      corpus: challengeCorpus,
      nowMs: 0,
    });
    seedActiveChallenge({
      ...timed,
      child: { ...timed.child, activeElapsedMs: 40_000 },
    } as ActiveChallengeSession);
    const { default: ChallengePage } = await import(
      "../src/pages/challenge/index"
    );
    await act(async () => root.render(<ChallengePage />));

    act(() => emitDidHide());
    vi.setSystemTime(30_000);
    act(() => emitDidShow());
    expect(container.textContent).toContain("00:20");
  });

  it("serializes timer and hide transitions while an answer is enqueueing", async () => {
    vi.useFakeTimers();
    let now = 0;
    let finishAppend!: () => void;
    const events: LearningEvent[] = [];
    const queue = new EventQueue({
      append: (event) =>
        new Promise<void>((resolve) => {
          finishAppend = () => {
            events.push(event);
            resolve();
          };
        }),
      pending: async (limit) => events.slice(0, limit),
      ack: async () => undefined,
      all: async () => [...events],
    });
    const timed = createChallenge({
      challengeId: "miniapp-pending-lifecycle",
      config: {
        ...fixedConfig,
        mode: "TIMED",
        durationMs: 1_000,
        questionCount: CHALLENGE_QUESTION_COUNT,
      },
      corpus: challengeCorpus,
      nowMs: 0,
    });
    seedActiveChallenge(timed as ActiveChallengeSession);
    const question = questionForTurn(timed, challengeCorpus);
    const { default: ChallengePage } = await import(
      "../src/pages/challenge/index"
    );
    const sessionState = await import("../src/session-state");

    await act(async () => {
      root.render(
        <ChallengePage queue={queue} clock={{ now: () => now }} />,
      );
      await Promise.resolve();
    });
    now = 100;
    answerPoemFill(question);
    await act(async () => Promise.resolve());

    now = 1_000;
    act(() => vi.advanceTimersByTime(250));
    expect(sessionState.getState().activeChallenge?.phase).toBe("CHILD_TURN");
    act(() => emitDidHide());

    now = 1_500;
    await act(async () => {
      finishAppend();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(sessionState.getState().activeChallenge).toMatchObject({
      phase: "CHILD_TURN",
      paused: true,
      updatedAt: 1_500,
      child: {
        questionIndex: 1,
        attempts: [{ responseTimeMs: 100 }],
      },
    });
  });

  it("keeps a rejected answer paused across a hide and retry delay", async () => {
    vi.useFakeTimers();
    let now = 0;
    let rejectAppend!: () => void;
    const events: LearningEvent[] = [];
    let appendCount = 0;
    const queue = new EventQueue({
      append: (event) => {
        appendCount += 1;
        if (appendCount === 1) {
          return new Promise<void>((_resolve, reject) => {
            rejectAppend = () => reject(new Error("save failed"));
          });
        }
        events.push(event);
        return Promise.resolve();
      },
      pending: async (limit) => events.slice(0, limit),
      ack: async () => undefined,
      all: async () => [...events],
    });
    const timed = createChallenge({
      challengeId: "miniapp-rejected-hidden-answer",
      config: {
        ...fixedConfig,
        mode: "TIMED",
        durationMs: 10_000,
        questionCount: CHALLENGE_QUESTION_COUNT,
      },
      corpus: challengeCorpus,
      nowMs: 0,
    });
    seedActiveChallenge(timed as ActiveChallengeSession);
    const question = questionForTurn(timed, challengeCorpus);
    const { default: ChallengePage } = await import(
      "../src/pages/challenge/index"
    );
    const sessionState = await import("../src/session-state");

    await act(async () => {
      root.render(
        <ChallengePage queue={queue} clock={{ now: () => now }} />,
      );
      await Promise.resolve();
    });
    now = 100;
    answerPoemFill(question);
    await act(async () => Promise.resolve());

    now = 700;
    act(() => emitDidHide());
    expect(sessionState.getState().activeChallenge).toMatchObject({
      paused: true,
      updatedAt: 100,
      child: { activeElapsedMs: 100 },
    });

    now = 1_500;
    await act(async () => {
      rejectAppend();
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => emitDidShow());
    now = 5_000;
    act(() => vi.advanceTimersByTime(1_000));

    expect(container.textContent).toContain("保存失败，请重试");
    expect(sessionState.getState().activeChallenge).toMatchObject({
      paused: true,
      updatedAt: 100,
      child: { activeElapsedMs: 100, attempts: [] },
    });

    click("重试保存");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(sessionState.getState().activeChallenge).toMatchObject({
      paused: false,
      child: {
        activeElapsedMs: 100,
        attempts: [{ responseTimeMs: 100 }],
      },
    });
  });

  it("pauses at answer submission time when leaving during a failed append", async () => {
    let now = 0;
    let rejectAppend!: () => void;
    const queue = new EventQueue({
      append: () =>
        new Promise<void>((_resolve, reject) => {
          rejectAppend = () => reject(new Error("save failed"));
        }),
      pending: async () => [],
      ack: async () => undefined,
      all: async () => [],
    });
    const timed = createChallenge({
      challengeId: "miniapp-rejected-back-answer",
      config: {
        ...fixedConfig,
        mode: "TIMED",
        durationMs: 10_000,
        questionCount: CHALLENGE_QUESTION_COUNT,
      },
      corpus: challengeCorpus,
      nowMs: 0,
    });
    seedActiveChallenge(timed as ActiveChallengeSession);
    const question = questionForTurn(timed, challengeCorpus);
    const { default: ChallengePage } = await import(
      "../src/pages/challenge/index"
    );
    const sessionState = await import("../src/session-state");
    const navigateBack = vi.spyOn(isolatedTaro, "navigateBack");
    await act(async () => {
      root.render(
        <ChallengePage queue={queue} clock={{ now: () => now }} />,
      );
      await Promise.resolve();
    });

    now = 100;
    answerPoemFill(question);
    await act(async () => Promise.resolve());
    now = 700;
    const back = container.querySelector('[aria-label="返回学习路线"]');
    if (!(back instanceof HTMLButtonElement)) {
      throw new Error("back button not found");
    }
    act(() =>
      back.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );

    expect(navigateBack).toHaveBeenCalledWith({ delta: 1 });
    expect(sessionState.getState().activeChallenge).toMatchObject({
      paused: true,
      updatedAt: 100,
      child: { activeElapsedMs: 100 },
    });

    await act(async () => {
      rejectAppend();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(sessionState.getState().activeChallenge).toMatchObject({
      paused: true,
      updatedAt: 100,
      child: { activeElapsedMs: 100, attempts: [] },
    });
  });

  it.each(["resolve", "reject"] as const)(
    "does not let a stale answer %s overwrite a replacement challenge",
    async (outcome) => {
      let resolveAppend!: () => void;
      let rejectAppend!: () => void;
      const events: LearningEvent[] = [];
      const queue = new EventQueue({
        append: (event) =>
          new Promise<void>((resolve, reject) => {
            resolveAppend = () => {
              events.push(event);
              resolve();
            };
            rejectAppend = () => reject(new Error("save failed"));
          }),
        pending: async (limit) => events.slice(0, limit),
        ack: async () => undefined,
        all: async () => [...events],
      });
      const original = createChallenge({
        challengeId: "miniapp-stale-answer",
        config: fixedConfig,
        corpus: challengeCorpus,
        nowMs: 1_000,
      });
      seedActiveChallenge(original as ActiveChallengeSession);
      const question = questionForTurn(original, challengeCorpus);
      const { default: ChallengePage } = await import(
        "../src/pages/challenge/index"
      );
      const sessionState = await import("../src/session-state");
      await act(async () => {
        root.render(
          <ChallengePage queue={queue} clock={{ now: () => 1_500 }} />,
        );
        await Promise.resolve();
      });

      answerPoemFill(question);
      await act(async () => Promise.resolve());
      const replacement = createChallenge({
        challengeId: `miniapp-replacement-${outcome}`,
        config: fixedConfig,
        corpus: challengeCorpus,
        nowMs: 2_000,
      }) as ActiveChallengeSession;
      act(() => sessionState.setActiveChallenge(replacement));

      await act(async () => {
        if (outcome === "resolve") resolveAppend();
        else rejectAppend();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(sessionState.getState().activeChallenge).toMatchObject({
        challengeId: replacement.challengeId,
        child: { attempts: [] },
      });
    },
  );

  it.each(["resolve", "reject"] as const)(
    "does not let a stale completion %s affect a replacement challenge",
    async (outcome) => {
      let settleAppend!: () => void;
      const events: LearningEvent[] = [];
      const queue = new EventQueue({
        append: (event) =>
          new Promise<void>((resolve, reject) => {
            settleAppend = () => {
              if (outcome === "resolve") {
                events.push(event);
                resolve();
              } else {
                reject(new Error("save failed"));
              }
            };
          }),
        pending: async (limit) => events.slice(0, limit),
        ack: async () => undefined,
        all: async () => [...events],
      });
      const original = resultReadyHandoff();
      const replacement = resultReadyHandoff(
        `miniapp-completion-replacement-${outcome}`,
      );
      seedActiveChallenge(original);
      const { default: ChallengePage } = await import(
        "../src/pages/challenge/index"
      );
      const sessionState = await import("../src/session-state");
      await act(async () => {
        root.render(
          <ChallengePage queue={queue} clock={{ now: () => 3_000 }} />,
        );
        await Promise.resolve();
      });

      click("一起看结果");
      await act(async () => Promise.resolve());
      act(() => sessionState.setActiveChallenge(replacement));
      await act(async () => {
        settleAppend();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(sessionState.getState().activeChallenge).toEqual(replacement);
      expect(
        isolatedTaro.getStorageSync(LAST_CHALLENGE_RESULT_KEY),
      ).toBeUndefined();
      expect(container.textContent).not.toContain("小朋友赢啦！");
      expect(container.textContent).not.toContain("保存失败，请重试");
    },
  );

  it("clears a completed challenge failure when a replacement challenge arrives", async () => {
    const original = resultReadyHandoff();
    const replacement = resultReadyHandoff(
      "miniapp-replacement-after-failure",
    );
    seedActiveChallenge(original);
    const queue = new EventQueue({
      append: async () => {
        throw new Error("save failed");
      },
      pending: async () => [],
      ack: async () => undefined,
      all: async () => [],
    });
    const { default: ChallengePage } = await import(
      "../src/pages/challenge/index"
    );
    const sessionState = await import("../src/session-state");
    await act(async () => {
      root.render(
        <ChallengePage queue={queue} clock={{ now: () => Date.now() }} />,
      );
      await Promise.resolve();
    });

    click("一起看结果");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("保存失败，请重试");

    await act(async () => {
      sessionState.setActiveChallenge(replacement);
      await Promise.resolve();
    });

    expect(sessionState.getState().activeChallenge).toEqual(replacement);
    expect(container.textContent).not.toContain("保存失败，请重试");
  });

  it("clears a completed result when a replacement challenge arrives", async () => {
    const original = resultReadyHandoff();
    const now = Date.now();
    seedActiveChallenge(original);
    const recorded = recordingQueue();
    const { default: ChallengePage } = await import(
      "../src/pages/challenge/index"
    );
    const sessionState = await import("../src/session-state");
    await act(async () => {
      root.render(
        <ChallengePage queue={recorded.queue} clock={{ now: () => now }} />,
      );
      await Promise.resolve();
    });

    click("一起看结果");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("小朋友赢啦！");

    const replacement = createChallenge({
      challengeId: "miniapp-replacement-after-result",
      config: fixedConfig,
      corpus: challengeCorpus,
      nowMs: 4_000,
    }) as ActiveChallengeSession;
    await act(async () => {
      sessionState.setActiveChallenge(replacement);
      await Promise.resolve();
    });

    expect(sessionState.getState().activeChallenge).toMatchObject({
      challengeId: replacement.challengeId,
    });
    expect(container.textContent).not.toContain("小朋友赢啦！");
    expect(container.querySelector('[aria-label="答题区"]')).not.toBeNull();
  });

  it("restores the same question when first shown with a paused answer turn", async () => {
    const active = createChallenge({
      challengeId: "miniapp-paused-on-load",
      config: fixedConfig,
      corpus: challengeCorpus,
      nowMs: 0,
    });
    // POEM_FILL 的 correctAnswer 是序列化串（不直接渲染），改用题面诗句作为
    // 恢复同一题的可见标识。
    const restoredQuestion = questionForTurn(active, challengeCorpus);
    const expectedLine = restoredQuestion.displayLines![0]!;
    seedActiveChallenge(
      pauseChallenge(active, 100) as ActiveChallengeSession,
    );
    const { default: ChallengePage } = await import(
      "../src/pages/challenge/index"
    );

    await act(async () => root.render(<ChallengePage />));
    expect(container.textContent).toContain("重试题目");

    act(() => emitDidShow());

    expect(container.textContent).toContain(expectedLine);
    expect(container.textContent).not.toContain("重试题目");
  });

  it("redirects home without a source or active session", async () => {
    const redirect = vi.spyOn(isolatedTaro, "redirectTo");
    const { default: ChallengePage } = await import(
      "../src/pages/challenge/index"
    );

    await act(async () => {
      root.render(<ChallengePage />);
      await Promise.resolve();
    });

    expect(redirect).toHaveBeenCalledWith({ url: "/pages/home/index" });
  });

  it("restores pending wrong feedback without counting it twice", async () => {
    const child = createChallenge({
      challengeId: "miniapp-pending",
      config: fixedConfig,
      corpus: challengeCorpus,
      nowMs: 0,
    });
    const question = questionForTurn(child, challengeCorpus);
    const wrong = question.options.find(
      (option) => option !== question.correctAnswer,
    )!;
    seedActiveChallenge(
      submitChallengeAnswer(
        child,
        wrong,
        challengeCorpus,
        100,
      ) as ActiveChallengeSession,
    );
    const { default: ChallengePage } = await import(
      "../src/pages/challenge/index"
    );
    const { platform } = await import("../src/platform");
    const eventsBefore = await platform.storage.all();
    await act(async () => root.render(<ChallengePage />));

    expect(container.querySelector('[aria-label="答题区"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="题目提示"]')).not.toBeNull();
    expect(container.textContent).toContain("正确答案");
    click("我记住啦");
    await act(async () => Promise.resolve());
    const sessionState = await import("../src/session-state");
    expect(
      sessionState.getState().activeChallenge?.child.answeredCount,
    ).toBe(1);
    expect(await platform.storage.all()).toEqual(eventsBefore);
  });

  it("keeps result-ready handoff when compact persistence fails", async () => {
    const ready = resultReadyHandoff();
    seedActiveChallenge(ready);
    const original = isolatedTaro.setStorageSync.bind(isolatedTaro);
    let dropCompactWrite = true;
    vi.spyOn(isolatedTaro, "setStorageSync").mockImplementation(
      (key, value) => {
        if (key === LAST_CHALLENGE_RESULT_KEY && dropCompactWrite) {
          dropCompactWrite = false;
          return;
        }
        original(key, value);
      },
    );
    const { default: ChallengePage } = await import(
      "../src/pages/challenge/index"
    );
    await act(async () => root.render(<ChallengePage />));

    click("一起看结果");
    await act(async () => Promise.resolve());
    const sessionState = await import("../src/session-state");
    const { platform } = await import("../src/platform");
    expect(sessionState.getState().activeChallenge).toEqual(ready);
    expect(container.textContent).not.toContain("小朋友赢啦！");
    expect(container.textContent).toContain("保存失败，请重试");

    click("一起看结果");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(sessionState.getState().activeChallenge).toBeNull();
    expect(container.textContent).toContain("小朋友赢啦！");
    expect(
      (await platform.storage.all()).filter(
        (event) =>
          event.sessionId === ready.challengeId &&
          event.eventType === "CHALLENGE_COMPLETED",
      ),
    ).toHaveLength(1);
  });

  it("keeps result-ready handoff when clearing the active snapshot fails", async () => {
    const ready = resultReadyHandoff();
    seedActiveChallenge(ready);
    const original = isolatedTaro.removeStorageSync.bind(isolatedTaro);
    let dropActiveRemoval = true;
    vi.spyOn(isolatedTaro, "removeStorageSync").mockImplementation((key) => {
      if (key === ACTIVE_CHALLENGE_KEY && dropActiveRemoval) {
        dropActiveRemoval = false;
        return;
      }
      original(key);
    });
    const { default: ChallengePage } = await import(
      "../src/pages/challenge/index"
    );
    await act(async () => root.render(<ChallengePage />));

    click("一起看结果");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const sessionState = await import("../src/session-state");
    expect(sessionState.getState().activeChallenge).toEqual(ready);
    expect(container.textContent).toContain("保存失败，请重试");

    click("一起看结果");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const { platform } = await import("../src/platform");
    expect(sessionState.getState().activeChallenge).toBeNull();
    expect(
      (await platform.storage.all()).filter(
        (event) =>
          event.sessionId === ready.challengeId &&
          event.eventType === "CHALLENGE_COMPLETED",
      ),
    ).toHaveLength(1);
  });
});
