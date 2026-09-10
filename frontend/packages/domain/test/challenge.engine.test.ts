import type {
  Character,
  ContentLevel,
  ContentMetadata,
  Idiom,
} from "@cc/content-schema";
import { asKnowledgePointId } from "@cc/content-schema";
import { describe, expect, it } from "vitest";
import {
  buildChallengeDeck,
  challengeTurnQuestionCount,
  confirmWrongFeedback,
  continueHandoff,
  createChallenge,
  finishExpiredTurn,
  pauseChallenge,
  questionForTurn,
  remainingTurnMs,
  resumeChallenge,
  submitChallengeAnswer,
  type ChineseChallengeConfig,
  type Corpus,
  type CreateChallengeInput,
} from "../src";

function withActiveMetadata<T extends { difficulty: ContentLevel }>(
  item: T,
): T & ContentMetadata {
  return {
    ...item,
    level: item.difficulty,
    promotionRequired: true,
    status: "ACTIVE",
    tags: [],
    revision: 1,
  };
}

function character(
  id: string,
  char: string,
  pinyin: string,
  difficulty: ContentLevel,
): Character {
  return withActiveMetadata({
    id: asKnowledgePointId(id),
    char,
    pinyin,
    imageId: `img-${char}`,
    theme: "nature",
    strokes: 6,
    difficulty,
  });
}

function idiom(
  id: string,
  text: string,
  head: string,
  tail: string,
  difficulty: 1 | 2 | 3 | 4 | 5,
): Idiom {
  return withActiveMetadata({
    id: asKnowledgePointId(id),
    text,
    meaning: "释义",
    headPinyin: head,
    tailPinyin: tail,
    difficulty,
  });
}

// IDIOM dimension keeps generation simple: correctAnswer is the successor text.
const corpus: Corpus = {
  characters: [
    character("hz-yue", "月", "yuè", 1),
    character("hz-guang", "光", "guāng", 1),
    character("hz-shan", "山", "shān", 3),
    character("hz-shui", "水", "shuǐ", 3),
    character("hz-huo", "火", "huǒ", 3),
    character("hz-tu", "土", "tǔ", 3),
  ],
  poems: [],
  idioms: [
    idiom("cy-yi", "一心一意", "yi", "yi", 1),
    idiom("cy-yiqi", "意气风发", "yi", "fa", 1),
    idiom("cy-fayang", "发扬光大", "fa", "da", 1),
    idiom("cy-cheng", "成千上万", "cheng", "wan", 3),
    idiom("cy-wan", "万众一心", "wan", "xin", 3),
    idiom("cy-xin", "心想事成", "xin", "cheng", 3),
    idiom("cy-yueming", "月明星稀", "yue", "xi", 4),
    idiom("cy-xiqi", "喜气洋洋", "xi", "yang", 4),
    idiom("cy-yangmei", "扬眉吐气", "yang", "qi", 4),
    idiom("cy-hutou", "虎头虎脑", "hu", "nao", 5),
    idiom("cy-naoxiu", "恼羞成怒", "nao", "nu", 5),
    idiom("cy-nuqi", "怒气冲冲", "nu", "chong", 5),
  ],
};

function config(
  overrides: Partial<ChineseChallengeConfig>,
): ChineseChallengeConfig {
  return {
    mode: "FIXED_RACE",
    tier: "STANDARD",
    dimension: "IDIOM",
    childDifficulty: 1,
    abilityLevel: 5,
    durationMs: 60_000,
    questionCount: 1,
    contentVersion: "corpus-v4",
    ruleVersion: "challenge-v1",
    ...overrides,
  };
}

function input(
  overrides: Partial<ChineseChallengeConfig>,
): CreateChallengeInput {
  return {
    challengeId: "challenge-1",
    config: config(overrides),
    corpus,
    nowMs: 0,
  };
}

const wrong = "错误答案";

