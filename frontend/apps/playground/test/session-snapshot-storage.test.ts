// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LearningEvent } from "@cc/application";
import { browserSnapshotStorage } from "../src/session-snapshot-storage";
import { allEvents, eventQuarantine, eventQueue } from "../src/store";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("browserSnapshotStorage", () => {
  it("round-trips and removes structured values", () => {
    browserSnapshotStorage.write("key", { value: 3 });

    expect(browserSnapshotStorage.read("key")).toEqual({ value: 3 });

    browserSnapshotStorage.remove("key");
    expect(browserSnapshotStorage.read("key")).toBeNull();
  });

  it("removes malformed JSON and returns null", () => {
    localStorage.setItem("key", "{bad json");

    expect(browserSnapshotStorage.read("key")).toBeNull();
    expect(localStorage.getItem("key")).toBeNull();
  });

  it("returns null without attempting cleanup when reading storage fails", () => {
    const removeItem = vi.fn();
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("read failed");
      },
      removeItem,
    });

    expect(browserSnapshotStorage.read("key")).toBeNull();
    expect(removeItem).not.toHaveBeenCalled();
  });

  it("silently handles a cleanup failure after malformed JSON", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => "{bad json",
      removeItem: () => {
        throw new Error("remove failed");
      },
    });

    expect(browserSnapshotStorage.read("key")).toBeNull();
  });

  it("silently handles write and serialization failures", () => {
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("write failed");
      },
    });

    expect(() => browserSnapshotStorage.write("key", { value: 3 })).not.toThrow();

    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => browserSnapshotStorage.write("key", cyclic)).not.toThrow();
  });

  it("silently handles removal failure", () => {
    vi.stubGlobal("localStorage", {
      removeItem: () => {
        throw new Error("remove failed");
      },
    });

    expect(() => browserSnapshotStorage.remove("key")).not.toThrow();
  });

  it("is fail-closed when browser storage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);

    expect(browserSnapshotStorage.read("key")).toBeNull();
    expect(() => browserSnapshotStorage.write("key", { value: 3 })).not.toThrow();
    expect(() => browserSnapshotStorage.remove("key")).not.toThrow();
  });
});

const event: LearningEvent = {
  eventId: "event-1",
  childProfileId: "child-1",
  deviceId: "web-1",
  sessionId: "session-1",
  eventType: "LESSON_ANSWER",
  clientSequence: 1,
  contentVersion: "corpus-v4",
  ruleVersion: "mastery-v1",
  occurredAt: 100,
  payload: { correct: true },
};

