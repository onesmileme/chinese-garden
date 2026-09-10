import type { Cue } from "@cc/ui";

interface AudioHandle {
  play(): void | Promise<unknown>;
}

export interface BrowserCueCapabilities {
  createAudio?(sound: string): AudioHandle | null;
  vibrate?(durationMs: number): void;
}

const HAPTIC_DURATION: Record<Cue["haptic"], number> = {
  light: 10,
  medium: 20,
  none: 0,
};

function createDefaultAudio(sound: string): AudioHandle | null {
  if (typeof globalThis.Audio !== "function") return null;
  return new globalThis.Audio(`/audio/${sound}.mp3`);
}

function defaultVibrate(durationMs: number): void {
  if (
    typeof globalThis.navigator !== "undefined" &&
    typeof globalThis.navigator.vibrate === "function"
  ) {
    globalThis.navigator.vibrate(durationMs);
  }
}

export function createBrowserCuePlayer(
  capabilities: BrowserCueCapabilities = {},
): { play(cue: Cue): void } {
  const createAudio = capabilities.createAudio ?? createDefaultAudio;
  const vibrate = capabilities.vibrate ?? defaultVibrate;

  return {
    play(cue): void {
      try {
        const audio = createAudio(cue.sound);
        if (audio !== null) {
          void Promise.resolve(audio.play()).catch(() => undefined);
        }
      } catch {
        // Audio is optional and must never interrupt the learning flow.
      }

      const durationMs = HAPTIC_DURATION[cue.haptic];
      if (durationMs === 0) return;
      try {
        vibrate(durationMs);
      } catch {
        // Haptics are optional and unsupported in many browsers.
      }
    },
  };
}