describe("challenge engine", () => {
  it("sets startedAt from nowMs", () => {
    const startedAt = 1_000;
    const started = createChallenge({
      ...input({ questionCount: 2 }),
      nowMs: startedAt,
    });

    expect(started.startedAt).toBe(startedAt);
  });

  it("preserves startedAt through every session transition", () => {
    const startedAt = 1_000;
    const started = createChallenge({
      ...input({ questionCount: 2 }),
      nowMs: startedAt,
    });
    const afterCorrect = submitChallengeAnswer(
      started,
      questionForTurn(started, corpus).correctAnswer,
      corpus,
      1_100,
    );
    expect(afterCorrect.startedAt).toBe(startedAt);

    const paused = pauseChallenge(afterCorrect, 1_200);
    expect(paused.startedAt).toBe(startedAt);
    const resumed = resumeChallenge(paused, 1_300);
    expect(resumed.startedAt).toBe(startedAt);

    const pendingWrong = submitChallengeAnswer(resumed, wrong, corpus, 1_400);
    expect(pendingWrong.startedAt).toBe(startedAt);
    const childHandoff = confirmWrongFeedback(
      pendingWrong,
      corpus,
      1_500,
    );
    expect(childHandoff.startedAt).toBe(startedAt);

    let parent = continueHandoff(childHandoff, 1_600);
    expect(parent.startedAt).toBe(startedAt);
    for (let index = 0; index < 2; index++) {
      parent = submitChallengeAnswer(
        parent,
        questionForTurn(parent, corpus).correctAnswer,
        corpus,
        1_700 + index * 100,
      );
      expect(parent.startedAt).toBe(startedAt);
    }
    const result = continueHandoff(parent, 2_000);
    expect(result.startedAt).toBe(startedAt);

    const timed = createChallenge({
      ...input({ mode: "TIMED" }),
      nowMs: startedAt,
    });
    expect(finishExpiredTurn(timed, startedAt + 60_000).startedAt).toBe(
      startedAt,
    );
  });

  it("reports the effective question count for fixed and timed turns", () => {
    const fixed = createChallenge(input({ questionCount: 4 }));
    const timed = createChallenge(input({ mode: "TIMED" }));

    expect(challengeTurnQuestionCount(fixed, corpus)).toBe(4);
    expect(challengeTurnQuestionCount(timed, corpus)).toBe(
      buildChallengeDeck(
        timed.challengeId,
        timed.config,
        "CHILD",
        corpus,
      ).length,
    );
  });

  it("does not repeat a knowledge point in a fixed turn", () => {
    let session = createChallenge(input({ questionCount: 4 }));
    const ids: string[] = [];

    while (session.phase === "CHILD_TURN") {
      const question = questionForTurn(session, corpus);
      ids.push(question.knowledgePointId);
      session = submitChallengeAnswer(
        session,
        question.correctAnswer,
        corpus,
        session.updatedAt + 1,
      );
    }

    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
  });

  it("finishes a timed turn when its unique deck is exhausted", () => {
    const started = createChallenge(input({ mode: "TIMED" }));
    const capacity = challengeTurnQuestionCount(started, corpus);
    let session = started;

    for (let index = 0; index < capacity; index++) {
      const question = questionForTurn(session, corpus);
      session = submitChallengeAnswer(
        session,
        question.correctAnswer,
        corpus,
        index + 1,
      );
    }

    expect(session).toMatchObject({
      phase: "HANDOFF",
      handoffTarget: "PARENT_TURN",
    });
  });

  it("finishes an exhausted timed turn after wrong feedback confirmation", () => {
    let session = createChallenge(input({ mode: "TIMED" }));
    const capacity = challengeTurnQuestionCount(session, corpus);

    for (let index = 0; index < capacity - 1; index++) {
      const question = questionForTurn(session, corpus);
      session = submitChallengeAnswer(
        session,
        question.correctAnswer,
        corpus,
        index + 1,
      );
    }

    const pending = submitChallengeAnswer(
      session,
      wrong,
      corpus,
      capacity,
    );
    expect(
      confirmWrongFeedback(pending, corpus, capacity + 1).phase,
    ).toBe("HANDOFF");
  });

  it("rejects a question lookup after deck exhaustion", () => {
    const started = createChallenge(input({ mode: "TIMED" }));
    const capacity = challengeTurnQuestionCount(started, corpus);
    const exhausted = {
      ...started,
      child: { ...started.child, questionIndex: capacity },
    };

    expect(() => questionForTurn(exhausted, corpus)).toThrow(
      "challenge deck exhausted",
    );
  });

  it("uses stable participant-specific seeds and dimension-locked types", () => {
    const child = createChallenge(input({ mode: "FIXED_RACE" }));
    const childQuestion = questionForTurn(child, corpus);
    expect(childQuestion.seed).toBe("challenge-1:CHILD:0");
    expect(childQuestion.questionType).toBe("IDIOM_CHAIN");
    const handoff = submitChallengeAnswer(
      child,
      childQuestion.correctAnswer,
      corpus,
      100,
    );
    const parent = continueHandoff(handoff, 200);
    const parentQuestion = questionForTurn(parent, corpus);
    expect(parentQuestion.seed).toBe("challenge-1:PARENT:0");
    expect(parentQuestion.questionType).toBe("IDIOM_CHAIN");
  });

  it("raises parent difficulty so child and parent use different content", () => {
    const child = createChallenge(
      input({ tier: "STANDARD", childDifficulty: 1 }),
    );
    const childKp = questionForTurn(child, corpus).knowledgePointId;
    const parent = continueHandoff(
      submitChallengeAnswer(
        child,
        questionForTurn(child, corpus).correctAnswer,
        corpus,
        100,
      ),
      200,
    );
    // Child target L1 and standard parent L4 use different level bands.
    expect(
      corpus.idioms.find((entry) => entry.id === childKp)?.difficulty,
    ).toBe(1);
    expect(
      corpus.idioms.find(
        (entry) => entry.id === questionForTurn(parent, corpus).knowledgePointId,
      )?.difficulty,
    ).toBe(4);
  });

  it("records wrong answers before feedback and advances on confirmation", () => {
    const started = createChallenge(input({ mode: "FIXED_RACE" }));
    const question = questionForTurn(started, corpus);
    const pending = submitChallengeAnswer(started, wrong, corpus, 100);
    expect(pending.child).toMatchObject({
      answeredCount: 1,
      correctCount: 0,
      questionIndex: 0,
    });
    expect(pending.child.pendingWrongFeedback).toBeDefined();
    expect(() => submitChallengeAnswer(pending, wrong, corpus, 101)).toThrow(
      "wrong feedback is pending",
    );
    expect(pending.child.attempts).toEqual([
      {
        knowledgePointId: question.knowledgePointId,
        questionType: question.questionType,
        questionSeed: question.seed,
        submittedAnswer: wrong,
        correctAnswer: question.correctAnswer,
        correct: false,
        responseTimeMs: 100,
      },
    ]);
    expect(started.child.attempts).toEqual([]);
    const handoff = confirmWrongFeedback(pending, corpus, 200);
    expect(handoff).toMatchObject({
      phase: "HANDOFF",
      handoffTarget: "PARENT_TURN",
      paused: true,
    });
    expect(handoff.child.questionIndex).toBe(1);
    expect(handoff.child.attempts).toEqual(pending.child.attempts);
  });

  it("immutably records a correct answer on first submission", () => {
    const started = createChallenge(input({ questionCount: 2 }));
    const question = questionForTurn(started, corpus);

    const after = submitChallengeAnswer(
      started,
      question.correctAnswer,
      corpus,
      900,
    );

    expect(after.child.attempts).toEqual([
      {
        knowledgePointId: question.knowledgePointId,
        questionType: question.questionType,
        questionSeed: question.seed,
        submittedAnswer: question.correctAnswer,
        correctAnswer: question.correctAnswer,
        correct: true,
        responseTimeMs: 900,
      },
    ]);
    expect(after.child.attempts).not.toBe(started.child.attempts);
    expect(started.child.attempts).toEqual([]);
  });

  it("moves child to parent handoff and parent to result handoff", () => {
    const child = createChallenge(input({ mode: "FIXED_RACE" }));
    const afterChild = submitChallengeAnswer(
      child,
      questionForTurn(child, corpus).correctAnswer,
      corpus,
      100,
    );
    expect(afterChild.handoffTarget).toBe("PARENT_TURN");
    const parent = continueHandoff(afterChild, 200);
    const afterParent = submitChallengeAnswer(
      parent,
      questionForTurn(parent, corpus).correctAnswer,
      corpus,
      300,
    );
    expect(afterParent.handoffTarget).toBe("RESULT");
    expect(continueHandoff(afterParent, 400)).toMatchObject({
      phase: "RESULT",
      handoffTarget: null,
      paused: true,
    });
  });

  it("rejects answers at the timed boundary and counts answers before it", () => {
    const started = createChallenge(input({ mode: "TIMED", durationMs: 1_000 }));
    const counted = submitChallengeAnswer(
      started,
      questionForTurn(started, corpus).correctAnswer,
      corpus,
      999,
    );
    expect(counted.child.correctCount).toBe(1);
    const expired = submitChallengeAnswer(
      createChallenge(input({ mode: "TIMED", durationMs: 1_000 })),
      wrong,
      corpus,
      1_000,
    );
    expect(expired.phase).toBe("HANDOFF");
    expect(expired.child.answeredCount).toBe(0);
  });

  it("keeps wrong feedback visible after expiry until confirmation", () => {
    const started = createChallenge(input({ mode: "TIMED", durationMs: 1_000 }));
    const pending = submitChallengeAnswer(started, wrong, corpus, 900);
    expect(finishExpiredTurn(pending, 1_100)).toBe(pending);
    expect(confirmWrongFeedback(pending, corpus, 1_100).phase).toBe(
      "HANDOFF",
    );
  });

  it("continues a timed turn after early wrong-feedback confirmation", () => {
    const started = createChallenge(
      input({ mode: "TIMED", durationMs: 1_000, questionCount: 10 }),
    );
    const pending = submitChallengeAnswer(started, wrong, corpus, 100);
    const continued = confirmWrongFeedback(pending, corpus, 200);
    expect(continued).toMatchObject({
      phase: "CHILD_TURN",
      paused: false,
      child: { questionIndex: 1, activeElapsedMs: 200 },
    });
  });

  it("excludes paused time and resumes the same question", () => {
    const started = createChallenge(input({ mode: "TIMED", durationMs: 1_000 }));
    const paused = pauseChallenge(started, 400);
    expect(paused.child.activeElapsedMs).toBe(400);
    expect(remainingTurnMs(paused, 5_000)).toBe(600);
    const resumed = resumeChallenge(paused, 5_000);
    expect(remainingTurnMs(resumed, 5_100)).toBe(500);
    expect(questionForTurn(resumed, corpus)).toEqual(
      questionForTurn(started, corpus),
    );
  });

  it("accumulates one question's response time across pause and resume", () => {
    const started = createChallenge(input({ questionCount: 2 }));
    const paused = pauseChallenge(started, 400);
    const resumed = resumeChallenge(paused, 5_000);
    const answered = submitChallengeAnswer(
      resumed,
      questionForTurn(resumed, corpus).correctAnswer,
      corpus,
      5_300,
    );

    expect(answered.child.attempts[0]?.responseTimeMs).toBe(700);
  });

  it("does not count wrong-feedback dwell toward the next response", () => {
    const started = createChallenge(input({ questionCount: 2 }));
    const pending = submitChallengeAnswer(started, wrong, corpus, 100);
    const continued = confirmWrongFeedback(pending, corpus, 5_100);
    const answered = submitChallengeAnswer(
      continued,
      questionForTurn(continued, corpus).correctAnswer,
      corpus,
      5_300,
    );

    expect(answered.child.attempts[1]?.responseTimeMs).toBe(200);
  });

  it("caps a fixed-race response at ten minutes", () => {
    const started = createChallenge(input({ questionCount: 2 }));
    const answered = submitChallengeAnswer(
      started,
      questionForTurn(started, corpus).correctAnswer,
      corpus,
      700_000,
    );

    expect(answered.child.attempts[0]?.responseTimeMs).toBe(600_000);
  });

  it("finishes an unblocked timed turn when the clock expires", () => {
    const started = createChallenge(input({ mode: "TIMED", durationMs: 1_000 }));
    expect(finishExpiredTurn(started, 999)).toBe(started);
    expect(finishExpiredTurn(started, 1_000)).toMatchObject({
      phase: "HANDOFF",
      handoffTarget: "PARENT_TURN",
    });
  });

  it("rejects invalid turn operations", () => {
    const started = createChallenge(input({ mode: "FIXED_RACE" }));
    expect(() => resumeChallenge(started, 1)).toThrow(
      "challenge is not paused",
    );
    const paused = pauseChallenge(started, 10);
    expect(() => pauseChallenge(paused, 11)).toThrow(
      "challenge is already paused",
    );
    expect(finishExpiredTurn(started, 20)).toBe(started);
    expect(() => confirmWrongFeedback(started, corpus, 20)).toThrow(
      "wrong feedback is not pending",
    );
    expect(() =>
      continueHandoff(
        { ...started, phase: "HANDOFF", handoffTarget: null },
        20,
      ),
    ).toThrow("handoff target is missing");
    expect(() => questionForTurn(paused, corpus)).toThrow(
      "challenge is paused",
    );
  });

  it("keeps multi-question fixed turns active until the configured count", () => {
    const child = createChallenge(input({ questionCount: 2 }));
    const afterCorrect = submitChallengeAnswer(
      child,
      questionForTurn(child, corpus).correctAnswer,
      corpus,
      100,
    );
    expect(afterCorrect.phase).toBe("CHILD_TURN");
    const pending = submitChallengeAnswer(afterCorrect, wrong, corpus, 150);
    const afterWrong = confirmWrongFeedback(pending, corpus, 200);
    expect(afterWrong.phase).toBe("HANDOFF");
  });

  it("guards paused submissions and non-handoff continuation", () => {
    const started = createChallenge(input({ mode: "TIMED" }));
    const paused = pauseChallenge(started, -10);
    expect(paused.child.activeElapsedMs).toBe(0);
    expect(() => submitChallengeAnswer(paused, wrong, corpus, 1)).toThrow(
      "challenge is paused",
    );
    expect(() => confirmWrongFeedback(paused, corpus, 1)).toThrow(
      "challenge is paused",
    );
    expect(() => continueHandoff(started, 1)).toThrow(
      "challenge is not in handoff",
    );
    expect(() =>
      questionForTurn(
        { ...started, phase: "HANDOFF", paused: false },
        corpus,
      ),
    ).toThrow("challenge is not in an answer turn");
  });

  it("returns zero remaining time for fixed races and ignores paused expiry", () => {
    const fixed = createChallenge(input({ mode: "FIXED_RACE" }));
    expect(remainingTurnMs(fixed, 500)).toBe(0);
    const timed = createChallenge(input({ mode: "TIMED", durationMs: 1 }));
    const paused = pauseChallenge(timed, 0);
    expect(finishExpiredTurn(paused, 10)).toBe(paused);
  });

  it("rejects a fixed race when a turn has no eligible knowledge points", () => {
    const single: Corpus = {
      ...corpus,
      idioms: [idiom("cy-only", "一心一意", "yi", "yi", 1)],
    };
    // No successor for the single idiom → no eligible knowledge points.
    expect(() =>
      createChallenge({
        challengeId: "c",
        config: config({ dimension: "IDIOM", childDifficulty: 1 }),
        corpus: single,
        nowMs: 0,
      }),
    ).toThrow("challenge requires 1 unique questions: CHILD:0");
  });
});
