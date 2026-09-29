// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GUARDIAN_SETTINGS_KEY,
  type GuardianSettingsSnapshot,
} from "@cc/application";
import {
  createBrowserGuardianSettings,
  createBrowserGuardianSettingsRepository,
  createBrowserPreferenceController,
} from "../src/guardian-settings";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-eye-protection");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("browser guardian settings", () => {
  it("persists settings and restores them into browser capabilities", async () => {
    const first = createBrowserGuardianSettings();
    await first.ready();
    await first.update("answerSoundEnabled", false);
    await first.update("hapticsEnabled", false);
    await first.update("eyeProtectionEnabled", true);

    const preferences = createBrowserPreferenceController();
    const restored = createBrowserGuardianSettings({ preferences });
    await restored.ready();

    expect(restored.getState().settings).toEqual({
      backgroundMusicEnabled: true,
      answerSoundEnabled: false,
      hapticsEnabled: false,
      eyeProtectionEnabled: true,
    });
    expect(preferences.isAnswerSoundEnabled()).toBe(false);
    expect(preferences.isHapticsEnabled()).toBe(false);
    expect(preferences.isBackgroundMusicSupported()).toBe(false);
    expect(document.documentElement.dataset.eyeProtection).toBe("true");
  });

  it("propagates storage write failures for store rollback", async () => {
    const repository = createBrowserGuardianSettingsRepository();
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("storage full");
    });

    expect(() =>
      repository.write({
        version: 1,
        settings: {
          backgroundMusicEnabled: true,
          answerSoundEnabled: false,
          hapticsEnabled: true,
          eyeProtectionEnabled: false,
        },
      }),
    ).toThrow("storage full");
  });

  it("repairs malformed settings with a complete snapshot", async () => {
    localStorage.setItem(GUARDIAN_SETTINGS_KEY, "{bad json");

    const settings = createBrowserGuardianSettings();
    await settings.ready();

    expect(
      JSON.parse(localStorage.getItem(GUARDIAN_SETTINGS_KEY) ?? ""),
    ).toEqual<GuardianSettingsSnapshot>({
      version: 1,
      settings: {
        backgroundMusicEnabled: true,
        answerSoundEnabled: true,
        hapticsEnabled: true,
        eyeProtectionEnabled: false,
      },
    });
  });

  it("removes the global eye-protection treatment when disabled", () => {
    const preferences = createBrowserPreferenceController();

    preferences.setEyeProtectionEnabled(true);
    expect(document.documentElement.dataset.eyeProtection).toBe("true");

    preferences.setEyeProtectionEnabled(false);
    expect(document.documentElement.dataset.eyeProtection).toBe("false");
  });
});
