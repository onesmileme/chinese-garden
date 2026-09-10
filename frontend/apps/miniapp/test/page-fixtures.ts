import {
  ASSESSMENT_COMPLETED_KEY,
  type ActiveDailySession,
  type SessionState,
  type SnapshotStorage,
} from "@cc/application";
import { generateDailyPlan } from "@cc/domain";
import { dailyPlanInput } from "../src/mock/content";
import {
  CONTENT_VERSION,
  RULE_VERSION,
  createMiniappSessionState,
} from "../src/session-state";

export function memorySnapshots(
  initial: Record<string, unknown> = {},
): SnapshotStorage {
  const values = new Map(Object.entries(initial));
  return {
    read: <T>(key: string) => (values.get(key) as T | undefined) ?? null,
    write: (key, value) => values.set(key, value),
    remove: (key) => values.delete(key),
  };
}

export function makeDaily(
  currentIndex = 0,
  pendingStageCompletion?: string,
): ActiveDailySession {
  const firstAttemptOutcomes = Array.from(
    { length: Math.min(currentIndex, 15) },
    () => true,
  );
  return {
    session: {
      sessionId: "miniapp-session",
      levels: generateDailyPlan(dailyPlanInput),
      contentVersion: CONTENT_VERSION,
      ruleVersion: RULE_VERSION,
    },
    currentIndex,
    firstAttemptOutcomes,
    ...(pendingStageCompletion === undefined
      ? {}
      : { pendingStageCompletion }),
    contentVersion: CONTENT_VERSION,
    contentSelection: {
      childProfileId: "miniapp-child",
      authentication: "GUEST",
      version: CONTENT_VERSION,
      abilityLevel: 5,
    },
    ruleVersion: RULE_VERSION,
    updatedAt: 100,
  };
}

export function makeState({
  assessmentCompleted = true,
  daily = makeDaily(),
}: {
  assessmentCompleted?: boolean;
  daily?: ActiveDailySession | null;
} = {}): SessionState {
  const snapshots = memorySnapshots(
    assessmentCompleted ? { [ASSESSMENT_COMPLETED_KEY]: true } : {},
  );
  const state = createMiniappSessionState({ snapshots });
  if (daily !== null) {
    state.setActiveDaily(daily);
    const total = daily.session.levels.reduce(
      (count, level) => count + level.slots.length,
      0,
    );
    if (
      daily.currentIndex >= total &&
      daily.firstAttemptOutcomes.length === total
    ) {
      state.setLastSession({
        sessionId: daily.session.sessionId,
        firstAttemptOutcomes: daily.firstAttemptOutcomes,
        answeredCount: total,
      });
    }
  }
  return state;
}
