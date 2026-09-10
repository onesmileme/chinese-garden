import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  classifyLearningInsight,
  type InsightAttempt,
  type InsightWindow,
  type LearningInsight,
  type LearningInsightStatus,
  orderLearningInsights,
} from "../src/index";

const DAY_MS = 24 * 60 * 60 * 1000;
const ENDED_AT = Date.UTC(2026, 7, 29, 12);
const WINDOW: InsightWindow = {
  startedAt: ENDED_AT - 30 * DAY_MS,
  endedAt: ENDED_AT,
};

function attempt(
  eventId: string,
  correct: boolean,
  occurredAt: number,
  overrides: Partial<InsightAttempt> = {},
): InsightAttempt {
  return {
    eventId,
    knowledgePointId: "kp-a",
    questionType: "CHAR_TO_PINYIN",
    participant: "CHILD",
    firstAttempt: true,
    correct,
    occurredAt,
    submittedAnswer: correct ? "mā" : "má",
    correctAnswer: "mā",
    responseTimeMs: 1_000,
    contentVersion: "corpus-v5",
    ...overrides,
  };
}

function insight(input: {
  knowledgePointId: string;
  questionType?: LearningInsight["questionType"];
  status: LearningInsightStatus;
  attemptCount: number;
  wrongCount: number;
  consecutiveWrongCount: number;
  lastAnsweredAt: number | null;
}): LearningInsight {
  return {
    knowledgePointId: input.knowledgePointId,
    questionType: input.questionType ?? "CHAR_TO_PINYIN",
    status: input.status,
    window: WINDOW,
    attemptCount: input.attemptCount,
    correctCount: input.attemptCount - input.wrongCount,
    wrongCount: input.wrongCount,
    consecutiveWrongCount: input.consecutiveWrongCount,
    lastAnsweredAt: input.lastAnsweredAt,
    recentMistakes: [],
  };
}

interface LearningInsightVectors {
  version: 1;
  classificationCases: Array<{
    name: string;
    attempts: InsightAttempt[];
    window: InsightWindow;
    expected: Omit<LearningInsight, "recentMistakes"> & {
      recentMistakeEventIds: string[];
    };
  }>;
  orderingCases: Array<{
    name: string;
    insights: LearningInsight[];
    expected: Array<{
      knowledgePointId: string;
      questionType: LearningInsight["questionType"];
    }>;
  }>;
}

function loadGoldenVectors(): LearningInsightVectors {
  const path = fileURLToPath(
    new URL(
      "../../../content/test-vectors/learning-insights-v1.json",
      import.meta.url,
    ),
  );
  return JSON.parse(readFileSync(path, "utf8")) as LearningInsightVectors;
}