describe("browser event store", () => {
  it("persists, batches, and acknowledges events through EventQueue", async () => {
    await eventQueue.enqueue(event);

    await expect(eventQueue.takeBatch(100)).resolves.toEqual([event]);
    await expect(allEvents()).resolves.toEqual([event]);

    await eventQueue.confirm([event.eventId]);
    await expect(allEvents()).resolves.toEqual([]);
  });

  it.each(["{bad json", JSON.stringify({ event })])(
    "rejects append and preserves a corrupt legacy queue: %s",
    async (stored) => {
      localStorage.setItem("cc_event_queue", stored);

      await expect(eventQueue.enqueue(event)).rejects.toThrow();

      expect(localStorage.getItem("cc_event_queue")).toBe(stored);
      expect(localStorage.getItem("cc_event_queue_v2")).toBeNull();
    },
  );

  it("migrates the legacy queue only when v2 is absent", async () => {
    localStorage.setItem("cc_event_queue", JSON.stringify([event]));

    await expect(allEvents()).resolves.toEqual([event]);
    expect(localStorage.getItem("cc_event_queue_v2")).toBe(
      JSON.stringify([event]),
    );
    expect(localStorage.getItem("cc_event_queue")).toBeNull();
  });

  it("keeps v2 authoritative when both queue keys exist", async () => {
    const current = { ...event, eventId: "event-v2" };
    localStorage.setItem("cc_event_queue", JSON.stringify([event]));
    localStorage.setItem("cc_event_queue_v2", JSON.stringify([current]));

    await expect(allEvents()).resolves.toEqual([current]);
    expect(localStorage.getItem("cc_event_queue")).toBe(
      JSON.stringify([event]),
    );
  });

  it.each(["{bad json", JSON.stringify({ event })])(
    "rejects append and preserves a corrupt v2 queue: %s",
    async (stored) => {
      const legacy = JSON.stringify([event]);
      localStorage.setItem("cc_event_queue", legacy);
      localStorage.setItem("cc_event_queue_v2", stored);

      await expect(eventQueue.enqueue(event)).rejects.toThrow();

      expect(localStorage.getItem("cc_event_queue_v2")).toBe(stored);
      expect(localStorage.getItem("cc_event_queue")).toBe(legacy);
    },
  );

  it("does not delete the legacy queue when writing v2 fails", async () => {
    localStorage.setItem("cc_event_queue", JSON.stringify([event]));
    vi.spyOn(localStorage, "setItem").mockImplementationOnce(() => {
      throw new Error("write failed");
    });

    await expect(allEvents()).rejects.toThrow("write failed");
    expect(localStorage.getItem("cc_event_queue")).toBe(
      JSON.stringify([event]),
    );
  });

  it("propagates v2 read failures without migrating legacy data", async () => {
    const current = { ...event, eventId: "event-v2" };
    localStorage.setItem("cc_event_queue", JSON.stringify([event]));
    localStorage.setItem("cc_event_queue_v2", JSON.stringify([current]));
    const getItem = localStorage.getItem.bind(localStorage);
    vi.spyOn(localStorage, "getItem").mockImplementation((key) => {
      if (key === "cc_event_queue_v2") {
        throw new Error("read failed");
      }
      return getItem(key);
    });
    const write = vi.spyOn(localStorage, "setItem");
    const remove = vi.spyOn(localStorage, "removeItem");

    await expect(allEvents()).rejects.toThrow("read failed");
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(getItem("cc_event_queue")).toBe(JSON.stringify([event]));
    expect(getItem("cc_event_queue_v2")).toBe(JSON.stringify([current]));
  });

  it("rejects writes when event persistence is unavailable", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("write failed");
      },
    });

    await expect(eventQueue.enqueue(event)).rejects.toThrow("write failed");
  });

  it("persists quarantined events idempotently", async () => {
    const first = {
      event,
      code: "INVALID_PAYLOAD" as const,
      quarantinedAt: 100,
    };

    await eventQuarantine.put([first]);
    await eventQuarantine.put([
      { ...first, code: "ANSWER_MISMATCH", quarantinedAt: 200 },
    ]);

    await expect(eventQuarantine.all()).resolves.toEqual([first]);
    expect(localStorage.getItem("cc_event_quarantine_v1")).toBe(
      JSON.stringify([first]),
    );
  });

  it("propagates quarantine read failures without overwriting diagnostics", async () => {
    const existing = {
      event,
      code: "INVALID_PAYLOAD" as const,
      quarantinedAt: 100,
    };
    localStorage.setItem(
      "cc_event_quarantine_v1",
      JSON.stringify([existing]),
    );
    const getItem = localStorage.getItem.bind(localStorage);
    vi.spyOn(localStorage, "getItem").mockImplementation((key) => {
      if (key === "cc_event_quarantine_v1") {
        throw new Error("read failed");
      }
      return getItem(key);
    });
    const write = vi.spyOn(localStorage, "setItem");

    await expect(
      eventQuarantine.put([
        {
          ...existing,
          event: { ...event, eventId: "event-2" },
        },
      ]),
    ).rejects.toThrow("read failed");
    await expect(eventQuarantine.all()).rejects.toThrow("read failed");
    expect(write).not.toHaveBeenCalled();
    expect(getItem("cc_event_quarantine_v1")).toBe(
      JSON.stringify([existing]),
    );
  });

  it.each(["{bad json", JSON.stringify({ event })])(
    "rejects reads and puts without replacing corrupt quarantine data: %s",
    async (stored) => {
      localStorage.setItem("cc_event_quarantine_v1", stored);
      const incoming = {
        event,
        code: "INVALID_PAYLOAD" as const,
        quarantinedAt: 100,
      };

      await expect(eventQuarantine.all()).rejects.toThrow();
      await expect(eventQuarantine.put([incoming])).rejects.toThrow();

      expect(localStorage.getItem("cc_event_quarantine_v1")).toBe(stored);
    },
  );
});
