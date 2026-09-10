export type MascotMood =
  | "idle"
  | "happy"
  | "cheer"
  | "celebrate"
  | "greeting";

export interface MascotVM {
  emoji: "🖌️";
  motion: "bob" | "jump" | "wiggle" | "party" | "wave";
}

// 古典文房意象（毛笔），弱化卡通吉祥物。
const MASCOTS: Record<MascotMood, MascotVM> = {
  idle: { emoji: "🖌️", motion: "bob" },
  happy: { emoji: "🖌️", motion: "jump" },
  cheer: { emoji: "🖌️", motion: "wiggle" },
  celebrate: { emoji: "🖌️", motion: "party" },
  greeting: { emoji: "🖌️", motion: "wave" },
};

export function mascotVM(mood: MascotMood): MascotVM {
  return MASCOTS[mood];
}
