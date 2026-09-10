import { describe, it, expect } from "vitest";
import { classifyStatus } from "../src/mastery/status";

describe("classifyStatus", () => {
  it("is LEARNING for 0..39", () => {
    expect(
      classifyStatus({
        score: 0,
        hasDelayedReviewEvidence: false,
        delayedReviewFailing: false,
      }),
    ).toBe("LEARNING");
    expect(
      classifyStatus({
        score: 39,
        hasDelayedReviewEvidence: false,
        delayedReviewFailing: false,
      }),
    ).toBe("LEARNING");
  });
  it("is PRACTICING for 40..69", () => {
    expect(
      classifyStatus({
        score: 40,
        hasDelayedReviewEvidence: false,
        delayedReviewFailing: false,
      }),
    ).toBe("PRACTICING");
    expect(
      classifyStatus({
        score: 69,
        hasDelayedReviewEvidence: false,
        delayedReviewFailing: false,
      }),
    ).toBe("PRACTICING");
  });
  it("is MASTERED for 70..100 without delayed-review evidence", () => {
    expect(
      classifyStatus({
        score: 70,
        hasDelayedReviewEvidence: false,
        delayedReviewFailing: false,
      }),
    ).toBe("MASTERED");
    expect(
      classifyStatus({
        score: 100,
        hasDelayedReviewEvidence: false,
        delayedReviewFailing: false,
      }),
    ).toBe("MASTERED");
  });
  it("stays MASTERED for 70..84 even with delayed-review evidence", () => {
    expect(
      classifyStatus({
        score: 84,
        hasDelayedReviewEvidence: true,
        delayedReviewFailing: false,
      }),
    ).toBe("MASTERED");
  });
  it("is STABLE for 85..100 with delayed-review evidence", () => {
    expect(
      classifyStatus({
        score: 85,
        hasDelayedReviewEvidence: true,
        delayedReviewFailing: false,
      }),
    ).toBe("STABLE");
  });
  it("is NEEDS_REPAIR whenever delayed review keeps failing, regardless of score", () => {
    expect(
      classifyStatus({
        score: 90,
        hasDelayedReviewEvidence: true,
        delayedReviewFailing: true,
      }),
    ).toBe("NEEDS_REPAIR");
    expect(
      classifyStatus({
        score: 30,
        hasDelayedReviewEvidence: false,
        delayedReviewFailing: true,
      }),
    ).toBe("NEEDS_REPAIR");
  });
});
