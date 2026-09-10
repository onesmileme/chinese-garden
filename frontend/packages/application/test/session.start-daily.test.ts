import { describe, it, expect } from "vitest";
import { startDaily } from "../src/session/start-daily";

const plan = {
  wakeUp: { role: "DUE_REVIEW", count: 5 },
  newKnowledge: { role: "GUIDED", count: 7 },
  consolidation: { role: "MIXED", count: 6 },
} as unknown as import("@cc/domain").DailyPlan;

describe("startDaily", () => {
  it("creates a session with generated id and carries plan + versions", () => {
    const s = startDaily({
      idGen: { ulid: () => "SESSION01" },
      clock: { now: () => 1 },
      plan,
      contentVersion: "content-v1",
      ruleVersion: "mastery-v1",
    });
    expect(s.sessionId).toBe("SESSION01");
    expect(s.contentVersion).toBe("content-v1");
    expect(s.levels).toBe(plan);
  });
});
