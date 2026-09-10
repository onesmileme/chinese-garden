import Taro from "@tarojs/taro";
import {
  ACTIVE_ASSESSMENT_KEY,
  ACTIVE_DAILY_KEY,
  ASSESSMENT_COMPLETED_KEY,
  type ActiveAssessmentSession,
  type ActiveDailySession,
} from "@cc/application";
import { asKnowledgePointId } from "@cc/content-schema";
import { initAssessment } from "@cc/domain";
import { beforeEach, describe, expect, it } from "vitest";
import { createWeappPlatform } from "../src/platform/weapp";
import {
  CONTENT_VERSION,
  RULE_VERSION,
  createMiniappSessionState,
} from "../src/session-state";

const daily: ActiveDailySession = {
  session: {
    sessionId: "miniapp-daily",
    levels: [
      {
        name: "WAKEUP",
        slots: [
          {
            role: "DUE_REVIEW",
            kpId: asKnowledgePointId("hz-yue-月"),
          },
        ],
      },
    ],
    contentVersion: CONTENT_VERSION,
    ruleVersion: RULE_VERSION,
  },
  currentIndex: 0,
  firstAttemptOutcomes: [],
  contentVersion: CONTENT_VERSION,
  contentSelection: {
    childProfileId: "miniapp-child",
    authentication: "GUEST",
    version: CONTENT_VERSION,
    abilityLevel: 5,
  },
  ruleVersion: RULE_VERSION,
  updatedAt: 10,
};

const assessment: ActiveAssessmentSession = {
  state: initAssessment(0),
  round: 0,
  questionIndex: 2,
  correctCount: 1,
  startedAt: 1,
  contentVersion: CONTENT_VERSION,
  contentSelection: {
    childProfileId: "miniapp-child",
    authentication: "GUEST",
    version: CONTENT_VERSION,
    abilityLevel: 5,
  },
  updatedAt: 10,
};

beforeEach(() => {
  Taro.removeStorageSync(ACTIVE_DAILY_KEY);
  Taro.removeStorageSync(ACTIVE_ASSESSMENT_KEY);
  Taro.removeStorageSync(ASSESSMENT_COMPLETED_KEY);
});

describe("miniapp session state", () => {
  it("uses corpus-v5 as the current content version", () => {
    expect(CONTENT_VERSION).toBe("corpus-v5");
  });

  it("recovers active daily progress from Taro snapshots", () => {
    const host = createWeappPlatform();
    const first = createMiniappSessionState(host);
    first.setActiveDaily(daily);

    const recovered = createMiniappSessionState(host);

    expect(recovered.getState().activeDaily).toEqual(daily);
  });

  it("retains a remote-version daily session across app restart", () => {
    const host = createWeappPlatform();
    const first = createMiniappSessionState(host);
    const remoteDaily = {
      ...daily,
      session: { ...daily.session, contentVersion: "corpus-v6" },
      contentVersion: "corpus-v6",
      contentSelection: {
        ...daily.contentSelection,
        version: "corpus-v6",
      },
    };
    first.setActiveDaily(remoteDaily);

    expect(createMiniappSessionState(host).getState().activeDaily).toEqual(
      remoteDaily,
    );
  });

  it("persists assessment completion before clearing progress", () => {
    const host = createWeappPlatform();
    const state = createMiniappSessionState(host);
    state.setActiveAssessment(assessment);

    state.completeAssessment();

    expect(state.getState()).toMatchObject({
      activeAssessment: null,
      assessmentCompleted: true,
    });
    expect(host.snapshots.read(ASSESSMENT_COMPLETED_KEY)).toBe(true);
    expect(host.snapshots.read(ACTIVE_ASSESSMENT_KEY)).toBeNull();
  });

  it("uses the same settlement idempotency as the browser host", () => {
    const state = createMiniappSessionState(createWeappPlatform());
    const settlement = {
      xpAwarded: 30,
      accuracyBonus: 10,
      firstCorrectRate: 1,
    };

    state.recordSettlement(settlement, "settlement-miniapp");
    state.recordSettlement(settlement, "settlement-miniapp");

    expect(state.getState()).toMatchObject({
      lastSettlement: settlement,
      settledDayCount: 1,
      progression: {
        lifetimeXp: 30,
        appliedEventIds: ["settlement-miniapp"],
      },
    });
  });
});
