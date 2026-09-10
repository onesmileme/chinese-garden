import { describe, expect, it } from "vitest";
import {
  cueFor,
  type Cue,
  type CueId,
} from "../src/child/cueModel";

describe("cueModel", () => {
  it("maps every cue id to its sensory descriptor", () => {
    const expected: Record<CueId, Cue> = {
      tap: {
        sound: "tap",
        haptic: "light",
        mascot: "idle",
        motion: "none",
      },
      correct: {
        sound: "correct",
        haptic: "light",
        mascot: "happy",
        motion: "bounce",
      },
      wrong: {
        sound: "encourage",
        haptic: "none",
        mascot: "cheer",
        motion: "shake",
      },
      segmentClear: {
        sound: "chest",
        haptic: "medium",
        mascot: "happy",
        motion: "pop",
      },
      celebrate: {
        sound: "celebrate",
        haptic: "medium",
        mascot: "celebrate",
        motion: "confetti",
      },
      greeting: {
        sound: "greeting",
        haptic: "none",
        mascot: "greeting",
        motion: "none",
      },
    };

    for (const id of Object.keys(expected) as CueId[]) {
      expect(cueFor(id)).toEqual(expected[id]);
    }
  });

  it("never uses haptics for a wrong answer", () => {
    expect(cueFor("wrong").haptic).toBe("none");
  });
});
