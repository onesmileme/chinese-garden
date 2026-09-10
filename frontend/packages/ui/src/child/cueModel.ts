import type { MascotMood } from "./mascotModel";

export type CueId =
  | "tap"
  | "correct"
  | "wrong"
  | "segmentClear"
  | "celebrate"
  | "greeting";

export type Haptic = "light" | "medium" | "none";
export type CueMotion = "bounce" | "shake" | "pop" | "confetti" | "none";

export interface Cue {
  sound: string;
  haptic: Haptic;
  mascot: MascotMood;
  motion: CueMotion;
}

const CUES: Record<CueId, Cue> = {
  tap: { sound: "tap", haptic: "light", mascot: "idle", motion: "none" },
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

export function cueFor(id: CueId): Cue {
  return CUES[id];
}
