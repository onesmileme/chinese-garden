// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  EventQueue,
  LAST_CHALLENGE_RESULT_KEY,
  SnapshotRecentChallengeStore,
  type ActiveChallengeSession,
  type EventStore,
  type LearningEvent,
  type SnapshotStorage,
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
  type Corpus,
  type GeneratedQuestion,
} from "@cc/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChallengePage } from "../src/pages/ChallengePage";
import {
  CONTENT_VERSION,
  sessionState,
} from "../src/session-state";

let container: HTMLDivElement;
let root: Root;

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

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function click(label: string): void {
  const match = [...container.querySelectorAll("button")].find(
    (candidate) =>
      candidate.getAttribute("aria-label") === label ||
      candidate.textContent === label,
  );
  if (!(match instanceof HTMLButtonElement)) {
    throw new Error(`button not found: ${label}`);
  }
  act(() => match.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function exactButton(label: string): HTMLButtonElement {
  const match = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!(match instanceof HTMLButtonElement)) {
    throw new Error(`button not found: ${label}`);
  }
  return match;
}

// 组装并提交题目的正确答案。诗词填空与成语接龙需要逐字点选候选，
// 单选题（连连看/释义）直接点击对应选项按钮。
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
      act(() =>
        candidate.dispatchEvent(new MouseEvent("click", { bubbles: true })),
      );
      const slot = container.querySelector(
        `button[aria-label="空缺${position + 1}"]`,
      );
      if (!(slot instanceof HTMLButtonElement)) {
        throw new Error(`blank button not found: ${position + 1}`);
      }
      act(() =>
        slot.dispatchEvent(new MouseEvent("click", { bubbles: true })),
      );
    });
    act(() =>
      exactButton("确定").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      ),
    );
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
      act(() =>
        candidate.dispatchEvent(new MouseEvent("click", { bubbles: true })),
      );
    });
    return;
  }
  click(question.correctAnswer);
}

// 组装并提交一个确定错误的答案，返回提交串供错误反馈流程复用。
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
      act(() =>
        candidate.dispatchEvent(new MouseEvent("click", { bubbles: true })),
      );
    });
    return wrong;
  }
  const wrongAnswer = question.options.find(
    (option) => option !== question.correctAnswer,
  );
  if (wrongAnswer === undefined) {
    throw new Error("question has no wrong option");
  }
  click(wrongAnswer);
  return wrongAnswer;
}

