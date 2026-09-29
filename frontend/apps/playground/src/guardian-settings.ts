import {
  GUARDIAN_SETTINGS_KEY,
  createGuardianSettingsStore,
  type AudioPreferencePort,
  type GuardianSettingsRepository,
  type GuardianSettingsStore,
  type HapticsPreferencePort,
  type ThemePreferencePort,
} from "@cc/application";

export interface BrowserCuePreferences {
  isAnswerSoundEnabled(): boolean;
  isHapticsEnabled(): boolean;
}

export interface BrowserPreferenceController
  extends AudioPreferencePort,
    HapticsPreferencePort,
    ThemePreferencePort,
    BrowserCuePreferences {
  isBackgroundMusicSupported(): false;
}

interface BrowserStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function currentStorage(): BrowserStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function createBrowserGuardianSettingsRepository(
  storage: BrowserStorage | null = currentStorage(),
): GuardianSettingsRepository {
  return {
    read(): unknown | null {
      if (storage === null) return null;
      const raw = storage.getItem(GUARDIAN_SETTINGS_KEY);
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        return raw;
      }
    },
    write(snapshot): void {
      if (storage === null) {
        throw new Error("browser storage unavailable");
      }
      storage.setItem(GUARDIAN_SETTINGS_KEY, JSON.stringify(snapshot));
    },
  };
}

export function createBrowserPreferenceController(): BrowserPreferenceController {
  let answerSoundEnabled = true;
  let hapticsEnabled = true;

  return {
    setBackgroundMusicEnabled(): void {
      // The Playground has no background-music asset or playback capability.
    },
    setAnswerSoundEnabled(enabled): void {
      answerSoundEnabled = enabled;
    },
    setHapticsEnabled(enabled): void {
      hapticsEnabled = enabled;
    },
    setEyeProtectionEnabled(enabled): void {
      if (typeof document === "undefined") return;
      document.documentElement.dataset.eyeProtection = String(enabled);
      document.documentElement.style.backgroundColor = enabled
        ? "#f3ead2"
        : "";
      if (document.body !== null) {
        document.body.style.backgroundColor = enabled ? "#f3ead2" : "";
        document.body.style.filter = enabled
          ? "sepia(0.12) saturate(0.82) brightness(0.94)"
          : "";
      }
    },
    isAnswerSoundEnabled: () => answerSoundEnabled,
    isHapticsEnabled: () => hapticsEnabled,
    isBackgroundMusicSupported: () => false,
  };
}

export function createBrowserGuardianSettings({
  repository = createBrowserGuardianSettingsRepository(),
  preferences = createBrowserPreferenceController(),
}: {
  repository?: GuardianSettingsRepository;
  preferences?: BrowserPreferenceController;
} = {}): GuardianSettingsStore {
  return createGuardianSettingsStore({
    repository,
    audio: preferences,
    haptics: preferences,
    theme: preferences,
  });
}

export const browserPreferenceController =
  createBrowserPreferenceController();

export const browserGuardianSettings = createBrowserGuardianSettings({
  preferences: browserPreferenceController,
});
