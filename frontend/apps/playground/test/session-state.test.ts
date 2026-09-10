// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import {
  ACTIVE_ASSESSMENT_KEY,
  ACTIVE_DAILY_KEY,
  ASSESSMENT_COMPLETED_KEY,
  type ActiveAssessmentSession,
  type ActiveDailySession,
  type SnapshotStorage,
} from "@cc/application";
import { asKnowledgePointId } from "@cc/content-schema";
import { generateDailyPlan, initAssessment } from "@cc/domain";
import {
  assessmentLevelKpIds,
  dailyPlanInput,
  kindForKp,
  kpTitle,
} from "../src/mock/learning-content";
import { getRoute, navigate, subscribeRoute } from "../src/router";
import {
  CONTENT_VERSION,
  RULE_VERSION,
  createSessionState,
} from "../src/session-state";

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

const daily: ActiveDailySession = {
  session: {
    sessionId: "daily-1",
    levels: [
      {
        name: "WAKEUP",
        slots: [
          { role: "DUE_REVIEW", kpId: asKnowledgePointId("hz-yue-月") },
          { role: "DUE_REVIEW", kpId: asKnowledgePointId("hz-guang-光") },
        ],
      },
    ],
    contentVersion: CONTENT_VERSION,
    ruleVersion: RULE_VERSION,
  },
  currentIndex: 1,
  firstAttemptOutcomes: [true],
  contentVersion: CONTENT_VERSION,
  contentSelection: {
    childProfileId: "debug-child",
    authentication: "GUEST",
    version: CONTENT_VERSION,
    abilityLevel: 5,
  },
  ruleVersion: RULE_VERSION,
  updatedAt: 100,
};

const assessment: ActiveAssessmentSession = {
  state: initAssessment(0),
  round: 0,
  questionIndex: 2,
  correctCount: 1,
  startedAt: 50,
  contentVersion: CONTENT_VERSION,
  contentSelection: {
    childProfileId: "debug-child",
    authentication: "GUEST",
    version: CONTENT_VERSION,
    abilityLevel: 5,
  },
  updatedAt: 100,
};

