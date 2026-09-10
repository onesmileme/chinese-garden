import { describe, it, expect } from "vitest";
import { evaluateUnlock } from "../src/curriculum/unlock";

const ok = {
  prerequisiteScores: [70, 90],
  checkpointFirstCorrect: 4,
  independentPracticeGroups: 2,
  hasTwoConsecutiveSameCoreErrors: false,
};

describe("evaluateUnlock", () => {
  it("unlocks when all four conditions hold", () => {
    expect(evaluateUnlock(ok)).toEqual({ unlocked: true, failedReasons: [] });
  });
  it("blocks when a prerequisite is below 70", () => {
    const r = evaluateUnlock({ ...ok, prerequisiteScores: [70, 69] });
    expect(r.unlocked).toBe(false);
    expect(r.failedReasons).toContain("PREREQUISITE_BELOW_70");
  });
  it("blocks when checkpoint is below 4/5", () => {
    const r = evaluateUnlock({ ...ok, checkpointFirstCorrect: 3 });
    expect(r.failedReasons).toContain("CHECKPOINT_BELOW_4");
  });
  it("blocks with fewer than two independent practice groups", () => {
    const r = evaluateUnlock({ ...ok, independentPracticeGroups: 1 });
    expect(r.failedReasons).toContain("INSUFFICIENT_PRACTICE_GROUPS");
  });
  it("blocks when two consecutive same-core errors exist", () => {
    const r = evaluateUnlock({ ...ok, hasTwoConsecutiveSameCoreErrors: true });
    expect(r.failedReasons).toContain("CONSECUTIVE_CORE_ERRORS");
  });
  it("treats an empty prerequisite list as satisfied", () => {
    const r = evaluateUnlock({ ...ok, prerequisiteScores: [] });
    expect(r.unlocked).toBe(true);
  });
});
