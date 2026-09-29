import Taro from "@tarojs/taro";
import {
  clearLearningRecords,
  createGuardianSettingsStore,
  GUARDIAN_SETTINGS_KEY,
  type GuardianSettingsRepository,
  type GuardianSettingsStore,
} from "@cc/application";
import { platform, type Platform } from "./platform";
import { sessionState } from "./session-state";

function createRepository(): GuardianSettingsRepository {
  return {
    read() {
      try {
        const value = Taro.getStorageSync(GUARDIAN_SETTINGS_KEY);
        return value === undefined || value === null || value === ""
          ? null
          : value;
      } catch {
        return null;
      }
    },
    write(snapshot) {
      Taro.setStorageSync(GUARDIAN_SETTINGS_KEY, snapshot);
    },
  };
}

export function createMiniappGuardianSettingsStore(
  host: Pick<
    Platform,
    "audioPreferences" | "hapticsPreferences" | "themePreferences"
  >,
): GuardianSettingsStore {
  return createGuardianSettingsStore({
    repository: createRepository(),
    audio: host.audioPreferences,
    haptics: host.hapticsPreferences,
    theme: host.themePreferences,
  });
}

export const guardianSettings =
  createMiniappGuardianSettingsStore(platform);

export function clearMiniappLearningRecords(): Promise<void> {
  return clearLearningRecords({
    session: sessionState,
    events: platform.storage,
    quarantine: platform.quarantine,
  });
}