describe("createSessionState", () => {
  it("uses corpus-v5 as the current content version", () => {
    expect(CONTENT_VERSION).toBe("corpus-v5");
  });

  it("loads active daily, assessment, and completion snapshots", () => {
    const storage = memoryStorage({
      [ACTIVE_DAILY_KEY]: daily,
      [ACTIVE_ASSESSMENT_KEY]: assessment,
      [ASSESSMENT_COMPLETED_KEY]: true,
    });

    const sessionState = createSessionState({ storage });

    expect(sessionState.getState()).toMatchObject({
      activeDaily: daily,
      activeAssessment: assessment,
      assessmentCompleted: true,
      dailyPlanUpdated: false,
    });
  });

  it("reconstructs a completed session from a complete daily snapshot", () => {
    const completedDaily: ActiveDailySession = {
      ...daily,
      currentIndex: 2,
      firstAttemptOutcomes: [true, false],
    };
    const sessionState = createSessionState({
      storage: memoryStorage({ [ACTIVE_DAILY_KEY]: completedDaily }),
    });

    expect(sessionState.getState().lastSession).toEqual({
      sessionId: "daily-1",
      firstAttemptOutcomes: [true, false],
      answeredCount: 2,
    });
  });

  it.each([
    { contentVersion: "corpus-v1", ruleVersion: RULE_VERSION },
    { contentVersion: CONTENT_VERSION, ruleVersion: "mastery-v0" },
  ])("retains an active daily snapshot pinned to its original versions", (versions) => {
    const storage = memoryStorage({
      [ACTIVE_DAILY_KEY]: { ...daily, ...versions },
    });
    const sessionState = createSessionState({ storage });

    expect(sessionState.getState()).toMatchObject({
      activeDaily: { ...daily, ...versions },
      dailyPlanUpdated: false,
    });
    expect(storage.read(ACTIVE_DAILY_KEY)).toEqual({ ...daily, ...versions });
  });

  it("retains an active assessment pinned to its original content", () => {
    const pinned = {
      ...assessment,
      contentVersion: "corpus-v1",
    };
    const storage = memoryStorage({
      [ACTIVE_ASSESSMENT_KEY]: pinned,
    });

    const sessionState = createSessionState({ storage });

    expect(sessionState.getState()).toMatchObject({
      activeAssessment: pinned,
      dailyPlanUpdated: false,
    });
    expect(storage.read(ACTIVE_ASSESSMENT_KEY)).toEqual(pinned);
  });

  it("creates, updates, and clears active snapshots through its public API", () => {
    const storage = memoryStorage();
    const sessionState = createSessionState({ storage });
    const listener = vi.fn();
    sessionState.subscribe(listener);

    sessionState.setActiveDaily(daily);
    sessionState.setActiveDaily({ ...daily, currentIndex: 2 });
    expect(storage.read(ACTIVE_DAILY_KEY)).toEqual({
      ...daily,
      currentIndex: 2,
    });
    sessionState.clearDailyProgress();
    expect(sessionState.getState().activeDaily).toBeNull();
    expect(storage.read(ACTIVE_DAILY_KEY)).toBeNull();

    sessionState.setActiveAssessment(assessment);
    sessionState.setActiveAssessment({ ...assessment, questionIndex: 3 });
    expect(storage.read(ACTIVE_ASSESSMENT_KEY)).toEqual({
      ...assessment,
      questionIndex: 3,
    });
    sessionState.clearAssessmentProgress();
    expect(sessionState.getState().activeAssessment).toBeNull();
    expect(storage.read(ACTIVE_ASSESSMENT_KEY)).toBeNull();
    expect(listener).toHaveBeenCalledTimes(6);
  });

  it("persists and reads completion before clearing the active assessment", () => {
    const storage = memoryStorage({
      [ACTIVE_ASSESSMENT_KEY]: assessment,
    });
    const sessionState = createSessionState({ storage });

    sessionState.completeAssessment();

    expect(sessionState.getState()).toMatchObject({
      activeAssessment: null,
      assessmentCompleted: true,
    });
    expect(storage.read(ASSESSMENT_COMPLETED_KEY)).toBe(true);
    expect(storage.read(ACTIVE_ASSESSMENT_KEY)).toBeNull();
  });

  it("retains the active assessment when completion cannot be persisted", () => {
    const storage = memoryStorage({
      [ACTIVE_ASSESSMENT_KEY]: assessment,
    });
    const write = storage.write;
    storage.write = (key, value) => {
      if (key !== ASSESSMENT_COMPLETED_KEY) write(key, value);
    };
    const sessionState = createSessionState({ storage });

    sessionState.completeAssessment();

    expect(sessionState.getState()).toMatchObject({
      activeAssessment: assessment,
      assessmentCompleted: false,
    });
    expect(storage.read(ASSESSMENT_COMPLETED_KEY)).toBeNull();
    expect(storage.read(ACTIVE_ASSESSMENT_KEY)).toEqual(assessment);
  });

  it("sets, records, sources, and clears challenge progress via its public API", () => {
    const storage = memoryStorage();
    const sessionState = createSessionState({ storage });
    const active = {
      challengeId: "challenge-1",
      startedAt: 0,
      phase: "CHILD_TURN",
      handoffTarget: null,
      config: {
        mode: "TIMED",
        tier: "STANDARD",
        dimension: "PINYIN",
        childDifficulty: 1,
        abilityLevel: 5,
        durationMs: 60_000,
        questionCount: 10,
        contentVersion: CONTENT_VERSION,
        ruleVersion: "challenge-v1",
      },
      child: {
        participant: "CHILD",
        questionIndex: 0,
        answeredCount: 0,
        correctCount: 0,
        activeElapsedMs: 0,
        remainingMs: 60_000,
      },
      parent: {
        participant: "PARENT",
        questionIndex: 0,
        answeredCount: 0,
        correctCount: 0,
        activeElapsedMs: 0,
        remainingMs: 60_000,
      },
      paused: false,
      updatedAt: 0,
    } as Parameters<typeof sessionState.setActiveChallenge>[0];

    sessionState.saveCurrentChallengeSource({
      childDifficulty: 1,
      contentVersion: CONTENT_VERSION,
      updatedAt: 1,
    });
    expect(sessionState.getState().challengeSource).toMatchObject({
      childDifficulty: 1,
    });

    sessionState.setActiveChallenge(active);
    expect(sessionState.getState().activeChallenge).toEqual(active);

    sessionState.clearChallengeProgress();
    expect(sessionState.getState().activeChallenge).toBeNull();
  });

  it("records a completed challenge result and clears the active session", () => {
    const storage = memoryStorage();
    const sessionState = createSessionState({ storage });

    const persisted = sessionState.recordChallengeResult({
      winner: "CHILD",
      mode: "TIMED",
      playedAt: 500,
      child: { correctCount: 8, answeredCount: 10, activeElapsedMs: 60_000 },
      parent: { correctCount: 6, answeredCount: 9, activeElapsedMs: 60_000 },
      replay: { mode: "TIMED", tier: "STANDARD" },
    });

    expect(persisted).toBe(true);
    expect(sessionState.getState()).toMatchObject({
      activeChallenge: null,
      lastChallengeResult: { winner: "CHILD", mode: "TIMED" },
    });
  });

  it("settles progression only once for a stable event id", () => {
    const sessionState = createSessionState({
      storage: memoryStorage(),
    });
    const settlement = {
      xpAwarded: 30,
      accuracyBonus: 10,
      firstCorrectRate: 1,
    };

    sessionState.recordSettlement(settlement, "settlement-1");
    sessionState.recordSettlement(settlement, "settlement-1");

    expect(sessionState.getState()).toMatchObject({
      lastSettlement: settlement,
      progression: {
        lifetimeXp: 30,
        appliedEventIds: ["settlement-1"],
      },
      settledDayCount: 1,
    });
  });

  it("tracks greeting and explicit completed-session results", () => {
    const sessionState = createSessionState({ storage: memoryStorage() });
    const result = {
      sessionId: "daily-2",
      firstAttemptOutcomes: [true],
      answeredCount: 1,
    };

    sessionState.markGreeted();
    sessionState.setLastSession(result);

    expect(sessionState.getState()).toMatchObject({
      hasGreeted: true,
      lastSession: result,
    });
  });
});

