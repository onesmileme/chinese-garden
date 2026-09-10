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

  it("keeps every radius at or below eight pixels", () => {
    expect(tokens.radius).toEqual({ sm: 4, md: 8, lg: 8 });
    expect(Math.max(...Object.values(tokens.radius))).toBeLessThanOrEqual(8);
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
