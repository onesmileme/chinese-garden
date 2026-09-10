import type { AssessmentState } from "@cc/domain";
import {
  isContentSelection,
  type ContentSelection,
} from "../content/content-loader";
import type { DailySession } from "./start-daily";

export const ACTIVE_DAILY_KEY = "cc_active_daily_v1";
export const ACTIVE_ASSESSMENT_KEY = "cc_active_assessment_v1";
export const ASSESSMENT_COMPLETED_KEY = "cc_assessment_completed_v1";

export interface SnapshotStorage {
  read<T>(key: string): T | null;
  write<T>(key: string, value: T): void;
  remove(key: string): void;
}

export interface ActiveDailySession {
  session: DailySession;
  currentIndex: number;
  firstAttemptOutcomes: boolean[];
  pendingStageCompletion?: string;
  contentVersion: string;
  contentSelection: ContentSelection;
  ruleVersion: string;
  updatedAt: number;
}

export interface ActiveAssessmentSession {
  state: AssessmentState;
  round: number;
  questionIndex: number;
  correctCount: number;
  extraCorrectCount?: number;
  startedAt: number;
  contentVersion: string;
  contentSelection: ContentSelection;
  updatedAt: number;
}

export function saveActiveDaily(
  storage: SnapshotStorage,
  snapshot: ActiveDailySession,
): void {
  storage.write(ACTIVE_DAILY_KEY, snapshot);
}

export function clearActiveDaily(storage: SnapshotStorage): void {
  storage.remove(ACTIVE_DAILY_KEY);
}

export function loadActiveDaily(
  storage: SnapshotStorage,
  contentVersion: string,
  ruleVersion: string,
  retainVersionedSession = false,
): ActiveDailySession | null {
  const snapshot = storage.read<ActiveDailySession>(ACTIVE_DAILY_KEY);
  if (snapshot !== null && !isContentSelection(snapshot.contentSelection)) {
    clearActiveDaily(storage);
    return null;
  }
  if (
    snapshot !== null &&
    !retainVersionedSession &&
    (snapshot.contentVersion !== contentVersion ||
      snapshot.ruleVersion !== ruleVersion)
  ) {
    clearActiveDaily(storage);
    return null;
  }
  return snapshot;
}

export function saveActiveAssessment(
  storage: SnapshotStorage,
  snapshot: ActiveAssessmentSession,
): void {
  storage.write(ACTIVE_ASSESSMENT_KEY, snapshot);
}

export function clearActiveAssessment(storage: SnapshotStorage): void {
  storage.remove(ACTIVE_ASSESSMENT_KEY);
}

export function loadActiveAssessment(
  storage: SnapshotStorage,
  contentVersion: string,
  retainVersionedSession = false,
): ActiveAssessmentSession | null {
  const snapshot = storage.read<ActiveAssessmentSession>(ACTIVE_ASSESSMENT_KEY);
  if (snapshot !== null && !isContentSelection(snapshot.contentSelection)) {
    clearActiveAssessment(storage);
    return null;
  }
  if (
    snapshot !== null &&
    !retainVersionedSession &&
    snapshot.contentVersion !== contentVersion
  ) {
    clearActiveAssessment(storage);
    return null;
  }
  return snapshot;
}

export function markAssessmentCompleted(storage: SnapshotStorage): void {
  storage.write(ASSESSMENT_COMPLETED_KEY, true);
}

export function loadAssessmentCompleted(storage: SnapshotStorage): boolean {
  return storage.read<boolean>(ASSESSMENT_COMPLETED_KEY) === true;
}