describe("classifyLearningInsight", () => {
  it("rejects empty input", () => {
    expect(() => classifyLearningInsight([], WINDOW)).toThrow(
      "at least one insight attempt is required",
    );
  });

  it.each([
    {
      name: "knowledge point",
      overrides: { knowledgePointId: "kp-b" },
    },
    {
      name: "question type",
      overrides: { questionType: "CHAR_TO_TONE" as const },
    },
  ])("rejects a mixed $name before eligibility filtering", ({ overrides }) => {
    expect(() =>
      classifyLearningInsight(
        [
          attempt("event-1", true, ENDED_AT - 1_000),
          attempt("event-ineligible", true, ENDED_AT - 1_000, {
            participant: "PARENT",
            ...overrides,
          }),
        ],
        WINDOW,
      ),
    ).toThrow(
      "all insight attempts must have the same knowledge point and question type",
    );
  });

  it("reports insufficient evidence below three eligible attempts", () => {
    expect(
      classifyLearningInsight(
        [
          attempt("event-1", false, ENDED_AT - 2_000),
          attempt("event-2", false, ENDED_AT - 1_000),
        ],
        WINDOW,
      ),
    ).toMatchObject({
      status: "INSUFFICIENT_EVIDENCE",
      attemptCount: 2,
      wrongCount: 2,
    });
  });

  it("reports no last answer when every attempt is ineligible", () => {
    expect(
      classifyLearningInsight(
        [
          attempt("event-parent", true, ENDED_AT - 1_000, {
            participant: "PARENT",
          }),
        ],
        WINDOW,
      ),
    ).toMatchObject({
      status: "INSUFFICIENT_EVIDENCE",
      attemptCount: 0,
      lastAnsweredAt: null,
    });
  });

  it("needs attention when at least half of eligible attempts are wrong", () => {
    expect(
      classifyLearningInsight(
        [
          attempt("event-1", false, ENDED_AT - 3_000),
          attempt("event-2", true, ENDED_AT - 2_000),
          attempt("event-3", false, ENDED_AT - 1_000),
        ],
        WINDOW,
      ),
    ).toMatchObject({
      status: "NEEDS_ATTENTION",
      attemptCount: 3,
      wrongCount: 2,
    });
  });

  it("reports mastered when the error rate is below 20% and the last two are correct", () => {
    expect(
      classifyLearningInsight(
        [
          attempt("event-1", true, ENDED_AT - 3_000),
          attempt("event-2", true, ENDED_AT - 2_000),
          attempt("event-3", true, ENDED_AT - 1_000),
        ],
        WINDOW,
      ),
    ).toMatchObject({
      status: "MASTERED",
      attemptCount: 3,
      wrongCount: 0,
    });
  });

  it("needs attention when the latest two eligible attempts are wrong", () => {
    expect(
      classifyLearningInsight(
        [
          attempt("event-1", true, ENDED_AT - 5_000),
          attempt("event-2", true, ENDED_AT - 4_000),
          attempt("event-3", true, ENDED_AT - 3_000),
          attempt("event-4", false, ENDED_AT - 2_000),
          attempt("event-5", false, ENDED_AT - 1_000),
        ],
        WINDOW,
      ),
    ).toMatchObject({
      status: "NEEDS_ATTENTION",
      attemptCount: 5,
      wrongCount: 2,
      consecutiveWrongCount: 2,
    });
  });

  it("uses only child first attempts", () => {
    expect(
      classifyLearningInsight(
        [
          attempt("event-1", true, ENDED_AT - 5_000),
          attempt("event-2", true, ENDED_AT - 4_000),
          attempt("event-3", true, ENDED_AT - 3_000),
          attempt("event-parent", false, ENDED_AT - 2_000, {
            participant: "PARENT",
          }),
          attempt("event-repeat", false, ENDED_AT - 1_000, {
            firstAttempt: false,
          }),
        ],
        WINDOW,
      ),
    ).toMatchObject({
      status: "MASTERED",
      attemptCount: 3,
      correctCount: 3,
      wrongCount: 0,
      consecutiveWrongCount: 0,
    });
  });

  it("includes both window endpoints and excludes attempts one millisecond outside", () => {
    expect(
      classifyLearningInsight(
        [
          attempt("event-before", false, WINDOW.startedAt - 1),
          attempt("event-start", true, WINDOW.startedAt),
          attempt("event-middle", true, WINDOW.startedAt + DAY_MS),
          attempt("event-end", true, WINDOW.endedAt),
          attempt("event-after", false, WINDOW.endedAt + 1),
        ],
        WINDOW,
      ),
    ).toMatchObject({
      status: "MASTERED",
      attemptCount: 3,
      correctCount: 3,
      wrongCount: 0,
    });
  });

  it("uses chronological outcomes and returns newest mistakes first", () => {
    const newestWrong = attempt("event-5", false, ENDED_AT - 1_000);
    const previousWrong = attempt("event-4", false, ENDED_AT - 2_000);

    expect(
      classifyLearningInsight(
        [
          newestWrong,
          attempt("event-1", true, ENDED_AT - 5_000),
          previousWrong,
          attempt("event-2", true, ENDED_AT - 4_000),
          attempt("event-3", true, ENDED_AT - 3_000),
        ],
        WINDOW,
      ),
    ).toMatchObject({
      status: "NEEDS_ATTENTION",
      consecutiveWrongCount: 2,
      lastAnsweredAt: ENDED_AT - 1_000,
      recentMistakes: [newestWrong, previousWrong],
    });
  });

  it("orders equal timestamps by event ID without mutating attempts", () => {
    const attempts = [
      attempt("event-c", false, ENDED_AT - 1_000),
      attempt("event-a", true, ENDED_AT - 1_000),
      attempt("event-b", false, ENDED_AT - 1_000),
    ];

    expect(classifyLearningInsight(attempts, WINDOW)).toMatchObject({
      status: "NEEDS_ATTENTION",
      consecutiveWrongCount: 2,
      recentMistakes: [attempts[0], attempts[2]],
    });
    expect(attempts.map((item) => item.eventId)).toEqual([
      "event-c",
      "event-a",
      "event-b",
    ]);
  });

  it("returns at most the three newest mistakes", () => {
    const insight = classifyLearningInsight(
      [
        attempt("event-2", false, ENDED_AT - 4_000),
        attempt("event-5", false, ENDED_AT - 1_000),
        attempt("event-1", true, ENDED_AT - 5_000),
        attempt("event-3", false, ENDED_AT - 3_000),
        attempt("event-4", false, ENDED_AT - 2_000),
      ],
      WINDOW,
    );

    expect(insight.recentMistakes.map((item) => item.eventId)).toEqual([
      "event-5",
      "event-4",
      "event-3",
    ]);
  });
});

