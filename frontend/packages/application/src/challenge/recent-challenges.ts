import {
  challengeCompletedPayloadV1Schema,
  questionTypeSchema,
  type ChallengeCompletedPayloadV1,
} from "@cc/content-schema";
import type { ChallengeAttempt } from "@cc/domain";
import type { Clock } from "../ports";
import type { SnapshotStorage } from "../session/active-session";

export const RECENT_CHALLENGES_KEY = "cc_recent_challenges_v1";
const RECENT_CHALLENGE_RETENTION_MS = 180 * 24 * 60 * 60 * 1_000;

type ChallengeSummary = ChallengeCompletedPayloadV1["child"];

export interface RecentChallengeParticipant extends ChallengeSummary {
  attempts: readonly ChallengeAttempt[];
}

export interface RecentChallenge
  extends Omit<
    ChallengeCompletedPayloadV1,
    "payloadVersion" | "child" | "parent"
  > {
  child: RecentChallengeParticipant;
  parent: RecentChallengeParticipant;
}

export interface RecentChallengeStore {
  save(challenge: RecentChallenge): void;
  all(): readonly RecentChallenge[];
  forDate(date: string, timeZone: string): readonly RecentChallenge[];
  pruneBefore(cutoff: number): void;
}

interface RecentChallengesSnapshot {
  version: 1;
  challenges: readonly RecentChallenge[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
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

function isParticipant(
  value: unknown,
): value is RecentChallengeParticipant {
  return (
    isRecord(value) &&
    isNonNegativeInteger(value.answeredCount) &&
    isNonNegativeInteger(value.correctCount) &&
    isNonNegativeInteger(value.activeElapsedMs) &&
    Array.isArray(value.attempts) &&
    value.attempts.length === value.answeredCount &&
    value.attempts.every(isChallengeAttempt)
  );
}

function isRecentChallenge(value: unknown): value is RecentChallenge {
  if (
    !isRecord(value) ||
    !isParticipant(value.child) ||
    !isParticipant(value.parent)
  ) {
    return false;
  }
  return challengeCompletedPayloadV1Schema.safeParse({
    payloadVersion: 1,
    challengeId: value.challengeId,
    dimension: value.dimension,
    startedAt: value.startedAt,
    completedAt: value.completedAt,
    winner: value.winner,
    child: {
      answeredCount: value.child.answeredCount,
      correctCount: value.child.correctCount,
      activeElapsedMs: value.child.activeElapsedMs,
    },
    parent: {
      answeredCount: value.parent.answeredCount,
      correctCount: value.parent.correctCount,
      activeElapsedMs: value.parent.activeElapsedMs,
    },
  }).success;
}

function cloneAttempt(attempt: ChallengeAttempt): ChallengeAttempt {
  return { ...attempt };
}

function cloneParticipant(
  participant: RecentChallengeParticipant,
): RecentChallengeParticipant {
  return {
    answeredCount: participant.answeredCount,
    correctCount: participant.correctCount,
    activeElapsedMs: participant.activeElapsedMs,
    attempts: participant.attempts.map(cloneAttempt),
  };
}

function cloneChallenge(challenge: RecentChallenge): RecentChallenge {
  return {
    challengeId: challenge.challengeId,
    dimension: challenge.dimension,
    startedAt: challenge.startedAt,
    completedAt: challenge.completedAt,
    winner: challenge.winner,
    child: cloneParticipant(challenge.child),
    parent: cloneParticipant(challenge.parent),
  };
}

function compareNewestFirst(
  left: RecentChallenge,
  right: RecentChallenge,
): number {
  if (left.completedAt !== right.completedAt) {
    return right.completedAt - left.completedAt;
  }
  return left.challengeId < right.challengeId ? -1 : 1;
}

function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const timestamp = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  const date = new Date(timestamp);
  return (
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() + 1 === Number(match[2]) &&
    date.getUTCDate() === Number(match[3])
  );
}

function calendarDateAt(timestamp: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    calendar: "iso8601",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(timestamp);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

export class SnapshotRecentChallengeStore implements RecentChallengeStore {
  constructor(
    private readonly storage: SnapshotStorage,
    private readonly clock: Clock = { now: () => Date.now() },
  ) {}

  save(challenge: RecentChallenge): void {
    if (!isRecentChallenge(challenge)) {
      throw new TypeError("invalid recent challenge");
    }
    const current = this.readAll();
    if (current.some((item) => item.challengeId === challenge.challengeId)) {
      return;
    }
    this.writeAll([...current, cloneChallenge(challenge)]);
  }

  all(): readonly RecentChallenge[] {
    return this.readRetained().map(cloneChallenge);
  }

  forDate(date: string, timeZone: string): readonly RecentChallenge[] {
    if (!isIsoDate(date)) throw new RangeError("date must be YYYY-MM-DD");
    return this.readRetained()
      .filter(
        (challenge) =>
          calendarDateAt(challenge.completedAt, timeZone) === date,
      )
      .map(cloneChallenge);
  }

  pruneBefore(cutoff: number): void {
    if (!isNonNegativeInteger(cutoff)) {
      throw new RangeError("cutoff must be a non-negative integer");
    }
    const current = this.readAll();
    const retained = current.filter(
      (challenge) => challenge.completedAt >= cutoff,
    );
    if (retained.length === current.length) return;
    if (retained.length === 0) {
      this.storage.remove(RECENT_CHALLENGES_KEY);
      return;
    }
    this.writeAll(retained);
  }

  private readAll(): RecentChallenge[] {
    const value = this.storage.read<unknown>(RECENT_CHALLENGES_KEY);
    if (value === null) return [];
    if (
      !isRecord(value) ||
      value.version !== 1 ||
      !Array.isArray(value.challenges) ||
      !value.challenges.every(isRecentChallenge) ||
      new Set(
        value.challenges.map((challenge) => challenge.challengeId),
      ).size !== value.challenges.length
    ) {
      this.storage.remove(RECENT_CHALLENGES_KEY);
      return [];
    }
    return value.challenges.map(cloneChallenge).sort(compareNewestFirst);
  }

  private readRetained(): RecentChallenge[] {
    const current = this.readAll();
    const cutoff = Math.max(
      0,
      this.clock.now() - RECENT_CHALLENGE_RETENTION_MS,
    );
    const retained = current.filter(
      (challenge) => challenge.completedAt >= cutoff,
    );
    if (retained.length === current.length) return current;
    if (retained.length === 0) {
      this.storage.remove(RECENT_CHALLENGES_KEY);
    } else {
      this.writeAll(retained);
    }
    return retained;
  }

  private writeAll(challenges: readonly RecentChallenge[]): void {
    const snapshot: RecentChallengesSnapshot = {
      version: 1,
      challenges: challenges.map(cloneChallenge).sort(compareNewestFirst),
    };
    this.storage.write(RECENT_CHALLENGES_KEY, snapshot);
  }
}
