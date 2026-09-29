import { describe, expect, it, vi } from "vitest";
import { initAssessment } from "@cc/domain";
import {
  ACTIVE_ASSESSMENT_KEY,
  ACTIVE_CHALLENGE_KEY,
  ACTIVE_DAILY_KEY,
  ASSESSMENT_COMPLETED_KEY,
  CHALLENGE_SOURCE_KEY,
  LAST_CHALLENGE_RESULT_KEY,
  RECENT_CHALLENGES_KEY,
  clearLearningRecords,
  createSessionState,
  type ActiveAssessmentSession,
  type ActiveChallengeSession,
  type ActiveDailySession,
  type ClearableEventQuarantine,
  type ClearableEventStore,
  type LearningEvent,
  type QuarantinedEvent,
  type SnapshotStorage,
} from "../src";

const CONTENT_VERSION = "corpus-v5";
const RULE_VERSION = "mastery-v1";
const LEARNING_KEYS = [
  ACTIVE_DAILY_KEY,
  ACTIVE_ASSESSMENT_KEY,
  ASSESSMENT_COMPLETED_KEY,
  ACTIVE_CHALLENGE_KEY,
  LAST_CHALLENGE_RESULT_KEY,
  CHALLENGE_SOURCE_KEY,
  RECENT_CHALLENGES_KEY,
] as const;

function memoryStorage(
  initial: Record<string, unknown> = {},
): SnapshotStorage & { values: Map<string, unknown> } {
  const values = new Map(Object.entries(initial));
  return {
    values,
    read: <T>(key: string) => (values.get(key) as T | undefined) ?? null,
    write: (key, value) => values.set(key, value),
    remove: (key) => values.delete(key),
  };
}

function activeDaily(): ActiveDailySession {
  return {
    session: {
      sessionId: "daily-1",
      levels: [],
      contentVersion: CONTENT_VERSION,
      ruleVersion: RULE_VERSION,
    },
    currentIndex: 0,
    firstAttemptOutcomes: [],
    contentVersion: CONTENT_VERSION,
    contentSelection: {
      childProfileId: "child-1",
      authentication: "GUEST",
      version: CONTENT_VERSION,
      abilityLevel: 1,
    },
    ruleVersion: RULE_VERSION,
    updatedAt: 1,
  };
}

function activeAssessment(): ActiveAssessmentSession {
  return {
    state: initAssessment(0),
    round: 0,
    questionIndex: 1,
    correctCount: 1,
    startedAt: 1,
    contentVersion: CONTENT_VERSION,
    contentSelection: {
      childProfileId: "child-1",
      authentication: "GUEST",
      version: CONTENT_VERSION,
      abilityLevel: 1,
    },
    updatedAt: 2,
  };
}

function activeChallenge(): ActiveChallengeSession {
  return {
    challengeId: "challenge-1",
    startedAt: 1,
    phase: "CHILD_TURN",
    handoffTarget: null,
    config: {
      mode: "FIXED_RACE",
      tier: "STANDARD",
      dimension: "PINYIN",
      childDifficulty: 1,
      abilityLevel: 1,
      durationMs: 60_000,
      questionCount: 10,
      contentVersion: CONTENT_VERSION,
      ruleVersion: "challenge-v5",
    },
    child: {
      participant: "CHILD",
      questionIndex: 0,
      answeredCount: 0,
      correctCount: 0,
      activeElapsedMs: 0,
      questionActiveElapsedMs: 0,
      attempts: [],
    },
    parent: {
      participant: "PARENT",
      questionIndex: 0,
      answeredCount: 0,
      correctCount: 0,
      activeElapsedMs: 0,
      questionActiveElapsedMs: 0,
      attempts: [],
    },
    paused: false,
    updatedAt: 1,
    contentSelection: {
      childProfileId: "child-1",
      authentication: "GUEST",
      version: CONTENT_VERSION,
      abilityLevel: 1,
    },
  };
}

function event(eventId: string): LearningEvent {
  return {
    eventId,
    childProfileId: "child-1",
    deviceId: "device-1",
    sessionId: "daily-1",
    eventType: "LESSON_ANSWER",
    clientSequence: 0,
    contentVersion: CONTENT_VERSION,
    ruleVersion: RULE_VERSION,
    occurredAt: 1,
    payload: {},
  };
}