describe("hash router", () => {
  it("supports the fixed routes and redirects unknown hashes home", () => {
    window.location.hash = "#/lesson";
    expect(getRoute()).toBe("/lesson");

    window.location.hash = "#/not-a-route";
    expect(getRoute()).toBe("/home");

    window.location.hash = "";
    expect(getRoute()).toBe("/home");

    navigate("/summary");
    expect(window.location.hash).toBe("#/summary");
  });

  it("subscribes to hash changes and can unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeRoute(listener);

    window.dispatchEvent(new Event("hashchange"));
    unsubscribe();
    window.dispatchEvent(new Event("hashchange"));

    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("learning content adapter", () => {
  it("derives character and poem titles and kinds from demoCorpus", () => {
    expect(kpTitle(asKnowledgePointId("cy-yixinyiyi"))).toBe("一心一意");
    expect(kindForKp(asKnowledgePointId("cy-yixinyiyi"))).toEqual({
      kind: "IDIOM",
    });
    expect(kpTitle(asKnowledgePointId("sc-jingyesi"))).toBe("静夜思");
    expect(kindForKp(asKnowledgePointId("sc-jingyesi"))).toEqual({
      kind: "POEM",
    });
    expect(() => kpTitle(asKnowledgePointId("missing"))).toThrow(
      "knowledge point not found: missing",
    );
  });

  it("provides assessment levels backed by existing corpus entries", () => {
    expect(assessmentLevelKpIds.length).toBeGreaterThan(0);
    expect(assessmentLevelKpIds.map(kpTitle)).toEqual([
      "一心一意",
      "静夜思",
      "春晓",
    ]);
  });

  it("uses a poem as new knowledge so the challenge slot is valid", () => {
    expect(kindForKp(dailyPlanInput.newKpId)).toEqual({ kind: "POEM" });

    const plan = generateDailyPlan(dailyPlanInput);
    const challenge = plan[2]?.slots[4];

    expect(challenge).toEqual({
      role: "CHALLENGE",
      kpId: dailyPlanInput.newKpId,
    });
  });
});
