import { describe, expect, it, vi } from "vitest";
import {
  ACTIVE_ASSESSMENT_KEY,
  ACTIVE_DAILY_KEY,
  ASSESSMENT_COMPLETED_KEY,
  clearActiveAssessment,
  clearActiveDaily,
  createSessionState,
  loadActiveAssessment,
  loadActiveDaily,
  loadAssessmentCompleted,
  markAssessmentCompleted,
  saveActiveAssessment,
  saveActiveDaily,
  type ActiveAssessmentSession,
  type ActiveDailySession,
  type SnapshotStorage,
} from "../src";

function memoryStorage(): SnapshotStorage {
  const values = new Map<string, unknown>();
  return {
    read: <T>(key: string) => (values.get(key) as T | undefined) ?? null,
    write: (key, value) => values.set(key, value),
    remove: (key) => values.delete(key),
  };
}

const daily: ActiveDailySession = {
  session: {
    sessionId: "daily-1",
    levels: [
      {
        name: "WAKEUP",
        slots: [{ role: "DUE_REVIEW", kpId: "char:山" }],
      },
    ],
    contentVersion: "corpus-v4",
    ruleVersion: "mastery-v1",
  },
  currentIndex: 5,
  firstAttemptOutcomes: [true, false, true, true, true],
  pendingStageCompletion: "热身",
  contentVersion: "corpus-v4",
  contentSelection: {
    childProfileId: "child-1",
    authentication: "AUTHENTICATED",
    version: "corpus-v4",
    abilityLevel: 2,
  },
  ruleVersion: "mastery-v1",
  updatedAt: 100,
};

const assessment: ActiveAssessmentSession = {
  state: {
    currentLevelIndex: 2,
    scoredQuestions: 5,
    elapsedMs: 30_000,
    confirmedPassIndex: 1,
    higherFailed: false,
    finished: false,
    resultLevelIndex: null,
  },
  round: 2,
  questionIndex: 3,
  correctCount: 2,
  extraCorrectCount: 1,
  startedAt: 1_000,
  contentVersion: "corpus-v4",
  contentSelection: {
    childProfileId: "child-1",
    authentication: "AUTHENTICATED",
    version: "corpus-v4",
    abilityLevel: 2,
  },
  updatedAt: 200,
};

it("uses stable application-owned storage keys", () => {
  expect([
    ACTIVE_DAILY_KEY,
    ACTIVE_ASSESSMENT_KEY,
    ASSESSMENT_COMPLETED_KEY,
  ]).toEqual([
    "cc_active_daily_v1",
    "cc_active_assessment_v1",
    "cc_assessment_completed_v1",
  ]);
});

describe("active daily session", () => {
  it("round trips a compatible snapshot", () => {
    const storage = memoryStorage();

    saveActiveDaily(storage, daily);

    expect(loadActiveDaily(storage, "corpus-v4", "mastery-v1")).toEqual(
      daily,
    );
  });

  it("clears a snapshot", () => {
    const storage = memoryStorage();
    saveActiveDaily(storage, daily);

    clearActiveDaily(storage);

    expect(loadActiveDaily(storage, "corpus-v4", "mastery-v1")).toBeNull();
  });

  it("removes a snapshot when the content version changes", () => {
    const storage = memoryStorage();
    saveActiveDaily(storage, daily);

    expect(loadActiveDaily(storage, "corpus-v2", "mastery-v1")).toBeNull();
    expect(loadActiveDaily(storage, "corpus-v4", "mastery-v1")).toBeNull();
  });

  it("removes a snapshot when the rule version changes", () => {
    const storage = memoryStorage();
    saveActiveDaily(storage, daily);

    expect(loadActiveDaily(storage, "corpus-v4", "mastery-v2")).toBeNull();
    expect(loadActiveDaily(storage, "corpus-v4", "mastery-v1")).toBeNull();
  });

  it("retains a version-pinned daily snapshot when requested", () => {
    const storage = memoryStorage();
    saveActiveDaily(storage, daily);

    expect(
      loadActiveDaily(storage, "corpus-v5", "mastery-v2", true),
    ).toEqual(daily);
  });

  it("returns null when no snapshot exists", () => {
    expect(
      loadActiveDaily(memoryStorage(), "corpus-v4", "mastery-v1"),
    ).toBeNull();
  });

  it("removes a snapshot without a valid content selection", () => {
    const storage = memoryStorage();
    storage.write(ACTIVE_DAILY_KEY, { ...daily, contentSelection: null });

    expect(loadActiveDaily(storage, "corpus-v4", "mastery-v1")).toBeNull();
    expect(storage.read(ACTIVE_DAILY_KEY)).toBeNull();
  });
});