function sparsePoemChallengeCorpus(): Corpus {
  // 家长半场如今会向下兜底遍历全部难度带,故要触发"题库不足"须让全语料
  // 可出题的诗词总数少于 10;这里仅保留 5 首,凑不满一轮固定赛。
  const keptPoems = new Set(
    challengeCorpus.poems.slice(0, 5).map((poem) => poem.id),
  );
  return {
    ...challengeCorpus,
    poems: challengeCorpus.poems.filter((poem) => keptPoems.has(poem.id)),
  };
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

function memoryStorage(): SnapshotStorage {
  const values = new Map<string, unknown>();
  return {
    read: <T,>(key: string) => (values.get(key) as T | undefined) ?? null,
    write: <T,>(key: string, value: T) => void values.set(key, value),
    remove: (key) => void values.delete(key),
  };
}

function withContentSelection(
  session: ReturnType<typeof createChallenge>,
): ActiveChallengeSession {
  return {
    ...session,
    contentSelection: {
      childProfileId: "debug-child",
      authentication: "GUEST",
      version: session.config.contentVersion,
      abilityLevel: session.config.abilityLevel,
    },
  } as ActiveChallengeSession;
}

function resultReadyHandoff(
  challengeId = "playground-result-ready",
): ActiveChallengeSession {
  const child = createChallenge({
    challengeId,
    config: {
      mode: "FIXED_RACE",
      tier: "STANDARD",
      dimension: "IDIOM",
      childDifficulty: 1,
      abilityLevel: 5,
      durationMs: CHALLENGE_DURATION_MS,
      questionCount: 1,
      contentVersion: CONTENT_VERSION,
      ruleVersion: CHALLENGE_RULE_VERSION,
    },
    corpus: challengeCorpus,
    nowMs: 1_000,
  });
  const answeredChild = submitChallengeAnswer(
    child,
    questionForTurn(child, challengeCorpus).correctAnswer,
    challengeCorpus,
    1_200,
  );
  const parent = continueHandoff(answeredChild, 1_500);
  const parentQuestion = questionForTurn(parent, challengeCorpus);
  const wrongAnswer = parentQuestion.options.find(
    (option) => option !== parentQuestion.correctAnswer,
  )!;
  const pending = submitChallengeAnswer(
    parent,
    wrongAnswer,
    challengeCorpus,
    1_800,
  );
  return withContentSelection(
    confirmWrongFeedback(pending, challengeCorpus, 2_000),
  );
}

describe("ChallengePage", () => {
  beforeEach(() => {
    window.location.hash = "#/challenge";
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    sessionState.setActiveChallenge(
      createChallenge({
        challengeId: "playground-active-question",
        config: {
          mode: "FIXED_RACE",
          tier: "STANDARD",
          dimension: "IDIOM",
          childDifficulty: 1,
          abilityLevel: 5,
          durationMs: CHALLENGE_DURATION_MS,
          questionCount: CHALLENGE_QUESTION_COUNT,
          contentVersion: CONTENT_VERSION,
          ruleVersion: CHALLENGE_RULE_VERSION,
        },
        corpus: challengeCorpus,
        nowMs: 1_000,
      }) as ActiveChallengeSession,
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    sessionState.clearChallengeProgress();
  });

  it("uses the shared question stage for an active answer turn", () => {
    act(() => root.render(<ChallengePage />));

    expect(
      container.querySelector('[data-question-stage="true"]'),
    ).not.toBeNull();
    expect(container.querySelector('[aria-label="题目提示"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="学习状态"]')).toBeNull();
    expect(container.textContent).toContain("小朋友加油");
    expect(container.textContent).toContain("1 / 10");
  });

  it("restores the same question when a paused answer turn becomes visible", () => {
    const active = sessionState.getState().activeChallenge!;
    const expectedPrompt = questionForTurn(active, challengeCorpus).prompt;
    sessionState.setActiveChallenge(
      pauseChallenge(active, 1_000) as ActiveChallengeSession,
    );

    act(() => root.render(<ChallengePage />));
    expect(container.textContent).toContain("重试题目");

    act(() => document.dispatchEvent(new Event("visibilitychange")));

    expect(container.textContent).toContain(expectedPrompt);
    expect(container.textContent).not.toContain("重试题目");
  });

  it("shows the timed turn's unique deck capacity", () => {
    const timed = createChallenge({
      challengeId: "playground-timed-capacity",
      config: {
        mode: "TIMED",
        tier: "STANDARD",
        dimension: "IDIOM",
        childDifficulty: 1,
        abilityLevel: 5,
        durationMs: CHALLENGE_DURATION_MS,
        questionCount: CHALLENGE_QUESTION_COUNT,
        contentVersion: CONTENT_VERSION,
        ruleVersion: CHALLENGE_RULE_VERSION,
      },
      corpus: challengeCorpus,
      nowMs: 1_000,
    });
    sessionState.setActiveChallenge(timed as ActiveChallengeSession);

    act(() => root.render(<ChallengePage />));

    expect(renderedHeader.total).toBe(
      challengeTurnQuestionCount(timed, challengeCorpus),
    );
  });

  it("stores the version paired with injected challenge content", () => {
    const contentVersion = "injected-corpus-v1";
    sessionState.clearChallengeProgress();
    sessionState.saveCurrentChallengeSource({
      childDifficulty: 1,
      contentVersion,
      updatedAt: 1,
    });

    act(() =>
      root.render(
        <ChallengePage
          content={{ corpus: challengeCorpus, contentVersion }}
        />,
      ),
    );
    click("下一步");
    click("下一步：进入准备");
    click("完成设置，前往对战");
    click("小朋友先来");

    expect(
      sessionState.getState().activeChallenge?.config.contentVersion,
    ).toBe(contentVersion);
  });

  it("shows the fixed-race capacity error without creating a session", () => {
    sessionState.clearChallengeProgress();
    sessionState.saveCurrentChallengeSource({
      childDifficulty: 1,
      contentVersion: CONTENT_VERSION,
      updatedAt: 1,
    });
    act(() =>
      root.render(
        <ChallengePage
          content={{
            corpus: sparsePoemChallengeCorpus(),
            contentVersion: "test-sparse-v1",
          }}
        />,
      ),
    );

    click("下一步");
    click("固定题量竞速");
    click("下一步：进入准备");
    click("完成设置，前往对战");
    click("小朋友先来");

    expect(container.textContent).toContain("当前题库不足 10 道不重复题");
    expect(sessionState.getState().activeChallenge).toBeNull();
  });

  it.each(["CHILD", "PARENT"] as const)(
    "records one %s challenge answer before updating the active snapshot",
    async (participant) => {
      const recorded = recordingQueue();
      const childTurn = createChallenge({
        challengeId: `playground-${participant.toLowerCase()}-answer`,
        config: {
          mode: "FIXED_RACE",
          tier: "STANDARD",
          dimension: "IDIOM",
          childDifficulty: 1,
          abilityLevel: 5,
          durationMs: CHALLENGE_DURATION_MS,
          questionCount: 1,
          contentVersion: CONTENT_VERSION,
          ruleVersion: CHALLENGE_RULE_VERSION,
        },
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
      sessionState.setActiveChallenge(withContentSelection(turn));
      const question = questionForTurn(turn, challengeCorpus);

      await act(async () => {
        root.render(
          <ChallengePage
            queue={recorded.queue}
            clock={{ now: () => 2_000 }}
          />,
        );
        await Promise.resolve();
      });
      answerCorrectly(question);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(recorded.events).toHaveLength(1);
      expect(recorded.events[0]).toMatchObject({
        childProfileId: "debug-child",
        deviceId: "playground-browser",
        sessionId: turn.challengeId,
        eventType: "CHALLENGE_ANSWER",
        clientSequence: 0,
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
          firstAttempt: true,
          hintCount: 0,
          responseTimeMs: participant === "CHILD" ? 1_000 : 500,
          challenge: {
            challengeId: turn.challengeId,
            dimension: "IDIOM",
            participantDifficulty: participant === "CHILD" ? 1 : 4,
          },
        },
      });
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

  it("freezes the first answer timestamp and response across an append retry", async () => {
    const recorded = recordingQueue(1);
    let now = 1_500;
    const current = sessionState.getState().activeChallenge!;
    sessionState.setActiveChallenge(withContentSelection(current));
    const question = questionForTurn(current, challengeCorpus);

    await act(async () => {
      root.render(
        <ChallengePage
          queue={recorded.queue}
          clock={{ now: () => now }}
        />,
      );
      await Promise.resolve();
    });
    answerCorrectly(question);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("保存失败，请重试");

    now = 9_000;
    click("重试保存");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(recorded.attemptedEvents).toHaveLength(2);
    expect(recorded.attemptedEvents.map((event) => event.occurredAt)).toEqual([
      1_500,
      1_500,
    ]);
    expect(
      recorded.attemptedEvents.map((event) =>
        event.eventType === "CHALLENGE_ANSWER"
          ? event.payload.responseTimeMs
          : null,
      ),
    ).toEqual([500, 500]);
    expect(
      sessionState.getState().activeChallenge?.child.attempts[0],
    ).toMatchObject({
      submittedAnswer: question.correctAnswer,
      responseTimeMs: 500,
    });
  });

  it("serializes timer and hidden transitions while an answer is enqueueing", async () => {
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
      challengeId: "playground-pending-lifecycle",
      config: {
        mode: "TIMED",
        tier: "STANDARD",
        dimension: "IDIOM",
        childDifficulty: 1,
        abilityLevel: 5,
        durationMs: 1_000,
        questionCount: CHALLENGE_QUESTION_COUNT,
        contentVersion: CONTENT_VERSION,
        ruleVersion: CHALLENGE_RULE_VERSION,
      },
      corpus: challengeCorpus,
      nowMs: 0,
    });
    sessionState.setActiveChallenge(withContentSelection(timed));
    const question = questionForTurn(timed, challengeCorpus);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");

    await act(async () => {
      root.render(
        <ChallengePage queue={queue} clock={{ now: () => now }} />,
      );
      await Promise.resolve();
    });
    now = 100;
    answerCorrectly(question);
    await act(async () => Promise.resolve());

    now = 1_000;
    act(() => vi.advanceTimersByTime(250));
    expect(sessionState.getState().activeChallenge?.phase).toBe("CHILD_TURN");
    act(() => document.dispatchEvent(new Event("visibilitychange")));

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
      challengeId: "playground-rejected-hidden-answer",
      config: {
        mode: "TIMED",
        tier: "STANDARD",
        dimension: "IDIOM",
        childDifficulty: 1,
        abilityLevel: 5,
        durationMs: 10_000,
        questionCount: CHALLENGE_QUESTION_COUNT,
        contentVersion: CONTENT_VERSION,
        ruleVersion: CHALLENGE_RULE_VERSION,
      },
      corpus: challengeCorpus,
      nowMs: 0,
    });
    sessionState.setActiveChallenge(withContentSelection(timed));
    const question = questionForTurn(timed, challengeCorpus);
    let visibility: DocumentVisibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(
      () => visibility,
    );

    await act(async () => {
      root.render(
        <ChallengePage queue={queue} clock={{ now: () => now }} />,
      );
      await Promise.resolve();
    });
    now = 100;
    answerCorrectly(question);
    await act(async () => Promise.resolve());

    now = 700;
    visibility = "hidden";
    act(() => document.dispatchEvent(new Event("visibilitychange")));
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
    visibility = "visible";
    act(() => document.dispatchEvent(new Event("visibilitychange")));
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
      challengeId: "playground-rejected-back-answer",
      config: {
        mode: "TIMED",
        tier: "STANDARD",
        dimension: "IDIOM",
        childDifficulty: 1,
        abilityLevel: 5,
        durationMs: 10_000,
        questionCount: CHALLENGE_QUESTION_COUNT,
        contentVersion: CONTENT_VERSION,
        ruleVersion: CHALLENGE_RULE_VERSION,
      },
      corpus: challengeCorpus,
      nowMs: 0,
    });
    sessionState.setActiveChallenge(withContentSelection(timed));
    const question = questionForTurn(timed, challengeCorpus);
    await act(async () => {
      root.render(
        <ChallengePage queue={queue} clock={{ now: () => now }} />,
      );
      await Promise.resolve();
    });

    now = 100;
    answerCorrectly(question);
    await act(async () => Promise.resolve());
    now = 700;
    const back = container.querySelector('[aria-label="返回学习路线"]');
    if (!(back instanceof HTMLButtonElement)) {
      throw new Error("back button not found");
    }
    act(() =>
      back.dispatchEvent(new MouseEvent("click", { bubbles: true })),
    );

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
      const original = sessionState.getState().activeChallenge!;
      sessionState.setActiveChallenge(withContentSelection(original));
      const question = questionForTurn(original, challengeCorpus);
      await act(async () => {
        root.render(
          <ChallengePage queue={queue} clock={{ now: () => 1_500 }} />,
        );
        await Promise.resolve();
      });

      answerCorrectly(question);
      await act(async () => Promise.resolve());
      const replacement = withContentSelection(
        createChallenge({
          challengeId: `playground-replacement-${outcome}`,
          config: original.config,
          corpus: challengeCorpus,
          nowMs: 2_000,
        }),
      );
      act(() => sessionState.setActiveChallenge(replacement));

      await act(async () => {
        if (outcome === "resolve") resolveAppend();
        else rejectAppend();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(sessionState.getState().activeChallenge).toEqual(replacement);
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
        `playground-completion-replacement-${outcome}`,
      );
      localStorage.removeItem(LAST_CHALLENGE_RESULT_KEY);
      sessionState.setActiveChallenge(original);
      await act(async () => {
        root.render(
          <ChallengePage
            queue={queue}
            clock={{ now: () => 3_000 }}
            recentChallenges={
              new SnapshotRecentChallengeStore(memoryStorage(), {
                now: () => 3_000,
              })
            }
          />,
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
      expect(localStorage.getItem(LAST_CHALLENGE_RESULT_KEY)).toBeNull();
      expect(container.textContent).not.toContain("小朋友赢啦！");
      expect(container.textContent).not.toContain("保存失败，请重试");
    },
  );

  it("clears a completed challenge failure when a replacement challenge arrives", async () => {
    const original = resultReadyHandoff();
    const replacement = resultReadyHandoff(
      "playground-replacement-after-failure",
    );
    sessionState.setActiveChallenge(original);
    await act(async () => {
      root.render(
        <ChallengePage
          queue={recordingQueue(1).queue}
          clock={{ now: () => 3_000 }}
          recentChallenges={
            new SnapshotRecentChallengeStore(memoryStorage(), {
              now: () => 3_000,
            })
          }
        />,
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
    const replacement = withContentSelection(
      createChallenge({
        challengeId: "playground-replacement-after-result",
        config: original.config,
        corpus: challengeCorpus,
        nowMs: 4_000,
      }),
    );
    sessionState.setActiveChallenge(original);
    await act(async () => {
      root.render(
        <ChallengePage
          queue={recordingQueue().queue}
          clock={{ now: () => 3_000 }}
          recentChallenges={
            new SnapshotRecentChallengeStore(memoryStorage(), {
              now: () => 3_000,
            })
          }
        />,
      );
      await Promise.resolve();
    });

    click("一起看结果");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("小朋友赢啦！");

    await act(async () => {
      sessionState.setActiveChallenge(replacement);
      await Promise.resolve();
    });

    expect(sessionState.getState().activeChallenge).toEqual(replacement);
    expect(container.textContent).not.toContain("小朋友赢啦！");
    expect(
      container.querySelector('[data-question-stage="true"]'),
    ).not.toBeNull();
  });

  it("retries completion persistence in order without duplicating the event", async () => {
    const ready = resultReadyHandoff();
    const recorded = recordingQueue(1);
    let currentTime = 3_000;
    const recentChallenges = new SnapshotRecentChallengeStore(
      memoryStorage(),
      { now: () => currentTime },
    );
    localStorage.removeItem(LAST_CHALLENGE_RESULT_KEY);
    sessionState.setActiveChallenge(ready);
    await act(async () => {
      root.render(
        <ChallengePage
          queue={recorded.queue}
            clock={{ now: () => currentTime }}
          recentChallenges={recentChallenges}
        />,
      );
      await Promise.resolve();
    });

    click("一起看结果");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(sessionState.getState().activeChallenge).toEqual(ready);
    expect(recentChallenges.all()).toEqual([]);
    expect(localStorage.getItem(LAST_CHALLENGE_RESULT_KEY)).toBeNull();
    expect(container.textContent).toContain("保存失败，请重试");

    currentTime = 5_000;
    click("一起看结果");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(recorded.events).toHaveLength(1);
    expect(recorded.attemptedEvents).toHaveLength(2);
    expect(recorded.attemptedEvents[0]?.eventId).toBe(
      recorded.attemptedEvents[1]?.eventId,
    );
    expect(recorded.events[0]).toMatchObject({
      childProfileId: "debug-child",
      deviceId: "playground-browser",
      sessionId: ready.challengeId,
      eventType: "CHALLENGE_COMPLETED",
      contentVersion: CONTENT_VERSION,
      ruleVersion: CHALLENGE_RULE_VERSION,
      payload: {
        challengeId: ready.challengeId,
        dimension: "IDIOM",
        startedAt: 1_000,
        completedAt: 3_000,
        child: { answeredCount: 1, correctCount: 1 },
        parent: { answeredCount: 1, correctCount: 0 },
      },
    });
    expect(recentChallenges.all()[0]).toMatchObject({
      challengeId: ready.challengeId,
      completedAt: 3_000,
      child: { attempts: ready.child.attempts },
      parent: { attempts: ready.parent.attempts },
    });
    expect(sessionState.getState().activeChallenge).toBeNull();
    expect(JSON.parse(localStorage.getItem(LAST_CHALLENGE_RESULT_KEY)!)).toEqual({
      winner: "CHILD",
      mode: "FIXED_RACE",
      playedAt: 3_000,
    });
    expect(container.textContent).toContain("小朋友赢啦！");

    await act(async () => root.render(<ChallengePage />));
    expect(recorded.events).toHaveLength(1);
  });

  it("keeps the result handoff when recent history is not persisted", async () => {
    const ready = resultReadyHandoff();
    const recorded = recordingQueue();
    const storage = memoryStorage();
    const write = storage.write.bind(storage);
    let dropNextWrite = true;
    storage.write = <T,>(key: string, value: T) => {
      if (dropNextWrite) {
        dropNextWrite = false;
        return;
      }
      write(key, value);
    };
    const recentChallenges = new SnapshotRecentChallengeStore(storage, {
      now: () => 3_000,
    });
    localStorage.removeItem(LAST_CHALLENGE_RESULT_KEY);
    sessionState.setActiveChallenge(ready);
    await act(async () => {
      root.render(
        <ChallengePage
          queue={recorded.queue}
          clock={{ now: () => 3_000 }}
          recentChallenges={recentChallenges}
        />,
      );
      await Promise.resolve();
    });

    click("一起看结果");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(recorded.events).toHaveLength(1);
    expect(recentChallenges.all()).toEqual([]);
    expect(sessionState.getState().activeChallenge).toEqual(ready);
    expect(localStorage.getItem(LAST_CHALLENGE_RESULT_KEY)).toBeNull();

    click("一起看结果");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(recorded.events).toHaveLength(1);
    expect(recorded.attemptedEvents).toHaveLength(1);
    expect(recentChallenges.all()).toHaveLength(1);
    expect(sessionState.getState().activeChallenge).toBeNull();
  });

  it("confirms restored wrong feedback without recording another answer", async () => {
    const recorded = recordingQueue();
    const child = createChallenge({
      challengeId: "playground-restored-wrong",
      config: {
        mode: "FIXED_RACE",
        tier: "STANDARD",
        dimension: "IDIOM",
        childDifficulty: 1,
        abilityLevel: 5,
        durationMs: CHALLENGE_DURATION_MS,
        questionCount: 2,
        contentVersion: CONTENT_VERSION,
        ruleVersion: CHALLENGE_RULE_VERSION,
      },
      corpus: challengeCorpus,
      nowMs: 1_000,
    });
    const question = questionForTurn(child, challengeCorpus);
    const wrongAnswer = question.options.find(
      (option) => option !== question.correctAnswer,
    )!;
    sessionState.setActiveChallenge(
      withContentSelection(
        submitChallengeAnswer(
          child,
          wrongAnswer,
          challengeCorpus,
          1_500,
        ),
      ),
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

    click("我记住啦");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(recorded.events).toEqual([]);
    expect(sessionState.getState().activeChallenge?.child).toMatchObject({
      answeredCount: 1,
      questionIndex: 1,
      attempts: [{ submittedAnswer: wrongAnswer, correct: false }],
    });
  });
});
