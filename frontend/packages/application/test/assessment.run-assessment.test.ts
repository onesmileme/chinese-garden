import { describe, it, expect } from "vitest";
import { applyAssessmentStep } from "../src/assessment/run-assessment";
import { initAssessment } from "@cc/domain";

describe("applyAssessmentStep", () => {
  it("delegates to domain reducer and returns advanced state", () => {
    const start = initAssessment(0);
    const next = applyAssessmentStep(start, {
      checkpointResult: { firstCorrect: 5, total: 5 },
    });
    // 通过当前层后 reducer 会向上测试或终止；这里断言状态确实推进（非同一引用值语义）
    expect(next).not.toEqual(start);
  });
});