describe("session version policy", () => {
  it.each([
    { contentVersion: "corpus-v3", ruleVersion: "mastery-v1" },
    { contentVersion: "corpus-v4", ruleVersion: "mastery-v0" },
  ])("invalidates incompatible sessions by default", (versions) => {
    const storage = memoryStorage();
    saveActiveDaily(storage, { ...daily, ...versions });
    const state = createSessionState({
      storage,
      contentVersion: "corpus-v4",
      ruleVersion: "mastery-v1",
    });
    const listener = vi.fn();
    state.subscribe(listener);

    expect(state.getState().dailyPlanUpdated).toBe(true);
    state.consumeDailyPlanUpdated();

    expect(state.getState().dailyPlanUpdated).toBe(false);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("keeps compatible sessions without publishing an update", () => {
    const storage = memoryStorage();
    saveActiveDaily(storage, daily);
    saveActiveAssessment(storage, assessment);
    const state = createSessionState({
      storage,
      contentVersion: "corpus-v4",
      ruleVersion: "mastery-v1",
    });
    const listener = vi.fn();
    state.subscribe(listener);

    state.consumeDailyPlanUpdated();

    expect(state.getState().dailyPlanUpdated).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it("invalidates an incompatible assessment", () => {
    const storage = memoryStorage();
    saveActiveDaily(storage, daily);
    saveActiveAssessment(storage, {
      ...assessment,
      contentVersion: "corpus-v3",
    });

    const state = createSessionState({
      storage,
      contentVersion: "corpus-v4",
      ruleVersion: "mastery-v1",
    });

    expect(state.getState().dailyPlanUpdated).toBe(true);
    expect(state.getState().activeDaily).toEqual(daily);
    expect(state.getState().activeAssessment).toBeNull();
  });
});

describe("active assessment session", () => {
  it("round trips a compatible snapshot", () => {
    const storage = memoryStorage();

    saveActiveAssessment(storage, assessment);

    expect(loadActiveAssessment(storage, "corpus-v4")).toEqual(assessment);
  });

  it("removes a snapshot when the content version changes", () => {
    const storage = memoryStorage();
    saveActiveAssessment(storage, assessment);

    expect(loadActiveAssessment(storage, "corpus-v2")).toBeNull();
    expect(loadActiveAssessment(storage, "corpus-v4")).toBeNull();
  });

  it("retains a version-pinned assessment when requested", () => {
    const storage = memoryStorage();
    saveActiveAssessment(storage, assessment);

    expect(loadActiveAssessment(storage, "corpus-v5", true)).toEqual(
      assessment,
    );
  });

  it("clears a snapshot", () => {
    const storage = memoryStorage();
    saveActiveAssessment(storage, assessment);

    clearActiveAssessment(storage);

    expect(loadActiveAssessment(storage, "corpus-v4")).toBeNull();
  });

  it("returns null when no snapshot exists", () => {
    expect(loadActiveAssessment(memoryStorage(), "corpus-v4")).toBeNull();
  });

  it("removes a snapshot without a valid content selection", () => {
    const storage = memoryStorage();
    storage.write(ACTIVE_ASSESSMENT_KEY, {
      ...assessment,
      contentSelection: null,
    });

    expect(loadActiveAssessment(storage, "corpus-v4")).toBeNull();
    expect(storage.read(ACTIVE_ASSESSMENT_KEY)).toBeNull();
  });
});

describe("assessment completion", () => {
  it("is false before completion is marked", () => {
    expect(loadAssessmentCompleted(memoryStorage())).toBe(false);
  });

  it("is false when the stored value is not a boolean", () => {
    const storage = memoryStorage();
    storage.write(ASSESSMENT_COMPLETED_KEY, "true");

    expect(loadAssessmentCompleted(storage)).toBe(false);
  });

  it("persists independently from the active assessment snapshot", () => {
    const storage = memoryStorage();
    saveActiveAssessment(storage, assessment);

    markAssessmentCompleted(storage);
    clearActiveAssessment(storage);

    expect(loadActiveAssessment(storage, "corpus-v4")).toBeNull();
    expect(loadAssessmentCompleted(storage)).toBe(true);
  });
});
