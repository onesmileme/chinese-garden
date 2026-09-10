import {
  CHALLENGE_RULE_VERSION,
  settleXpEvents,
  type ChallengeResultDetails,
  type ProgressionState,
} from "@cc/domain";
import type { DaySettlement } from "./settle-day";
import {
  clearActiveChallenge,
  loadActiveChallenge,
  loadChallengeSource,
  loadLastChallengeResult,
  persistCompletedChallenge,
  saveActiveChallenge,
  saveChallengeSource,
  type ActiveChallengeSession,
  type ChallengeSource,
  type LastChallengeResult,
} from "../challenge/active-challenge";
import {
  ACTIVE_ASSESSMENT_KEY,
  ACTIVE_DAILY_KEY,
  clearActiveAssessment,
  clearActiveDaily,
  loadActiveAssessment,
  loadActiveDaily,
  loadAssessmentCompleted,
  markAssessmentCompleted,
  saveActiveAssessment,
  saveActiveDaily,
  type ActiveAssessmentSession,
  type ActiveDailySession,
  type SnapshotStorage,
} from "./active-session";

export interface SessionResult {
  sessionId: string;
  firstAttemptOutcomes: boolean[];
  answeredCount: number;
}

export interface AppState {
  lastSession: SessionResult | null;
  lastSettlement: DaySettlement | null;
  progression: ProgressionState;
  settledDayCount: number;
  hasGreeted: boolean;
  activeDaily: ActiveDailySession | null;
  activeAssessment: ActiveAssessmentSession | null;
  assessmentCompleted: boolean;
  dailyPlanUpdated: boolean;
  activeChallenge: ActiveChallengeSession | null;
  lastChallengeResult: LastChallengeResult | null;
  challengeSource: ChallengeSource | null;
}

export interface SessionState {
  getState(): AppState;
  subscribe(listener: () => void): () => void;
  setLastSession(result: SessionResult): void;
  markGreeted(): void;
  consumeDailyPlanUpdated(): void;
  setActiveDaily(snapshot: ActiveDailySession): void;
  clearDailyProgress(): void;
  setActiveAssessment(snapshot: ActiveAssessmentSession): void;
  clearAssessmentProgress(): void;
  completeAssessment(): void;
  recordSettlement(settlement: DaySettlement, eventId: string): void;
  setActiveChallenge(snapshot: ActiveChallengeSession): void;
  clearChallengeProgress(): void;
  saveCurrentChallengeSource(source: ChallengeSource): void;
  recordChallengeResult(details: ChallengeResultDetails): boolean;
}

export interface CreateSessionStateOptions {
  storage: SnapshotStorage;
  contentVersion: string;
  ruleVersion: string;
  initialProgression?: ProgressionState;
  retainVersionedSessions?: boolean;
}

const EMPTY_PROGRESSION: ProgressionState = {
  level: 1,
  lifetimeXp: 0,
  xpIntoLevel: 0,
  appliedEventIds: [],
};

function isOutdatedDaily(
  snapshot: ActiveDailySession | null,
  contentVersion: string,
  ruleVersion: string,
): boolean {
  return (
    snapshot !== null &&
    (snapshot.contentVersion !== contentVersion ||
      snapshot.ruleVersion !== ruleVersion)
  );
}

function isOutdatedAssessment(
  snapshot: ActiveAssessmentSession | null,
  contentVersion: string,
): boolean {
  return snapshot !== null && snapshot.contentVersion !== contentVersion;
}

function completedSession(
  snapshot: ActiveDailySession | null,
): SessionResult | null {
  if (snapshot === null) return null;
  const plannedQuestionCount = snapshot.session.levels.reduce(
    (count, level) => count + level.slots.length,
    0,
  );
  if (
    plannedQuestionCount === 0 ||
    snapshot.currentIndex < plannedQuestionCount ||
    snapshot.firstAttemptOutcomes.length !== plannedQuestionCount
  ) {
    return null;
  }
  return {
    sessionId: snapshot.session.sessionId,
    firstAttemptOutcomes: snapshot.firstAttemptOutcomes,
    answeredCount: snapshot.firstAttemptOutcomes.length,
  };
}

