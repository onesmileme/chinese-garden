import { describe, expect, it } from "vitest";
import { createFirstSubmissionTracker } from "../src";

describe("createFirstSubmissionTracker", () => {
  it("freezes the complete first submission for every persistence retry", () => {
    const tracker = createFirstSubmissionTracker();
    tracker.present("question-1", 1_000);

    const first = tracker.freeze("question-1", "功成名就", true, 2_250);
    const retry = tracker.freeze("question-1", "功德圆满", true, 9_000);

    expect(first).toEqual({
      questionKey: "question-1",
      chosenAnswer: "功成名就",
      correct: true,
      submittedAt: 2_250,
      occurredAt: 2_250,
      responseTimeMs: 1_250,
    });
    expect(retry).toBe(first);
  });

  it("clamps page-produced response time to the event schema range", () => {
    const tracker = createFirstSubmissionTracker();

    tracker.present("long-open", 1_000);
    expect(
      tracker.freeze("long-open", "answer", true, 700_001).responseTimeMs,
    ).toBe(600_000);

    tracker.present("clock-skew", 5_000);
    expect(
      tracker.freeze("clock-skew", "answer", false, 4_000).responseTimeMs,
    ).toBe(0);
  });

  it("starts fresh when a different question is presented", () => {
    const tracker = createFirstSubmissionTracker();
    tracker.present("question-1", 1_000);
    tracker.freeze("question-1", "first", false, 2_000);

    tracker.present("question-2", 3_000);

    expect(tracker.get("question-1")).toBeUndefined();
    expect(tracker.freeze("question-2", "second", true, 3_500)).toMatchObject({
      questionKey: "question-2",
      chosenAnswer: "second",
      correct: true,
      responseTimeMs: 500,
    });
  });

  it("keeps the original presentation time when the same question rerenders", () => {
    const tracker = createFirstSubmissionTracker();
    tracker.present("question-1", 1_000);
    tracker.present("question-1", 1_500);

    expect(
      tracker.freeze("question-1", "answer", true, 2_000).responseTimeMs,
    ).toBe(1_000);
  });

  it("freezes an unpresented question at submission time and can clear it", () => {
    const tracker = createFirstSubmissionTracker();

    expect(
      tracker.freeze("question-1", "answer", true, 2_000).responseTimeMs,
    ).toBe(0);
    expect(tracker.get("question-1")).toBeDefined();

    tracker.clear();

    expect(tracker.get("question-1")).toBeUndefined();
  });
});
