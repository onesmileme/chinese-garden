import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_GUARDIAN_SETTINGS,
  createGuardianSettingsStore,
  type AudioPreferencePort,
  type GuardianSettingsSnapshot,
  type HapticsPreferencePort,
  type ThemePreferencePort,
  GUARDIAN_SETTING_ITEMS,
  PARENT_GATE_HOLD_DURATION_MS,
} from "../src";

function repositoryWith(snapshot: unknown | null) {
  return {
    read: vi.fn(() => snapshot),
    write: vi.fn((_next: GuardianSettingsSnapshot) => undefined),
  };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

describe("createGuardianSettingsStore", () => {
  it("uses complete defaults when no settings have been saved", async () => {
    const repository = repositoryWith(null);
    const store = createGuardianSettingsStore({ repository });

    await store.ready();

    expect(store.getState()).toEqual({
      settings: DEFAULT_GUARDIAN_SETTINGS,
      error: null,
    });
    expect(repository.write).not.toHaveBeenCalled();
  });

  it("restores a complete version-1 snapshot", async () => {
    const settings = {
      backgroundMusicEnabled: false,
      answerSoundEnabled: true,
      hapticsEnabled: false,
      eyeProtectionEnabled: true,
    };
    const repository = repositoryWith({ version: 1, settings });
    const store = createGuardianSettingsStore({ repository });

    await store.ready();

    expect(store.getState()).toEqual({ settings, error: null });
    expect(repository.write).not.toHaveBeenCalled();
  });

  it("applies every restored preference when initialization completes", async () => {
    const settings = {
      backgroundMusicEnabled: true,
      answerSoundEnabled: false,
      hapticsEnabled: false,
      eyeProtectionEnabled: true,
    };
    const repository = repositoryWith({ version: 1, settings });
    const audio: AudioPreferencePort = {
      setBackgroundMusicEnabled: vi.fn(),
      setAnswerSoundEnabled: vi.fn(),
    };
    const haptics: HapticsPreferencePort = {
      setHapticsEnabled: vi.fn(),
    };
    const theme: ThemePreferencePort = {
      setEyeProtectionEnabled: vi.fn(),
    };

    const store = createGuardianSettingsStore({
      repository,
      audio,
      haptics,
      theme,
    });
    await store.ready();

    expect(audio.setBackgroundMusicEnabled).toHaveBeenCalledWith(true);
    expect(audio.setAnswerSoundEnabled).toHaveBeenCalledWith(false);
    expect(haptics.setHapticsEnabled).toHaveBeenCalledWith(false);
    expect(theme.setEyeProtectionEnabled).toHaveBeenCalledWith(true);
  });

  it.each([
    [
      "an old version",
      { version: 0, settings: DEFAULT_GUARDIAN_SETTINGS },
    ],
    [
      "a missing field",
      {
        version: 1,
        settings: {
          backgroundMusicEnabled: true,
          answerSoundEnabled: true,
          hapticsEnabled: true,
        },
      },
    ],
    [
      "a non-boolean field",
      {
        version: 1,
        settings: {
          ...DEFAULT_GUARDIAN_SETTINGS,
          eyeProtectionEnabled: "yes",
        },
      },
    ],
  ])("repairs %s with the complete defaults", async (_label, snapshot) => {
    const repository = repositoryWith(snapshot);
    const store = createGuardianSettingsStore({ repository });

    await store.ready();

    expect(store.getState()).toEqual({
      settings: DEFAULT_GUARDIAN_SETTINGS,
      error: null,
    });
    expect(repository.write).toHaveBeenCalledWith({
      version: 1,
      settings: DEFAULT_GUARDIAN_SETTINGS,
    });
  });

  it("surfaces a failed snapshot repair and allows a later update", async () => {
    const repository = repositoryWith({
      version: 0,
      settings: DEFAULT_GUARDIAN_SETTINGS,
    });
    repository.write
      .mockRejectedValueOnce(new Error("storage unavailable"))
      .mockResolvedValueOnce(undefined);
    const audio: AudioPreferencePort = {
      setBackgroundMusicEnabled: vi.fn(),
      setAnswerSoundEnabled: vi.fn(),
    };
    const store = createGuardianSettingsStore({ repository, audio });

    await expect(store.ready()).resolves.toBeUndefined();

    expect(store.getState()).toEqual({
      settings: DEFAULT_GUARDIAN_SETTINGS,
      error: "设置保存失败，请重试",
    });
    expect(audio.setBackgroundMusicEnabled).toHaveBeenCalledWith(true);
    expect(audio.setAnswerSoundEnabled).toHaveBeenCalledWith(true);

    await store.update("answerSoundEnabled", false);

    expect(repository.write).toHaveBeenNthCalledWith(2, {
      version: 1,
      settings: {
        ...DEFAULT_GUARDIAN_SETTINGS,
        answerSoundEnabled: false,
      },
    });
    expect(store.getState()).toEqual({
      settings: {
        ...DEFAULT_GUARDIAN_SETTINGS,
        answerSoundEnabled: false,
      },
      error: null,
    });
  });

  it("publishes and applies an updated setting only after it is saved", async () => {
    const repository = repositoryWith(null);
    const audio: AudioPreferencePort = {
      setBackgroundMusicEnabled: vi.fn(),
      setAnswerSoundEnabled: vi.fn(),
    };
    const haptics: HapticsPreferencePort = {
      setHapticsEnabled: vi.fn(),
    };
    const theme: ThemePreferencePort = {
      setEyeProtectionEnabled: vi.fn(),
    };
    const store = createGuardianSettingsStore({
      repository,
      audio,
      haptics,
      theme,
    });
    await store.ready();
    vi.mocked(audio.setBackgroundMusicEnabled).mockClear();
    vi.mocked(audio.setAnswerSoundEnabled).mockClear();
    vi.mocked(haptics.setHapticsEnabled).mockClear();
    vi.mocked(theme.setEyeProtectionEnabled).mockClear();
    const committedStates: unknown[] = [];
    store.subscribe(() => committedStates.push(store.getState()));

    const update = store.update("answerSoundEnabled", false);
    expect(store.getState().settings.answerSoundEnabled).toBe(true);
    expect(committedStates).toEqual([]);

    await update;

    const expectedSettings = {
      ...DEFAULT_GUARDIAN_SETTINGS,
      answerSoundEnabled: false,
    };
    expect(repository.write).toHaveBeenCalledWith({
      version: 1,
      settings: expectedSettings,
    });
    expect(store.getState()).toEqual({
      settings: expectedSettings,
      error: null,
    });
    expect(audio.setAnswerSoundEnabled).toHaveBeenCalledWith(false);
    expect(audio.setBackgroundMusicEnabled).not.toHaveBeenCalled();
    expect(haptics.setHapticsEnabled).not.toHaveBeenCalled();
    expect(theme.setEyeProtectionEnabled).not.toHaveBeenCalled();
    expect(committedStates).toEqual([store.getState()]);
  });

  it("serializes rapid writes and preserves every requested value", async () => {
    const firstWrite = deferred();
    const secondWrite = deferred();
    const repository = repositoryWith(null);
    repository.write
      .mockImplementationOnce(() => firstWrite.promise)
      .mockImplementationOnce(() => secondWrite.promise);
    const audio: AudioPreferencePort = {
      setBackgroundMusicEnabled: vi.fn(),
      setAnswerSoundEnabled: vi.fn(),
    };
    const haptics: HapticsPreferencePort = {
      setHapticsEnabled: vi.fn(),
    };
    const store = createGuardianSettingsStore({
      repository,
      audio,
      haptics,
    });
    await store.ready();
    vi.mocked(audio.setBackgroundMusicEnabled).mockClear();
    vi.mocked(audio.setAnswerSoundEnabled).mockClear();
    vi.mocked(haptics.setHapticsEnabled).mockClear();
    const committedSettings: unknown[] = [];
    store.subscribe(() =>
      committedSettings.push(store.getState().settings),
    );

    const disableMusic = store.update("backgroundMusicEnabled", false);
    const disableHaptics = store.update("hapticsEnabled", false);
    await Promise.resolve();

    expect(repository.write).toHaveBeenCalledTimes(1);
    expect(store.getState().settings).toEqual(DEFAULT_GUARDIAN_SETTINGS);

    firstWrite.resolve();
    await disableMusic;
    await Promise.resolve();

    expect(repository.write).toHaveBeenNthCalledWith(2, {
      version: 1,
      settings: {
        ...DEFAULT_GUARDIAN_SETTINGS,
        backgroundMusicEnabled: false,
        hapticsEnabled: false,
      },
    });

    secondWrite.resolve();
    await disableHaptics;

    expect(store.getState()).toEqual({
      settings: {
        ...DEFAULT_GUARDIAN_SETTINGS,
        backgroundMusicEnabled: false,
        hapticsEnabled: false,
      },
      error: null,
    });
    expect(committedSettings).toEqual([
      {
        ...DEFAULT_GUARDIAN_SETTINGS,
        backgroundMusicEnabled: false,
      },
      {
        ...DEFAULT_GUARDIAN_SETTINGS,
        backgroundMusicEnabled: false,
        hapticsEnabled: false,
      },
    ]);
    expect(audio.setBackgroundMusicEnabled).toHaveBeenCalledWith(false);
    expect(haptics.setHapticsEnabled).toHaveBeenCalledWith(false);
  });

  it("rolls back a failed write and clears the error after a retry", async () => {
    const repository = repositoryWith(null);
    repository.write
      .mockRejectedValueOnce(new Error("storage full"))
      .mockResolvedValueOnce(undefined);
    const theme: ThemePreferencePort = {
      setEyeProtectionEnabled: vi.fn(),
    };
    const store = createGuardianSettingsStore({ repository, theme });
    await store.ready();
    vi.mocked(theme.setEyeProtectionEnabled).mockClear();
    const committedStates: unknown[] = [];
    store.subscribe(() => committedStates.push(store.getState()));

    await expect(
      store.update("eyeProtectionEnabled", true),
    ).resolves.toBeUndefined();

    expect(store.getState()).toEqual({
      settings: DEFAULT_GUARDIAN_SETTINGS,
      error: "设置保存失败，请重试",
    });
    expect(theme.setEyeProtectionEnabled).not.toHaveBeenCalled();

    await store.update("eyeProtectionEnabled", true);

    expect(store.getState()).toEqual({
      settings: {
        ...DEFAULT_GUARDIAN_SETTINGS,
        eyeProtectionEnabled: true,
      },
      error: null,
    });
    expect(theme.setEyeProtectionEnabled).toHaveBeenCalledWith(true);
    expect(committedStates).toEqual([
      {
        settings: DEFAULT_GUARDIAN_SETTINGS,
        error: "设置保存失败，请重试",
      },
      store.getState(),
    ]);
  });

  it("does not revive a failed value in the next queued setting write", async () => {
    const firstWrite = deferred();
    const repository = repositoryWith(null);
    repository.write
      .mockImplementationOnce(() => firstWrite.promise)
      .mockResolvedValueOnce(undefined);
    const store = createGuardianSettingsStore({ repository });

    const failedMusic = store.update("backgroundMusicEnabled", false);
    const successfulHaptics = store.update("hapticsEnabled", false);
    firstWrite.reject(new Error("storage full"));

    await failedMusic;
    await successfulHaptics;

    expect(repository.write).toHaveBeenNthCalledWith(2, {
      version: 1,
      settings: {
        ...DEFAULT_GUARDIAN_SETTINGS,
        hapticsEnabled: false,
      },
    });
    expect(store.getState()).toEqual({
      settings: {
        ...DEFAULT_GUARDIAN_SETTINGS,
        hapticsEnabled: false,
      },
      error: null,
    });
  });
});

describe("guardian settings presentation", () => {
  it("shares the ordered setting labels and unsupported music explanation", () => {
    expect(GUARDIAN_SETTING_ITEMS).toEqual([
      {
        key: "backgroundMusicEnabled",
        label: "背景音乐",
        supported: false,
        description: "当前暂无背景音乐资源，暂不支持此设置",
      },
      {
        key: "answerSoundEnabled",
        label: "答题音效",
        supported: true,
      },
      {
        key: "hapticsEnabled",
        label: "震动反馈",
        supported: true,
      },
      {
        key: "eyeProtectionEnabled",
        label: "护眼模式",
        supported: true,
      },
    ]);
  });

  it("uses the approved two-second parent gate duration", () => {
    expect(PARENT_GATE_HOLD_DURATION_MS).toBe(2_000);
  });
});
