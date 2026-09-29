import Taro from "@tarojs/taro";
import { cueFor } from "@cc/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_GUARDIAN_SETTINGS,
  GUARDIAN_SETTINGS_KEY,
} from "@cc/application";
import { createMiniappGuardianSettingsStore } from "../src/guardian-settings";
import { createWeappPlatform } from "../src/platform/weapp";
import { createTtPlatform } from "../src/platform/tt";
import type { LearningEvent } from "@cc/application";

const sample: LearningEvent = {
  eventId: "e1",
  childProfileId: "c1",
  deviceId: "d1",
  sessionId: "s1",
  eventType: "LESSON_ANSWER",
  clientSequence: 0,
  contentVersion: "content-v1",
  ruleVersion: "mastery-v1",
  occurredAt: 0,
  payload: {},
};

function deferred(): {
  promise: Promise<void>;
  resolve(): void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.restoreAllMocks();
  Taro.removeStorageSync("cc_event_queue");
  Taro.removeStorageSync("cc_event_queue_v2");
  Taro.removeStorageSync("cc_event_quarantine_v1");
  Taro.removeStorageSync(GUARDIAN_SETTINGS_KEY);
});

describe("weapp platform storage implements EventStore", () => {
  it("clears current, legacy, and quarantined learning events only", async () => {
    await Taro.setStorage({ key: "cc_event_queue", data: [sample] });
    await Taro.setStorage({ key: "cc_event_queue_v2", data: [sample] });
    await Taro.setStorage({
      key: "cc_event_quarantine_v1",
      data: [
        {
          event: sample,
          code: "INVALID_PAYLOAD",
          quarantinedAt: 100,
        },
      ],
    });
    await Taro.setStorage({
      key: "cc_content_cache_index_v2",
      data: { preserved: true },
    });
    const platform = createWeappPlatform();

    await platform.storage.clear();
    await platform.quarantine.clear();

    await expect(
      Taro.getStorage({ key: "cc_event_queue" }),
    ).rejects.toThrow("not found");
    await expect(
      Taro.getStorage({ key: "cc_event_queue_v2" }),
    ).rejects.toThrow("not found");
    await expect(
      Taro.getStorage({ key: "cc_event_quarantine_v1" }),
    ).rejects.toThrow("not found");
    await expect(
      Taro.getStorage({ key: "cc_content_cache_index_v2" }),
    ).resolves.toEqual({ data: { preserved: true } });
  });

  it("append then pending returns the event, ack clears it", async () => {
    const platform = createWeappPlatform();
    await platform.storage.append(sample);
    const pending = await platform.storage.pending(10);
    expect(pending.map((e) => e.eventId)).toEqual(["e1"]);
    await platform.storage.ack(["e1"]);
    expect(await platform.storage.all()).toEqual([]);
  });

  it("waits for an in-flight append before clearing the queue", async () => {
    const writeStarted = deferred();
    const releaseWrite = deferred();
    const setStorage = Taro.setStorage.bind(Taro);
    vi.spyOn(Taro, "setStorage").mockImplementationOnce(async (options) => {
      writeStarted.resolve();
      await releaseWrite.promise;
      return setStorage(options);
    });
    const remove = vi.spyOn(Taro, "removeStorage");
    const platform = createWeappPlatform();

    const appending = platform.storage.append(sample);
    await writeStarted.promise;
    const clearing = platform.storage.clear();
    expect(remove).not.toHaveBeenCalled();

    releaseWrite.resolve();
    await Promise.all([appending, clearing]);

    await expect(platform.storage.all()).resolves.toEqual([]);
  });

  it.each(["pending", "all"] as const)(
    "serializes clear behind legacy migration triggered by %s",
    async (readMethod) => {
      await Taro.setStorage({ key: "cc_event_queue", data: [sample] });
      const migrationStarted = deferred();
      const releaseMigration = deferred();
      const setStorage = Taro.setStorage.bind(Taro);
      vi.spyOn(Taro, "setStorage").mockImplementationOnce(
        async (options) => {
          migrationStarted.resolve();
          await releaseMigration.promise;
          return setStorage(options);
        },
      );
      const platform = createWeappPlatform();

      const reading =
        readMethod === "pending"
          ? platform.storage.pending(10)
          : platform.storage.all();
      await migrationStarted.promise;
      const clearing = platform.storage.clear();
      const clearFinished = vi.fn();
      void clearing.then(clearFinished);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(clearFinished).not.toHaveBeenCalled();

      releaseMigration.resolve();
      await Promise.all([reading, clearing]);

      await expect(platform.storage.all()).resolves.toEqual([]);
      await expect(
        Taro.getStorage({ key: "cc_event_queue" }),
      ).rejects.toThrow("not found");
      await expect(
        Taro.getStorage({ key: "cc_event_queue_v2" }),
      ).rejects.toThrow("not found");
    },
  );

  it("migrates the legacy queue only when v2 is absent", async () => {
    await Taro.setStorage({ key: "cc_event_queue", data: [sample] });

    const platform = createWeappPlatform();

    await expect(platform.storage.all()).resolves.toEqual([sample]);
    await expect(
      Taro.getStorage({ key: "cc_event_queue_v2" }),
    ).resolves.toEqual({ data: [sample] });
    await expect(
      Taro.getStorage({ key: "cc_event_queue" }),
    ).rejects.toThrow("not found");
  });

  it("keeps v2 authoritative when both queue keys exist", async () => {
    const current = { ...sample, eventId: "v2-event" };
    await Taro.setStorage({ key: "cc_event_queue", data: [sample] });
    await Taro.setStorage({ key: "cc_event_queue_v2", data: [current] });

    await expect(createWeappPlatform().storage.all()).resolves.toEqual([
      current,
    ]);
    await expect(
      Taro.getStorage({ key: "cc_event_queue" }),
    ).resolves.toEqual({ data: [sample] });
  });

  it.each(["cc_event_queue", "cc_event_queue_v2"])(
    "rejects append and preserves a non-array queue at %s",
    async (key) => {
      const stored = { event: sample };
      await Taro.setStorage({ key, data: stored });

      await expect(
        createWeappPlatform().storage.append(sample),
      ).rejects.toThrow();

      await expect(Taro.getStorage({ key })).resolves.toEqual({
        data: stored,
      });
      if (key === "cc_event_queue") {
        await expect(
          Taro.getStorage({ key: "cc_event_queue_v2" }),
        ).rejects.toThrow("not found");
      }
    },
  );

  it("does not delete the legacy queue when writing v2 fails", async () => {
    await Taro.setStorage({ key: "cc_event_queue", data: [sample] });
    vi.spyOn(Taro, "setStorage").mockRejectedValueOnce(
      new Error("write failed"),
    );

    await expect(createWeappPlatform().storage.all()).rejects.toThrow(
      "write failed",
    );
    await expect(
      Taro.getStorage({ key: "cc_event_queue" }),
    ).resolves.toEqual({ data: [sample] });
  });

  it.each(["getStorage:fail data not found", "getStorage:fail key not found"])(
    "treats a Taro missing-key errMsg as absence: %s",
    async (errMsg) => {
      await Taro.setStorage({ key: "cc_event_queue", data: [sample] });
      const getStorage = Taro.getStorage.bind(Taro);
      const read = vi
        .spyOn(Taro, "getStorage")
        .mockImplementation(async ({ key }) => {
          if (key === "cc_event_queue_v2") {
            throw { errMsg };
          }
          return getStorage({ key });
        });

      await expect(createWeappPlatform().storage.all()).resolves.toEqual([
        sample,
      ]);

      read.mockRestore();
      await expect(
        Taro.getStorage({ key: "cc_event_queue_v2" }),
      ).resolves.toEqual({ data: [sample] });
      await expect(
        Taro.getStorage({ key: "cc_event_queue" }),
      ).rejects.toThrow("not found");
    },
  );

  it("propagates a transient v2 read failure without migrating legacy data", async () => {
    const current = { ...sample, eventId: "v2-event" };
    await Taro.setStorage({ key: "cc_event_queue", data: [sample] });
    await Taro.setStorage({ key: "cc_event_queue_v2", data: [current] });
    const getStorage = Taro.getStorage.bind(Taro);
    vi.spyOn(Taro, "getStorage").mockImplementation(async ({ key }) => {
      if (key === "cc_event_queue_v2") {
        throw new Error("storage temporarily unavailable");
      }
      return getStorage({ key });
    });
    const write = vi.spyOn(Taro, "setStorage");
    const remove = vi.spyOn(Taro, "removeStorage");

    await expect(createWeappPlatform().storage.all()).rejects.toThrow(
      "storage temporarily unavailable",
    );
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    await expect(
      getStorage({ key: "cc_event_queue" }),
    ).resolves.toEqual({ data: [sample] });
    await expect(
      getStorage({ key: "cc_event_queue_v2" }),
    ).resolves.toEqual({ data: [current] });
  });

  it("persists quarantined events idempotently", async () => {
    const platform = createWeappPlatform();
    const first = {
      event: sample,
      code: "INVALID_PAYLOAD" as const,
      quarantinedAt: 100,
    };

    await platform.quarantine.put([first]);
    await platform.quarantine.put([
      { ...first, code: "ANSWER_MISMATCH", quarantinedAt: 200 },
    ]);

    await expect(platform.quarantine.all()).resolves.toEqual([first]);
  });

  it("propagates quarantine read failures without overwriting diagnostics", async () => {
    const existing = {
      event: sample,
      code: "INVALID_PAYLOAD" as const,
      quarantinedAt: 100,
    };
    await Taro.setStorage({
      key: "cc_event_quarantine_v1",
      data: [existing],
    });
    const getStorage = Taro.getStorage.bind(Taro);
    vi.spyOn(Taro, "getStorage").mockImplementation(async ({ key }) => {
      if (key === "cc_event_quarantine_v1") {
        throw new Error("storage temporarily unavailable");
      }
      return getStorage({ key });
    });
    const write = vi.spyOn(Taro, "setStorage");
    const platform = createWeappPlatform();

    await expect(
      platform.quarantine.put([
        {
          ...existing,
          event: { ...sample, eventId: "new-diagnostic" },
        },
      ]),
    ).rejects.toThrow("storage temporarily unavailable");
    await expect(platform.quarantine.all()).rejects.toThrow(
      "storage temporarily unavailable",
    );
    expect(write).not.toHaveBeenCalled();
    await expect(
      getStorage({ key: "cc_event_quarantine_v1" }),
    ).resolves.toEqual({ data: [existing] });
  });

  it("rejects reads and puts without replacing non-array quarantine data", async () => {
    const stored = { event: sample };
    await Taro.setStorage({
      key: "cc_event_quarantine_v1",
      data: stored,
    });
    const platform = createWeappPlatform();
    const incoming = {
      event: sample,
      code: "INVALID_PAYLOAD" as const,
      quarantinedAt: 100,
    };

    await expect(platform.quarantine.all()).rejects.toThrow();
    await expect(platform.quarantine.put([incoming])).rejects.toThrow();

    await expect(
      Taro.getStorage({ key: "cc_event_quarantine_v1" }),
    ).resolves.toEqual({ data: stored });
  });

  it("serializes concurrent quarantine puts across platform instances", async () => {
    await Taro.setStorage({ key: "cc_event_quarantine_v1", data: [] });
    const firstPlatform = createWeappPlatform();
    const secondPlatform = createWeappPlatform();
    const first = {
      event: sample,
      code: "INVALID_PAYLOAD" as const,
      quarantinedAt: 100,
    };
    const second = {
      event: { ...sample, eventId: "e2" },
      code: "ANSWER_MISMATCH" as const,
      quarantinedAt: 200,
    };
    const firstRead = deferred();
    const secondRead = deferred();
    const firstWrite = deferred();
    const getStorage = Taro.getStorage.bind(Taro);
    let readCount = 0;
    vi.spyOn(Taro, "getStorage").mockImplementation(async (options) => {
      if (options.key !== "cc_event_quarantine_v1") {
        return getStorage(options);
      }
      readCount += 1;
      await (readCount === 1 ? firstRead.promise : secondRead.promise);
      return getStorage(options);
    });
    const setStorage = Taro.setStorage.bind(Taro);
    vi
      .spyOn(Taro, "setStorage")
      .mockImplementationOnce(async (options) => {
        await firstWrite.promise;
        return setStorage(options);
      })
      .mockImplementation(async (options) => setStorage(options));

    const puttingFirst = firstPlatform.quarantine.put([first]);
    const puttingSecond = secondPlatform.quarantine.put([second]);
    firstRead.resolve();
    secondRead.resolve();
    await vi.waitFor(() =>
      expect(Taro.setStorage).toHaveBeenCalledWith({
        key: "cc_event_quarantine_v1",
        data: [first],
      }),
    );
    firstWrite.resolve();
    await Promise.all([puttingFirst, puttingSecond]);
    await expect(firstPlatform.quarantine.all()).resolves.toEqual([
      first,
      second,
    ]);
  });

  it("continues shared quarantine writes after a failed write", async () => {
    const firstPlatform = createWeappPlatform();
    const secondPlatform = createWeappPlatform();
    const diagnostic = {
      event: sample,
      code: "INVALID_PAYLOAD" as const,
      quarantinedAt: 100,
    };
    vi.spyOn(Taro, "setStorage").mockRejectedValueOnce(
      new Error("write failed"),
    );

    await expect(
      firstPlatform.quarantine.put([diagnostic]),
    ).rejects.toThrow("write failed");
    await expect(
      secondPlatform.quarantine.put([diagnostic]),
    ).resolves.toBeUndefined();
    await expect(secondPlatform.quarantine.all()).resolves.toEqual([
      diagnostic,
    ]);
  });
});

