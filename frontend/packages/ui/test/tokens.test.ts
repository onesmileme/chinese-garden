import { describe, expect, it } from "vitest";
import {
  InkBackground,
  buildCelebration,
  cueFor,
  mascotVM,
  tokens,
} from "../src";

describe("Chinese learning tokens", () => {
  it("exports the learning shell foundation from the package", () => {
    expect([
      InkBackground,
      buildCelebration,
      cueFor,
      mascotVM,
    ]).toEqual([
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    ]);
  });

  it("uses the classical ink palette without a purple lead", () => {
    expect(tokens.color).toMatchObject({
      vermilion: "#b6493f",
      indigo: "#2b8a78",
      poem: "#a1762e",
      idiom: "#3f6fa3",
      done: "#2f855a",
      current: "#e49a35",
      currentStrong: "#8a4b08",
      locked: "#dce5e0",
      correct: "#2f855a",
      wrong: "#c24156",
      text: "#22312b",
      textSoft: "#607169",
      surface: "#ffffff",
    });
  });

  it("keeps classical radii small while offering candy-style card radii", () => {
    expect(tokens.radius).toEqual({
      sm: 4,
      md: 8,
      lg: 8,
      card: 16,
      xl: 24,
      pill: 999,
    });
    expect(tokens.radius.sm).toBeLessThanOrEqual(8);
    expect(tokens.radius.md).toBeLessThanOrEqual(8);
    expect(tokens.radius.lg).toBeLessThanOrEqual(8);
  });

  it("exposes gradients only for progress bars and primary actions", () => {
    expect(Object.keys(tokens.gradient)).toEqual([
      "dailyProgress",
      "questionProgress",
      "cta",
      "poemConfirm",
      "warmIcon",
    ]);
    for (const value of Object.values(tokens.gradient)) {
      expect(value).toContain("gradient");
    }
  });

  it("provides four lettered option badges aligned with option borders", () => {
    expect(tokens.question.optionBadges).toHaveLength(
      tokens.question.optionBorders.length,
    );
    for (const badge of tokens.question.optionBadges) {
      expect(badge).toEqual({
        bg: expect.stringMatching(/^#/),
        text: expect.stringMatching(/^#/),
      });
    }
  });

  it("keeps quick-practice tab colors for poem and idiom entries", () => {
    expect(Object.keys(tokens.tab)).toEqual(["poem", "idiom"]);
    for (const palette of Object.values(tokens.tab)) {
      expect(palette).toEqual({
        bg: expect.stringMatching(/^#/),
        border: expect.stringMatching(/^#/),
        text: expect.stringMatching(/^#/),
        sub: expect.stringMatching(/^#/),
      });
    }
  });

  it("provides child-sized option and back controls", () => {
    expect(tokens.control).toEqual({
      optionMinHeight: 64,
      choiceMinHeight: 72,
      backSize: 44,
    });
  });

  it("uses a solid paper background and four classical decorations", () => {
    expect(tokens.bg).toEqual({
      page: "#fbf7ec",
      surface: "#ffffff",
      bands: ["#f6dfda", "#d8eee8", "#f3e8c9", "#dfeaf6"],
      decor: ["诗", "词", "成", "语"],
    });
    expect(JSON.stringify(tokens.bg)).not.toContain("gradient");
  });
});
