import { asKnowledgePointId } from "@cc/content-schema";
import { describe, expect, it } from "vitest";
import {
  RECENT_CHALLENGES_KEY,
  SnapshotRecentChallengeStore,
  type RecentChallenge,
  type SnapshotStorage,
} from "../src";

function memoryStorage(): SnapshotStorage & { values: Map<string, unknown> } {
  const values = new Map<string, unknown>();
  return {
    values,
    read: <T>(key: string) => (values.get(key) as T | undefined) ?? null,
    write: <T>(key: string, value: T) => void values.set(key, value),
    remove: (key: string) => void values.delete(key),
  };
}

function completed(
  challengeId: string,
  completedAt: number,
): RecentChallenge {
  return {
    challengeId,
    dimension: "POEM",
    startedAt: completedAt - 60_000,
    completedAt,
    winner: "CHILD",
    child: {
      answeredCount: 1,
      correctCount: 0,
      activeElapsedMs: 900,
      attempts: [
        {
          knowledgePointId: asKnowledgePointId("poem-1"),
          questionType: "POEM_FILL",
          questionSeed: `${challengeId}:CHILD:0`,
          submittedAnswer: "错",
          correctAnswer: "对",
          correct: false,
          responseTimeMs: 900,
        },
      ],
    },
    parent: {
      answeredCount: 1,
      correctCount: 1,
      activeElapsedMs: 700,
      attempts: [
        {
          knowledgePointId: asKnowledgePointId("poem-2"),
          questionType: "POEM_FILL",
          questionSeed: `${challengeId}:PARENT:0`,
          submittedAnswer: "对",
          correctAnswer: "对",
          correct: true,
          responseTimeMs: 700,
        },
      ],
    },
  };
}