describe("tt (douyin) platform storage implements EventStore", () => {
  it("append then pending returns the event, ack clears it", async () => {
    const platform = createTtPlatform();
    await platform.storage.append({ ...sample, eventId: "e2" });
    const pending = await platform.storage.pending(10);
    expect(pending.map((e) => e.eventId)).toEqual(["e2"]);
    await platform.storage.ack(["e2"]);
    expect(await platform.storage.all()).toEqual([]);
  });
});

describe("miniapp snapshot and cue capabilities", () => {
  it("persists guardian settings and restores them in a new store", async () => {
    const platform = createWeappPlatform();
    const first = createMiniappGuardianSettingsStore(platform);
    await first.ready();

    await first.update("answerSoundEnabled", false);

    const restored = createMiniappGuardianSettingsStore(
      createWeappPlatform(),
    );
    await restored.ready();
    expect(restored.getState()).toEqual({
      settings: {
        ...DEFAULT_GUARDIAN_SETTINGS,
        answerSoundEnabled: false,
      },
      error: null,
    });
  });

  it("propagates settings writes so the application store can rollback", async () => {
    const platform = createWeappPlatform();
    const settings = createMiniappGuardianSettingsStore(platform);
    await settings.ready();
    vi.spyOn(Taro, "setStorageSync").mockImplementationOnce(() => {
      throw new Error("storage unavailable");
    });

    await settings.update("answerSoundEnabled", false);

    expect(settings.getState()).toEqual({
      settings: DEFAULT_GUARDIAN_SETTINGS,
      error: "设置保存失败，请重试",
    });
  });

  it("round trips synchronous snapshots", () => {
    const platform = createWeappPlatform();

    platform.snapshots.write("snapshot-test", { index: 3 });
    expect(platform.snapshots.read("snapshot-test")).toEqual({ index: 3 });
    platform.snapshots.remove("snapshot-test");
    expect(platform.snapshots.read("snapshot-test")).toBeNull();
  });

  it("never vibrates for wrong answers", () => {
    const vibrate = vi.spyOn(Taro, "vibrateShort");

    createWeappPlatform().cue(cueFor("wrong"));

    expect(vibrate).not.toHaveBeenCalled();
  });

  it("uses light vibration for correct answers", () => {
    const vibrate = vi.spyOn(Taro, "vibrateShort");

    createTtPlatform().cue(cueFor("correct"));

    expect(vibrate).toHaveBeenCalledWith({ type: "light" });
  });

  it("controls answer audio and haptics independently", () => {
    const play = vi.fn();
    vi.spyOn(Taro, "createInnerAudioContext").mockReturnValue({
      src: "",
      play,
      destroy: vi.fn(),
    } as ReturnType<typeof Taro.createInnerAudioContext>);
    const vibrate = vi.spyOn(Taro, "vibrateShort");
    const platform = createWeappPlatform();

    platform.audioPreferences.setAnswerSoundEnabled(false);
    platform.cue(cueFor("correct"));
    expect(play).not.toHaveBeenCalled();
    expect(vibrate).toHaveBeenCalledTimes(1);

    platform.audioPreferences.setAnswerSoundEnabled(true);
    platform.hapticsPreferences.setHapticsEnabled(false);
    platform.cue(cueFor("correct"));
    expect(play).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it("applies eye protection through Taro global theme APIs", () => {
    const background = vi.spyOn(Taro, "setBackgroundColor");
    const navigation = vi.spyOn(Taro, "setNavigationBarColor");
    const platform = createWeappPlatform();

    platform.themePreferences.setEyeProtectionEnabled(true);

    expect(background).toHaveBeenLastCalledWith({
      backgroundColor: "#f3ead3",
      backgroundColorTop: "#f3ead3",
      backgroundColorBottom: "#f3ead3",
    });
    expect(navigation).toHaveBeenLastCalledWith({
      frontColor: "#000000",
      backgroundColor: "#f3ead3",
    });
  });

  it("silently degrades when snapshot and cue APIs throw", () => {
    vi.spyOn(Taro, "getStorageSync").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    vi.spyOn(Taro, "setStorageSync").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    vi.spyOn(Taro, "removeStorageSync").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    vi.spyOn(Taro, "vibrateShort").mockImplementation(() => {
      throw new Error("haptics unavailable");
    });
    vi.spyOn(Taro, "createInnerAudioContext").mockImplementation(() => {
      throw new Error("audio unavailable");
    });
    const platform = createWeappPlatform();

    expect(platform.snapshots.read("missing")).toBeNull();
    expect(() => platform.snapshots.write("key", "value")).not.toThrow();
    expect(() => platform.snapshots.remove("key")).not.toThrow();
    expect(() => platform.cue(cueFor("correct"))).not.toThrow();
  });
});