function clearableRecords() {
  const events: LearningEvent[] = [event("pending-1")];
  const quarantined: QuarantinedEvent[] = [
    {
      event: event("rejected-1"),
      code: "INVALID_PAYLOAD",
      quarantinedAt: 2,
    },
  ];
  const eventStore: ClearableEventStore = {
    append: async (item) => void events.push(item),
    pending: async (limit) => events.slice(0, limit),
    ack: async (ids) => {
      const acknowledged = new Set(ids);
      events.splice(
        0,
        events.length,
        ...events.filter((item) => !acknowledged.has(item.eventId)),
      );
    },
    all: async () => [...events],
    clear: async () => void events.splice(0),
  };
  const quarantine: ClearableEventQuarantine = {
    put: async (items) => void quarantined.push(...items),
    all: async () => [...quarantined],
    clear: async () => void quarantined.splice(0),
  };
  return { eventStore, quarantine };
}

function populatedSession(storage: SnapshotStorage) {
  const session = createSessionState({
    storage,
    contentVersion: CONTENT_VERSION,
    ruleVersion: RULE_VERSION,
    initialProgression: {
      level: 3,
      lifetimeXp: 120,
      xpIntoLevel: 20,
      appliedEventIds: ["settlement-1"],
    },
  });
  session.setLastSession({
    sessionId: "daily-1",
    firstAttemptOutcomes: [true],
    answeredCount: 1,
  });
  session.markGreeted();
  session.setActiveDaily(activeDaily());
  session.setActiveAssessment(activeAssessment());
  session.setActiveChallenge(activeChallenge());
  session.saveCurrentChallengeSource({
    childDifficulty: 1,
    contentVersion: CONTENT_VERSION,
    updatedAt: 1,
  });
  session.recordSettlement(
    { xpAwarded: 10, accuracyBonus: 0, firstCorrectRate: 1 },
    "settlement-2",
  );
  return session;
}

describe("clearLearningRecords", () => {
  it("clears only learning records and resets the committed session state", async () => {
    const storage = memoryStorage({
      cc_guardian_settings_v1: { preserved: "settings" },
      cc_content_cache_index_v2: { preserved: "content" },
      cc_auth_session_v1: { preserved: "auth" },
      cc_guest_child_v1: { preserved: "identity" },
      [ASSESSMENT_COMPLETED_KEY]: true,
      [LAST_CHALLENGE_RESULT_KEY]: { winner: "CHILD" },
      [RECENT_CHALLENGES_KEY]: { version: 1, challenges: [] },
    });
    const session = populatedSession(storage);
    const records = clearableRecords();

    await clearLearningRecords({
      session,
      events: records.eventStore,
      quarantine: records.quarantine,
    });

    expect(session.getState()).toEqual({
      lastSession: null,
      lastSettlement: null,
      progression: {
        level: 1,
        lifetimeXp: 0,
        xpIntoLevel: 0,
        appliedEventIds: [],
      },
      settledDayCount: 0,
      hasGreeted: false,
      activeDaily: null,
      activeAssessment: null,
      assessmentCompleted: false,
      dailyPlanUpdated: false,
      activeChallenge: null,
      lastChallengeResult: null,
      challengeSource: null,
    });
    expect(await records.eventStore.all()).toEqual([]);
    expect(await records.quarantine.all()).toEqual([]);
    for (const key of LEARNING_KEYS) expect(storage.read(key)).toBeNull();
    expect(storage.read("cc_guardian_settings_v1")).toEqual({
      preserved: "settings",
    });
    expect(storage.read("cc_content_cache_index_v2")).toEqual({
      preserved: "content",
    });
    expect(storage.read("cc_auth_session_v1")).toEqual({
      preserved: "auth",
    });
    expect(storage.read("cc_guest_child_v1")).toEqual({
      preserved: "identity",
    });
  });

  it.each([
    ["events", "eventStore"],
    ["quarantine", "quarantine"],
  ] as const)(
    "does not reset memory when clearing %s fails",
    async (label, failingPort) => {
      const storage = memoryStorage();
      const session = populatedSession(storage);
      const before = session.getState();
      const records = clearableRecords();
      vi.spyOn(records[failingPort], "clear").mockRejectedValueOnce(
        new Error(`${label} unavailable`),
      );

      await expect(
        clearLearningRecords({
          session,
          events: records.eventStore,
          quarantine: records.quarantine,
        }),
      ).rejects.toThrow(`${label} unavailable`);

      expect(session.getState()).toBe(before);
    },
  );

  it("does not reset memory when a required snapshot cannot be removed", async () => {
    const storage = memoryStorage();
    const session = populatedSession(storage);
    const before = session.getState();
    const remove = storage.remove;
    storage.remove = (key) => {
      if (key !== ACTIVE_DAILY_KEY) remove(key);
    };
    const records = clearableRecords();

    await expect(
      clearLearningRecords({
        session,
        events: records.eventStore,
        quarantine: records.quarantine,
      }),
    ).rejects.toThrow(`failed to clear learning record: ${ACTIVE_DAILY_KEY}`);

    expect(session.getState()).toBe(before);
  });
});
