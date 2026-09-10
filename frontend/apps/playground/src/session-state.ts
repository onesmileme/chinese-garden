import { useSyncExternalStore } from "react";
import {
  createSessionState as createSharedSessionState,
  type AppState,
  type CreateSessionStateOptions as SharedCreateSessionStateOptions,
  type SessionResult,
  type SessionState,
} from "@cc/application";
import { browserSnapshotStorage } from "./session-snapshot-storage";

export const CONTENT_VERSION = "corpus-v5";
export const RULE_VERSION = "mastery-v1";

export type { AppState, SessionResult, SessionState };

export type CreateSessionStateOptions = Omit<
  SharedCreateSessionStateOptions,
  "contentVersion" | "ruleVersion"
> & {
  contentVersion?: string;
  ruleVersion?: string;
};

export function createSessionState({
  storage,
  contentVersion = CONTENT_VERSION,
  ruleVersion = RULE_VERSION,
  initialProgression,
}: CreateSessionStateOptions): SessionState {
  return createSharedSessionState({
    storage,
    contentVersion,
    ruleVersion,
    retainVersionedSessions: true,
    ...(initialProgression === undefined ? {} : { initialProgression }),
  });
}

export const sessionState = createSessionState({
  storage: browserSnapshotStorage,
});

export const getState = sessionState.getState;
export const setLastSession = sessionState.setLastSession;
export const markGreeted = sessionState.markGreeted;
export const consumeDailyPlanUpdated = sessionState.consumeDailyPlanUpdated;
export const setActiveDaily = sessionState.setActiveDaily;
export const clearDailyProgress = sessionState.clearDailyProgress;
export const setActiveAssessment = sessionState.setActiveAssessment;
export const clearAssessmentProgress = sessionState.clearAssessmentProgress;
export const completeAssessment = sessionState.completeAssessment;
export const recordSettlement = sessionState.recordSettlement;
export const setActiveChallenge = sessionState.setActiveChallenge;
export const clearChallengeProgress = sessionState.clearChallengeProgress;
export const saveCurrentChallengeSource =
  sessionState.saveCurrentChallengeSource;
export const recordChallengeResult = sessionState.recordChallengeResult;

export function useAppState(): AppState {
  return useSyncExternalStore(
    sessionState.subscribe,
    sessionState.getState,
    sessionState.getState,
  );
}
