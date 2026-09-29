export const GUARDIAN_SETTINGS_KEY = "cc_guardian_settings_v1";

export interface GuardianSettings {
  backgroundMusicEnabled: boolean;
  answerSoundEnabled: boolean;
  hapticsEnabled: boolean;
  eyeProtectionEnabled: boolean;
}

export interface GuardianSettingsSnapshot {
  version: 1;
  settings: GuardianSettings;
}

export interface GuardianSettingsRepository {
  read(): unknown | null;
  write(snapshot: GuardianSettingsSnapshot): void | Promise<void>;
}

export interface AudioPreferencePort {
  setBackgroundMusicEnabled(enabled: boolean): void;
  setAnswerSoundEnabled(enabled: boolean): void;
}

export interface HapticsPreferencePort {
  setHapticsEnabled(enabled: boolean): void;
}

export interface ThemePreferencePort {
  setEyeProtectionEnabled(enabled: boolean): void;
}

export interface GuardianSettingsState {
  settings: GuardianSettings;
  error: string | null;
}

export interface GuardianSettingsStore {
  getState(): GuardianSettingsState;
  subscribe(listener: () => void): () => void;
  ready(): Promise<void>;
  update(key: keyof GuardianSettings, enabled: boolean): Promise<void>;
}

export const DEFAULT_GUARDIAN_SETTINGS: GuardianSettings = Object.freeze({
  backgroundMusicEnabled: true,
  answerSoundEnabled: true,
  hapticsEnabled: true,
  eyeProtectionEnabled: false,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isGuardianSettings(value: unknown): value is GuardianSettings {
  return (
    isRecord(value) &&
    typeof value.backgroundMusicEnabled === "boolean" &&
    typeof value.answerSoundEnabled === "boolean" &&
    typeof value.hapticsEnabled === "boolean" &&
    typeof value.eyeProtectionEnabled === "boolean"
  );
}

function isGuardianSettingsSnapshot(
  value: unknown,
): value is GuardianSettingsSnapshot {
  return (
    isRecord(value) &&
    value.version === 1 &&
    isGuardianSettings(value.settings)
  );
}

function copySettings(settings: GuardianSettings): GuardianSettings {
  return { ...settings };
}

const settingKeys = [
  "backgroundMusicEnabled",
  "answerSoundEnabled",
  "hapticsEnabled",
  "eyeProtectionEnabled",
] as const;

export function createGuardianSettingsStore({
  repository,
  audio,
  haptics,
  theme,
}: {
  repository: GuardianSettingsRepository;
  audio?: AudioPreferencePort;
  haptics?: HapticsPreferencePort;
  theme?: ThemePreferencePort;
}): GuardianSettingsStore {
  const saved = repository.read();
  const settings = isGuardianSettingsSnapshot(saved)
    ? copySettings(saved.settings)
    : copySettings(DEFAULT_GUARDIAN_SETTINGS);
  let state: GuardianSettingsState = { settings, error: null };
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  const applyPreference = (
    key: keyof GuardianSettings,
    enabled: boolean,
  ) => {
    switch (key) {
      case "backgroundMusicEnabled":
        audio?.setBackgroundMusicEnabled(enabled);
        break;
      case "answerSoundEnabled":
        audio?.setAnswerSoundEnabled(enabled);
        break;
      case "hapticsEnabled":
        haptics?.setHapticsEnabled(enabled);
        break;
      case "eyeProtectionEnabled":
        theme?.setEyeProtectionEnabled(enabled);
        break;
    }
  };

  const initialization = Promise.resolve()
    .then(async () => {
      if (saved !== null && !isGuardianSettingsSnapshot(saved)) {
        try {
          await repository.write({
            version: 1,
            settings: copySettings(DEFAULT_GUARDIAN_SETTINGS),
          });
        } catch {
          state = {
            settings: state.settings,
            error: "设置保存失败，请重试",
          };
          notify();
        }
      }
    })
    .then(() => {
      for (const key of settingKeys) {
        applyPreference(key, settings[key]);
      }
    });
  let writeQueue = initialization;

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    ready: () => initialization,
    update(key, enabled) {
      const operation = writeQueue.then(async () => {
        const nextSettings = {
          ...state.settings,
          [key]: enabled,
        };
        try {
          await repository.write({ version: 1, settings: nextSettings });
        } catch {
          state = {
            settings: state.settings,
            error: "设置保存失败，请重试",
          };
          notify();
          return;
        }

        const previousSettings = state.settings;
        state = { settings: nextSettings, error: null };
        for (const changedKey of settingKeys) {
          if (previousSettings[changedKey] !== nextSettings[changedKey]) {
            applyPreference(changedKey, nextSettings[changedKey]);
          }
        }
        notify();
      });
      writeQueue = operation;
      return operation;
    },
  };
}
