import {
  questionTypeSchema,
  type KnowledgePointId,
} from "@cc/content-schema";
import type {
  ChallengeAttempt,
  ChallengeMode,
  ChallengeResultDetails,
  ChallengeSession,
  ChallengeWinner,
  ChildDifficulty,
  DailyPlan,
  TurnProgress,
} from "@cc/domain";
import {
  isContentSelection,
  type ContentSelection,
} from "../content/content-loader";
import type { SnapshotStorage } from "../session/active-session";

export const ACTIVE_CHALLENGE_KEY = "cc_active_challenge_v1";
export const LAST_CHALLENGE_RESULT_KEY = "cc_last_challenge_result_v1";
export const CHALLENGE_SOURCE_KEY = "cc_challenge_source_v1";

export type ActiveChallengeSession = ChallengeSession & {
  phase: "CHILD_TURN" | "HANDOFF" | "PARENT_TURN";
  contentSelection: ContentSelection;
};

export interface LastChallengeResult {
  winner: ChallengeWinner;
  mode: ChallengeMode;
  playedAt: number;
}

/**
 * 挑战来源：孩子回合基准难度与内容版本。
 * 维度在 SETUP 阶段由孩子选定，不落在来源上。
 */
export interface ChallengeSource {
  childDifficulty: ChildDifficulty;
  contentVersion: string;
  updatedAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isChildDifficulty(value: unknown): value is ChildDifficulty {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 5
  );
}

function isBoundedString(
  value: unknown,
  minimum: number,
  maximum: number,
): value is string {
  return (
    typeof value === "string" &&
    value.length >= minimum &&
    value.length <= maximum
  );
}

function isChallengeAttempt(value: unknown): value is ChallengeAttempt {
  if (!isRecord(value)) return false;
  return (
    isBoundedString(value.knowledgePointId, 1, 64) &&
    questionTypeSchema.safeParse(value.questionType).success &&
    isBoundedString(value.questionSeed, 1, 128) &&
    isBoundedString(value.submittedAnswer, 0, 512) &&
    isBoundedString(value.correctAnswer, 0, 512) &&
    typeof value.correct === "boolean" &&
    isNonNegativeInteger(value.responseTimeMs) &&
    value.responseTimeMs <= 600_000
  );
}

function isTurn(
  value: unknown,
  participant: TurnProgress["participant"],
): value is TurnProgress {
  if (!isRecord(value)) return false;
  return (
    value.participant === participant &&
    isNonNegativeInteger(value.questionIndex) &&
    isNonNegativeInteger(value.answeredCount) &&
    isNonNegativeInteger(value.correctCount) &&
    value.correctCount <= value.answeredCount &&
    isNonNegativeInteger(value.activeElapsedMs) &&
    isNonNegativeInteger(value.questionActiveElapsedMs) &&
    Array.isArray(value.attempts) &&
    value.attempts.length === value.answeredCount &&
    value.attempts.every(isChallengeAttempt)
  );
}

function isActiveChallenge(value: unknown): value is ActiveChallengeSession {
  if (!isRecord(value) || !isRecord(value.config)) return false;
  const activePhase =
    value.phase === "CHILD_TURN" ||
    value.phase === "HANDOFF" ||
    value.phase === "PARENT_TURN";
  const handoffValid =
    value.phase === "HANDOFF"
      ? value.handoffTarget === "PARENT_TURN" ||
        value.handoffTarget === "RESULT"
      : value.handoffTarget === null;
  return (
    activePhase &&
    handoffValid &&
    isNonNegativeInteger(value.startedAt) &&
    isContentSelection(value.contentSelection) &&
    isTurn(value.child, "CHILD") &&
    isTurn(value.parent, "PARENT")
  );
}

function isLastChallengeResult(
  value: unknown,
): value is LastChallengeResult {
  if (!isRecord(value)) return false;
  return (
    (value.winner === "CHILD" ||
      value.winner === "PARENT" ||
      value.winner === "DRAW") &&
    (value.mode === "TIMED" || value.mode === "FIXED_RACE") &&
    isNonNegativeInteger(value.playedAt)
  );
}

function isChallengeSource(value: unknown): value is ChallengeSource {
  if (!isRecord(value)) return false;
  return (
    isChildDifficulty(value.childDifficulty) &&
    typeof value.contentVersion === "string" &&
    value.contentVersion.length > 0 &&
    isNonNegativeInteger(value.updatedAt)
  );
}

export function saveActiveChallenge(
  storage: SnapshotStorage,
  session: ActiveChallengeSession,
): void {
  storage.write(ACTIVE_CHALLENGE_KEY, session);
}

export function loadActiveChallenge(
  storage: SnapshotStorage,
  contentVersion: string,
  ruleVersion: string,
  retainVersionedSession = false,
): ActiveChallengeSession | null {
  const value = storage.read<unknown>(ACTIVE_CHALLENGE_KEY);
  if (
    !isActiveChallenge(value) ||
    (!retainVersionedSession &&
      (value.config.contentVersion !== contentVersion ||
        value.config.ruleVersion !== ruleVersion))
  ) {
    if (value !== null) storage.remove(ACTIVE_CHALLENGE_KEY);
    return null;
  }
  return value;
}

export function clearActiveChallenge(storage: SnapshotStorage): void {
  storage.remove(ACTIVE_CHALLENGE_KEY);
}

export function loadLastChallengeResult(
  storage: SnapshotStorage,
): LastChallengeResult | null {
  const value = storage.read<unknown>(LAST_CHALLENGE_RESULT_KEY);
  if (!isLastChallengeResult(value)) {
    if (value !== null) storage.remove(LAST_CHALLENGE_RESULT_KEY);
    return null;
  }
  return value;
}

export function persistCompletedChallenge(
  storage: SnapshotStorage,
  details: ChallengeResultDetails,
): boolean {
  const compact: LastChallengeResult = {
    winner: details.winner,
    mode: details.mode,
    playedAt: details.playedAt,
  };
  storage.write(LAST_CHALLENGE_RESULT_KEY, compact);
  const persisted = loadLastChallengeResult(storage);
  if (
    persisted?.winner !== compact.winner ||
    persisted.mode !== compact.mode ||
    persisted.playedAt !== compact.playedAt
  ) {
    return false;
  }
  storage.remove(ACTIVE_CHALLENGE_KEY);
  return storage.read<unknown>(ACTIVE_CHALLENGE_KEY) === null;
}

/**
 * 从每日计划的 NEW 关卡首槽推导挑战基准难度。
 * `resolveDifficulty` 将知识点映射到语料难度（1-5）。
 */
export function challengeSourceFromPlan(
  plan: DailyPlan,
  resolveDifficulty: (kpId: KnowledgePointId) => ChildDifficulty,
  contentVersion: string,
  updatedAt: number,
): ChallengeSource | null {
  const kpId = plan.find((level) => level.name === "NEW")?.slots[0]?.kpId;
  return kpId
    ? { childDifficulty: resolveDifficulty(kpId), contentVersion, updatedAt }
    : null;
}

export function saveChallengeSource(
  storage: SnapshotStorage,
  source: ChallengeSource,
): void {
  storage.write(CHALLENGE_SOURCE_KEY, source);
}

export function loadChallengeSource(
  storage: SnapshotStorage,
  contentVersion: string,
): ChallengeSource | null {
  const value = storage.read<unknown>(CHALLENGE_SOURCE_KEY);
  if (!isChallengeSource(value) || value.contentVersion !== contentVersion) {
    if (value !== null) storage.remove(CHALLENGE_SOURCE_KEY);
    return null;
  }
  return value;
}
