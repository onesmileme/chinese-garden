import { describe, expect, it } from "vitest";
import {
  mascotVM,
  type MascotMood,
  type MascotVM,
} from "../src/child/mascotModel";

describe("mascotModel", () => {
  it("maps every mood to the classical brush motif and its motion", () => {
    const expected: Record<MascotMood, MascotVM> = {
      idle: { emoji: "🖌️", motion: "bob" },
      happy: { emoji: "🖌️", motion: "jump" },
      cheer: { emoji: "🖌️", motion: "wiggle" },
      celebrate: { emoji: "🖌️", motion: "party" },
      greeting: { emoji: "🖌️", motion: "wave" },
    };

    for (const mood of Object.keys(expected) as MascotMood[]) {
      expect(mascotVM(mood)).toEqual(expected[mood]);
    }
  });
});
