import { useSyncExternalStore } from "react";
import {
  createSessionState,
  type AppState,
  type SessionState,
} from "@cc/application";
import { platform, type Platform } from "./platform";

export const CONTENT_VERSION = "corpus-v5";
export const RULE_VERSION = "mastery-v1";

export function createMiniappSessionState(
  host: Pick<Platform, "snapshots">,
): SessionState {
  return createSessionState({
    storage: host.snapshots,
    contentVersion: CONTENT_VERSION,
    ruleVersion: RULE_VERSION,
    retainVersionedSessions: true,
  });
}

export const sessionState = createMiniappSessionState(platform);

export const getState = sessionState.getState;
export const setActiveChallenge = sessionState.setActiveChallenge;
export const recordChallengeResult = sessionState.recordChallengeResult;
export const saveCurrentChallengeSource =
  sessionState.saveCurrentChallengeSource;

export function useAppState(): AppState {
  return useSyncExternalStore(
    sessionState.subscribe,
    sessionState.getState,
    sessionState.getState,
  );
}

export type { AppState, SessionState };