describe("orderLearningInsights", () => {
  it.each([
    {
      name: "zero attempt count",
      attemptCount: 0,
      wrongCount: 0,
      error: "attemptCount must be a positive safe integer",
    },
    {
      name: "unsafe attempt count",
      attemptCount: Number.MAX_SAFE_INTEGER + 1,
      wrongCount: 0,
      error: "attemptCount must be a positive safe integer",
    },
    {
      name: "unsafe wrong count",
      attemptCount: Number.MAX_SAFE_INTEGER,
      wrongCount: Number.MAX_SAFE_INTEGER + 1,
      error:
        "wrongCount must be a non-negative safe integer no greater than attemptCount",
    },
    {
      name: "negative wrong count",
      attemptCount: 3,
      wrongCount: -1,
      error:
        "wrongCount must be a non-negative safe integer no greater than attemptCount",
    },
    {
      name: "wrong count above attempt count",
      attemptCount: 3,
      wrongCount: 4,
      error:
        "wrongCount must be a non-negative safe integer no greater than attemptCount",
    },
  ])("rejects $name", ({ attemptCount, wrongCount, error }) => {
    expect(() =>
      orderLearningInsights([
        insight({
          knowledgePointId: "kp-invalid",
          status: "NEEDS_ATTENTION",
          attemptCount,
          wrongCount,
          consecutiveWrongCount: 0,
          lastAnsweredAt: 100,
        }),
      ]),
    ).toThrow(error);
  });

  it("orders answered insights before never-answered insights", () => {
    const answered = insight({
      knowledgePointId: "kp-answered",
      status: "CONSOLIDATING",
      attemptCount: 3,
      wrongCount: 1,
      consecutiveWrongCount: 0,
      lastAnsweredAt: 100,
    });
    const neverAnswered = insight({
      knowledgePointId: "kp-never-answered",
      status: "CONSOLIDATING",
      attemptCount: 3,
      wrongCount: 1,
      consecutiveWrongCount: 0,
      lastAnsweredAt: null,
    });

    for (const input of [
      [answered, neverAnswered],
      [neverAnswered, answered],
    ]) {
      expect(
        orderLearningInsights(input).map((item) => item.knowledgePointId),
      ).toEqual(["kp-answered", "kp-never-answered"]);
    }
  });

  it("orders adjacent large-count error ratios exactly", () => {
    const lowerRatio = insight({
      knowledgePointId: "kp-a-lower-ratio",
      status: "NEEDS_ATTENTION",
      attemptCount: 100_000_000,
      wrongCount: 99_999_999,
      consecutiveWrongCount: 0,
      lastAnsweredAt: 100,
    });
    const higherRatio = insight({
      knowledgePointId: "kp-z-higher-ratio",
      status: "NEEDS_ATTENTION",
      attemptCount: 100_000_001,
      wrongCount: 100_000_000,
      consecutiveWrongCount: 0,
      lastAnsweredAt: 100,
    });

    expect(
      orderLearningInsights([lowerRatio, higherRatio]).map(
        (item) => item.knowledgePointId,
      ),
    ).toEqual(["kp-z-higher-ratio", "kp-a-lower-ratio"]);
  });

  it("omits insufficient evidence and applies every stable tie break", () => {
    const input = [
      insight({
        knowledgePointId: "kp-mastered",
        status: "MASTERED",
        attemptCount: 3,
        wrongCount: 0,
        consecutiveWrongCount: 0,
        lastAnsweredAt: 500,
      }),
      insight({
        knowledgePointId: "kp-b",
        status: "NEEDS_ATTENTION",
        attemptCount: 4,
        wrongCount: 2,
        consecutiveWrongCount: 2,
        lastAnsweredAt: 100,
      }),
      insight({
        knowledgePointId: "kp-a",
        questionType: "CHAR_TO_TONE",
        status: "NEEDS_ATTENTION",
        attemptCount: 4,
        wrongCount: 2,
        consecutiveWrongCount: 2,
        lastAnsweredAt: 100,
      }),
      insight({
        knowledgePointId: "kp-insufficient",
        status: "INSUFFICIENT_EVIDENCE",
        attemptCount: 2,
        wrongCount: 2,
        consecutiveWrongCount: 2,
        lastAnsweredAt: 600,
      }),
      insight({
        knowledgePointId: "kp-consolidating",
        status: "CONSOLIDATING",
        attemptCount: 4,
        wrongCount: 1,
        consecutiveWrongCount: 0,
        lastAnsweredAt: 600,
      }),
      insight({
        knowledgePointId: "kp-ratio",
        status: "NEEDS_ATTENTION",
        attemptCount: 4,
        wrongCount: 3,
        consecutiveWrongCount: 1,
        lastAnsweredAt: 50,
      }),
      insight({
        knowledgePointId: "kp-consecutive",
        status: "NEEDS_ATTENTION",
        attemptCount: 6,
        wrongCount: 3,
        consecutiveWrongCount: 3,
        lastAnsweredAt: 50,
      }),
      insight({
        knowledgePointId: "kp-recency",
        status: "NEEDS_ATTENTION",
        attemptCount: 4,
        wrongCount: 2,
        consecutiveWrongCount: 2,
        lastAnsweredAt: 200,
      }),
      insight({
        knowledgePointId: "kp-a",
        questionType: "CHAR_TO_PINYIN",
        status: "NEEDS_ATTENTION",
        attemptCount: 4,
        wrongCount: 2,
        consecutiveWrongCount: 2,
        lastAnsweredAt: 100,
      }),
    ];

    expect(
      orderLearningInsights(input).map(
        (item) => `${item.knowledgePointId}:${item.questionType}`,
      ),
    ).toEqual([
      "kp-ratio:CHAR_TO_PINYIN",
      "kp-consecutive:CHAR_TO_PINYIN",
      "kp-recency:CHAR_TO_PINYIN",
      "kp-a:CHAR_TO_PINYIN",
      "kp-a:CHAR_TO_TONE",
      "kp-b:CHAR_TO_PINYIN",
      "kp-consolidating:CHAR_TO_PINYIN",
      "kp-mastered:CHAR_TO_PINYIN",
    ]);
    expect(input[0]!.knowledgePointId).toBe("kp-mastered");
  });
});

describe("learning insight golden vectors", () => {
  it("matches every literal classification result", () => {
    for (const vector of loadGoldenVectors().classificationCases) {
      const insight = classifyLearningInsight(vector.attempts, vector.window);
      const { recentMistakes, ...aggregate } = insight;
      expect(
        {
          ...aggregate,
          recentMistakeEventIds: recentMistakes.map((item) => item.eventId),
        },
        vector.name,
      ).toEqual(vector.expected);
    }
  });

  it("matches every literal ordering result", () => {
    for (const vector of loadGoldenVectors().orderingCases) {
      expect(
        orderLearningInsights(vector.insights).map((item) => ({
          knowledgePointId: item.knowledgePointId,
          questionType: item.questionType,
        })),
        vector.name,
      ).toEqual(vector.expected);
    }
  });
});
