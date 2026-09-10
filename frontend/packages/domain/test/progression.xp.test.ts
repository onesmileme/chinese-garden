import { describe, it, expect } from "vitest";
import {
  xpToNextLevel,
  accuracyBonus,
  applyXpGain,
  type LevelState,
} from "../src/progression/xp";

describe("xpToNextLevel", () => {
  it("follows 100 + 20*(L-1)", () => {
    expect(xpToNextLevel(1)).toBe(100);
    expect(xpToNextLevel(2)).toBe(120);
    expect(xpToNextLevel(29)).toBe(660);
  });
});

describe("accuracyBonus", () => {
  it("gives 10 at 100%", () => {
    expect(accuracyBonus(18, 18)).toBe(10);
  });
  it("gives 5 between 90% and 99%", () => {
    expect(accuracyBonus(17, 18)).toBe(5); // 0.944
    expect(accuracyBonus(16, 18)).toBe(0); // 0.888 < 0.9
  });
  it("gives 0 below 90%", () => {
    expect(accuracyBonus(10, 18)).toBe(0);
  });
  it("gives 0 when total is 0", () => {
    expect(accuracyBonus(0, 0)).toBe(0);
  });
});

describe("applyXpGain", () => {
  const start: LevelState = { level: 1, lifetimeXp: 0, xpIntoLevel: 0 };

  it("accumulates XP within a level", () => {
    expect(applyXpGain(start, 60)).toEqual({
      level: 1,
      lifetimeXp: 60,
      xpIntoLevel: 60,
    });
  });

  it("levels up and carries the remainder", () => {
    const s = applyXpGain(start, 130); // needs 100 for L1->L2, remainder 30
    expect(s).toEqual({ level: 2, lifetimeXp: 130, xpIntoLevel: 30 });
  });

  it("levels up multiple times in one gain", () => {
    const s = applyXpGain(start, 230); // 100 (->L2) + 120 (->L3) leaves 10
    expect(s).toEqual({ level: 3, lifetimeXp: 230, xpIntoLevel: 10 });
  });

  it("caps at level 30 but keeps lifetime XP growing", () => {
    const near: LevelState = { level: 30, lifetimeXp: 9999, xpIntoLevel: 0 };
    const s = applyXpGain(near, 500);
    expect(s.level).toBe(30);
    expect(s.lifetimeXp).toBe(10499);
    expect(s.xpIntoLevel).toBe(0);
  });

  it("caps when leveling up into level 30 through the loop", () => {
    const near: LevelState = { level: 29, lifetimeXp: 0, xpIntoLevel: 0 };
    const s = applyXpGain(near, 660); // xpToNextLevel(29)=660 恰好升到 30
    expect(s).toEqual({ level: 30, lifetimeXp: 660, xpIntoLevel: 0 });
  });
});
