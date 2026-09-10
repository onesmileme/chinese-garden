import { describe, it, expect } from "vitest";
import {
  settleXpEvents,
  evaluateWeeklyGoal,
  type ProgressionState,
} from "../src/progression/engine";

const fresh: ProgressionState = {
  level: 1,
  lifetimeXp: 0,
  xpIntoLevel: 0,
  appliedEventIds: [],
};

describe("settleXpEvents", () => {
  it("applies each event once", () => {
    const s = settleXpEvents(fresh, [
      { eventId: "e1", xp: 60 },
      { eventId: "e2", xp: 70 },
    ]);
    expect(s.lifetimeXp).toBe(130);
    expect(s.level).toBe(2);
    expect(s.appliedEventIds).toEqual(["e1", "e2"]);
  });

  it("is idempotent for duplicate event ids", () => {
    const once = settleXpEvents(fresh, [{ eventId: "e1", xp: 60 }]);
    const twice = settleXpEvents(once, [{ eventId: "e1", xp: 60 }]);
    expect(twice.lifetimeXp).toBe(60);
    expect(twice.appliedEventIds).toEqual(["e1"]);
  });

  it("ignores duplicates within the same batch", () => {
    const s = settleXpEvents(fresh, [
      { eventId: "e1", xp: 10 },
      { eventId: "e1", xp: 10 },
    ]);
    expect(s.lifetimeXp).toBe(10);
    expect(s.appliedEventIds).toEqual(["e1"]);
  });
});

describe("evaluateWeeklyGoal", () => {
  it("does not unlock below 5 days", () => {
    expect(evaluateWeeklyGoal(4)).toEqual({
      completedDays: 4,
      weekendChallengeUnlocked: false,
    });
  });
  it("unlocks the weekend challenge at 5 days", () => {
    expect(evaluateWeeklyGoal(5)).toEqual({
      completedDays: 5,
      weekendChallengeUnlocked: true,
    });
  });
});