export function createSessionState({
  storage,
  contentVersion,
  ruleVersion,
  initialProgression = EMPTY_PROGRESSION,
  retainVersionedSessions = false,
}: CreateSessionStateOptions): SessionState {
  const storedDaily = storage.read<ActiveDailySession>(ACTIVE_DAILY_KEY);
  const storedAssessment =
    storage.read<ActiveAssessmentSession>(ACTIVE_ASSESSMENT_KEY);
  const dailyPlanUpdated =
    !retainVersionedSessions &&
    (isOutdatedDaily(storedDaily, contentVersion, ruleVersion) ||
      isOutdatedAssessment(storedAssessment, contentVersion));
  const activeDaily = loadActiveDaily(
    storage,
    contentVersion,
    ruleVersion,
    retainVersionedSessions,
  );
  const activeAssessment = loadActiveAssessment(
    storage,
    contentVersion,
    retainVersionedSessions,
  );
  const activeChallenge = loadActiveChallenge(
    storage,
    contentVersion,
    CHALLENGE_RULE_VERSION,
    retainVersionedSessions,
  );
  const lastChallengeResult = loadLastChallengeResult(storage);
  const challengeSource = loadChallengeSource(storage, contentVersion);

  let state: AppState = {
    lastSession: completedSession(activeDaily),
    lastSettlement: null,
    progression: {
      ...initialProgression,
      appliedEventIds: [...initialProgression.appliedEventIds],
    },
    settledDayCount: 0,
    hasGreeted: false,
    activeDaily,
    activeAssessment,
    assessmentCompleted: loadAssessmentCompleted(storage),
    dailyPlanUpdated,
    activeChallenge,
    lastChallengeResult,
    challengeSource,
  };
  const listeners = new Set<() => void>();

  function emit(): void {
    for (const listener of listeners) listener();
  }

  function update(next: AppState): void {
    state = next;
    emit();
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    setLastSession(result) {
      update({ ...state, lastSession: result });
    },

    markGreeted() {
      update({ ...state, hasGreeted: true });
    },

    consumeDailyPlanUpdated() {
      if (!state.dailyPlanUpdated) return;
      update({ ...state, dailyPlanUpdated: false });
    },

    setActiveDaily(snapshot) {
      saveActiveDaily(storage, snapshot);
      update({ ...state, activeDaily: snapshot });
    },

    clearDailyProgress() {
      clearActiveDaily(storage);
      update({ ...state, activeDaily: null });
    },

    setActiveAssessment(snapshot) {
      saveActiveAssessment(storage, snapshot);
      update({ ...state, activeAssessment: snapshot });
    },

    clearAssessmentProgress() {
      clearActiveAssessment(storage);
      update({ ...state, activeAssessment: null });
    },

    completeAssessment() {
      markAssessmentCompleted(storage);
      const assessmentCompleted = loadAssessmentCompleted(storage);
      if (assessmentCompleted) clearActiveAssessment(storage);
      update({
        ...state,
        activeAssessment: assessmentCompleted ? null : state.activeAssessment,
        assessmentCompleted,
      });
    },

    recordSettlement(settlement, eventId) {
      if (state.progression.appliedEventIds.includes(eventId)) return;
      const progression = settleXpEvents(state.progression, [
        { eventId, xp: settlement.xpAwarded },
      ]);
      update({
        ...state,
        lastSettlement: settlement,
        progression,
        settledDayCount: state.settledDayCount + 1,
      });
    },

    setActiveChallenge(snapshot) {
      saveActiveChallenge(storage, snapshot);
      update({ ...state, activeChallenge: snapshot });
    },

    clearChallengeProgress() {
      clearActiveChallenge(storage);
      update({ ...state, activeChallenge: null });
    },

    saveCurrentChallengeSource(source) {
      saveChallengeSource(storage, source);
      update({ ...state, challengeSource: source });
    },

    recordChallengeResult(details) {
      if (!persistCompletedChallenge(storage, details)) return false;
      update({
        ...state,
        activeChallenge: null,
        lastChallengeResult: loadLastChallengeResult(storage),
      });
      return true;
    },
  };
}
