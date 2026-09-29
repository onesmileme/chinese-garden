import Taro from "@tarojs/taro";
import {
  mergeQuarantined,
  type LearningEvent,
  type QuarantinedEvent,
} from "@cc/application";
import type { Cue } from "@cc/ui";
import type { Platform } from "./types";

const LEGACY_QUEUE_KEY = "cc_event_queue";
const QUEUE_KEY = "cc_event_queue_v2";
const QUARANTINE_KEY = "cc_event_quarantine_v1";
const storageWriteChains = new Map<string, Promise<void>>();

function serializeStorageWrite<T>(
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  const write = (storageWriteChains.get(key) ?? Promise.resolve()).then(
    operation,
  );
  storageWriteChains.set(
    key,
    write.then(
      () => undefined,
      () => undefined,
    ),
  );
  return write;
}

function isMissingStorageError(error: unknown): boolean {
  if (error instanceof Error && error.message === "not found") {
    return true;
  }
  if (typeof error !== "object" || error === null || !("errMsg" in error)) {
    return false;
  }
  const errMsg = (error as { errMsg?: unknown }).errMsg;
  return (
    typeof errMsg === "string" &&
    /\b(?:data|key) not found\b/i.test(errMsg)
  );
}

async function readStoredArray<T>(
  key: string,
): Promise<{ exists: boolean; items: T[] }> {
  try {
    const res = await Taro.getStorage({ key });
    if (!Array.isArray(res.data)) {
      throw new Error(`Expected stored array at ${key}`);
    }
    return { exists: true, items: res.data as T[] };
  } catch (error) {
    if (isMissingStorageError(error)) {
      return { exists: false, items: [] };
    }
    throw error;
  }
}

async function readQueue(): Promise<LearningEvent[]> {
  const current = await readStoredArray<LearningEvent>(QUEUE_KEY);
  if (current.exists) return current.items;

  const legacy = await readStoredArray<LearningEvent>(LEGACY_QUEUE_KEY);
  if (!legacy.exists) return [];

  await writeQueue(legacy.items);
  await Taro.removeStorage({ key: LEGACY_QUEUE_KEY });
  return legacy.items;
}

async function writeQueue(events: readonly LearningEvent[]): Promise<void> {
  await Taro.setStorage({ key: QUEUE_KEY, data: events });
}

function ignoreCapabilityFailure(operation: () => unknown): void {
  try {
    const result = operation();
    if (
      typeof result === "object" &&
      result !== null &&
      "catch" in result &&
      typeof result.catch === "function"
    ) {
      void result.catch(() => undefined);
    }
  } catch {
    // Host theme capabilities are optional.
  }
}

function applyEyeProtection(enabled: boolean): void {
  const backgroundColor = enabled ? "#f3ead3" : "#f6f0e4";
  ignoreCapabilityFailure(() =>
    Taro.setBackgroundColor({
      backgroundColor,
      backgroundColorTop: backgroundColor,
      backgroundColorBottom: backgroundColor,
    }),
  );
  ignoreCapabilityFailure(() =>
    Taro.setNavigationBarColor({
      frontColor: "#000000",
      backgroundColor,
    }),
  );
}

export function createTaroPlatform(): Platform {
  let answerSoundEnabled = true;
  let hapticsEnabled = true;

  function playCue(cue: Cue): void {
    if (answerSoundEnabled) {
      try {
        const audio = Taro.createInnerAudioContext();
        audio.src = `/audio/${cue.sound}.mp3`;
        audio.play();
      } catch {
        // Audio support and cue assets are optional.
      }
    }

    if (!hapticsEnabled || cue.haptic === "none") return;
    try {
      Taro.vibrateShort({
        type: cue.haptic === "light" ? "light" : "heavy",
      });
    } catch {
      // Haptic support differs across miniapp hosts.
    }
  }

  return {
    audioPreferences: {
      setBackgroundMusicEnabled() {
        // Background music is unsupported until the host ships an asset.
      },
      setAnswerSoundEnabled(enabled) {
        answerSoundEnabled = enabled;
      },
    },
    hapticsPreferences: {
      setHapticsEnabled(enabled) {
        hapticsEnabled = enabled;
      },
    },
    themePreferences: {
      setEyeProtectionEnabled(enabled) {
        applyEyeProtection(enabled);
      },
    },
    storage: {
      append: (event) =>
        serializeStorageWrite(QUEUE_KEY, async () => {
          const all = await readQueue();
          all.push(event);
          await writeQueue(all);
        }),
      pending: (limit) =>
        serializeStorageWrite(QUEUE_KEY, async () =>
          (await readQueue()).slice(0, limit),
        ),
      ack: (ids) =>
        serializeStorageWrite(QUEUE_KEY, async () => {
          await writeQueue(
            (await readQueue()).filter(
              (event) => !ids.includes(event.eventId),
            ),
          );
        }),
      all: () => serializeStorageWrite(QUEUE_KEY, readQueue),
      clear: () =>
        serializeStorageWrite(QUEUE_KEY, async () => {
          await Taro.removeStorage({ key: LEGACY_QUEUE_KEY });
          await Taro.removeStorage({ key: QUEUE_KEY });
        }),
    },
    quarantine: {
      put: (events) => {
        const incoming = [...events];
        return serializeStorageWrite(QUARANTINE_KEY, async () => {
          const stored = await readStoredArray<QuarantinedEvent>(
            QUARANTINE_KEY,
          );
          await Taro.setStorage({
            key: QUARANTINE_KEY,
            data: mergeQuarantined(stored.items, incoming),
          });
        });
      },
      all: async () =>
        (await readStoredArray<QuarantinedEvent>(QUARANTINE_KEY)).items,
      clear: () =>
        serializeStorageWrite(QUARANTINE_KEY, async () => {
          await Taro.removeStorage({ key: QUARANTINE_KEY });
        }),
    },
    snapshots: {
      read<T>(key: string): T | null {
        try {
          const value = Taro.getStorageSync<T>(key);
          return value === undefined || value === null || value === ""
            ? null
            : value;
        } catch {
          return null;
        }
      },
      write<T>(key: string, value: T): void {
        try {
          Taro.setStorageSync(key, value);
        } catch {
          // Restricted hosts may reject synchronous persistence.
        }
      },
      remove(key: string): void {
        try {
          Taro.removeStorageSync(key);
        } catch {
          // Restricted hosts may reject synchronous persistence.
        }
      },
    },
    login: async () => {
      const { code } = await Taro.login();
      return { code };
    },
    cue: playCue,
  };
}