describe("SnapshotRecentChallengeStore", () => {
  it("saves full challenges idempotently with newest completions first", () => {
    const store = new SnapshotRecentChallengeStore(memoryStorage());
    const older = completed("older", Date.parse("2026-08-29T01:00:00Z"));
    const newer = completed("newer", Date.parse("2026-08-29T02:00:00Z"));

    store.save(older);
    store.save(newer);
    store.save({ ...older, completedAt: newer.completedAt + 1 });

    expect(store.all()).toEqual([newer, older]);
    expect(store.all()[0]?.parent.attempts).toEqual(newer.parent.attempts);
  });

  it("orders equal completion times deterministically by challenge ID", () => {
    const store = new SnapshotRecentChallengeStore(memoryStorage());
    const completedAt = Date.parse("2026-08-29T02:00:00Z");
    const second = completed("same-b", completedAt);
    const first = completed("same-a", completedAt);

    store.save(second);
    store.save(first);

    expect(store.all()).toEqual([first, second]);
  });

  it("can retry a save when the underlying write was dropped", () => {
    const storage = memoryStorage();
    const write = storage.write;
    let dropNextWrite = true;
    storage.write = <T>(key: string, value: T) => {
      if (dropNextWrite) {
        dropNextWrite = false;
        return;
      }
      write(key, value);
    };
    const store = new SnapshotRecentChallengeStore(storage);
    const challenge = completed(
      "retry",
      Date.parse("2026-08-29T02:00:00Z"),
    );

    store.save(challenge);
    expect(store.all()).toEqual([]);
    store.save(challenge);
    expect(store.all()).toEqual([challenge]);
  });

  it("matches calendar dates at IANA timezone boundaries", () => {
    const store = new SnapshotRecentChallengeStore(memoryStorage());
    const beforeShanghaiMidnight = completed(
      "before",
      Date.parse("2026-08-28T15:59:59.999Z"),
    );
    const atShanghaiMidnight = completed(
      "at",
      Date.parse("2026-08-28T16:00:00.000Z"),
    );
    const beforeNextShanghaiMidnight = completed(
      "before-next",
      Date.parse("2026-08-29T15:59:59.999Z"),
    );
    const sameInstantDifferentDate = completed(
      "zone-sensitive",
      Date.parse("2026-08-29T16:30:00.000Z"),
    );
    for (const challenge of [
      beforeShanghaiMidnight,
      atShanghaiMidnight,
      beforeNextShanghaiMidnight,
      sameInstantDifferentDate,
    ]) {
      store.save(challenge);
    }

    expect(store.forDate("2026-08-29", "Asia/Shanghai")).toEqual([
      beforeNextShanghaiMidnight,
      atShanghaiMidnight,
    ]);
    expect(store.forDate("2026-08-29", "America/Los_Angeles")).toContainEqual(
      sameInstantDifferentDate,
    );
  });

  it("prunes only completions strictly before the cutoff", () => {
    const cutoff = Date.parse("2026-03-03T00:00:00.000Z");
    const store = new SnapshotRecentChallengeStore(memoryStorage(), {
      now: () => cutoff,
    });
    const old = completed("old", cutoff - 1);
    const atCutoff = completed("at-cutoff", cutoff);
    const recent = completed("recent", cutoff + 1);
    store.save(old);
    store.save(atCutoff);
    store.save(recent);

    store.pruneBefore(0);
    expect(store.all()).toEqual([recent, atCutoff, old]);
    store.pruneBefore(cutoff);
    expect(store.all()).toEqual([recent, atCutoff]);
    store.pruneBefore(recent.completedAt + 1);
    expect(store.all()).toEqual([]);
  });

  it("automatically prunes expired history when reading all challenges", () => {
    const storage = memoryStorage();
    const now = Date.parse("2026-08-30T00:00:00.000Z");
    const cutoff = now - 180 * 24 * 60 * 60 * 1_000;
    const expired = completed("expired", cutoff - 1);
    const retained = completed("retained", cutoff);
    storage.write(RECENT_CHALLENGES_KEY, {
      version: 1,
      challenges: [expired, retained],
    });
    const store = new SnapshotRecentChallengeStore(storage, {
      now: () => now,
    });

    expect(store.all()).toEqual([retained]);
    expect(storage.values.get(RECENT_CHALLENGES_KEY)).toEqual({
      version: 1,
      challenges: [retained],
    });
  });

  it("automatically prunes expired history before a date query", () => {
    const storage = memoryStorage();
    const now = Date.parse("2026-08-30T00:00:00.000Z");
    const expired = completed(
      "expired-date",
      now - 180 * 24 * 60 * 60 * 1_000 - 1,
    );
    storage.write(RECENT_CHALLENGES_KEY, {
      version: 1,
      challenges: [expired],
    });
    const store = new SnapshotRecentChallengeStore(storage, {
      now: () => now,
    });

    expect(store.forDate("2026-03-02", "UTC")).toEqual([]);
    expect(storage.values.has(RECENT_CHALLENGES_KEY)).toBe(false);
  });

  it("discards malformed persisted history without returning partial data", () => {
    const storage = memoryStorage();
    storage.write(RECENT_CHALLENGES_KEY, {
      version: 1,
      challenges: [
        {
          ...completed("broken", Date.parse("2026-08-29T02:00:00Z")),
          child: {
            ...completed("broken", Date.parse("2026-08-29T02:00:00Z")).child,
            attempts: [{ responseTimeMs: -1 }],
          },
        },
      ],
    });
    const store = new SnapshotRecentChallengeStore(storage);

    expect(store.all()).toEqual([]);
    expect(storage.values.has(RECENT_CHALLENGES_KEY)).toBe(false);
  });

  it("rejects malformed writes and invalid query boundaries", () => {
    const store = new SnapshotRecentChallengeStore(memoryStorage());
    const challenge = completed(
      "invalid",
      Date.parse("2026-08-29T02:00:00Z"),
    );
    const malformedAttempt = {
      ...challenge,
      child: {
        ...challenge.child,
        attempts: [null],
      },
    } as unknown as RecentChallenge;

    expect(() => store.save(malformedAttempt)).toThrow(
      "invalid recent challenge",
    );
    expect(() =>
      store.save({ ...challenge, startedAt: challenge.completedAt + 1 }),
    ).toThrow("invalid recent challenge");
    expect(() => store.forDate("2026/08/29", "Asia/Shanghai")).toThrow(
      "date must be YYYY-MM-DD",
    );
    expect(() => store.forDate("2026-02-30", "Asia/Shanghai")).toThrow(
      "date must be YYYY-MM-DD",
    );
    expect(() => store.pruneBefore(-1)).toThrow(
      "cutoff must be a non-negative integer",
    );
  });
});
