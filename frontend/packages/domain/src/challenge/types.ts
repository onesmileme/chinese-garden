import type {
  ContentLevel,
  KnowledgePointId,
  QuestionType,
} from "@cc/content-schema";

export const CHALLENGE_DURATION_MS = 60_000;
export const CHALLENGE_QUESTION_COUNT = 10;
export const CHALLENGE_RULE_VERSION = "challenge-v4";

export type ChallengeMode = "TIMED" | "FIXED_RACE";
export type Participant = "CHILD" | "PARENT";
export type ParentTier = "STANDARD" | "EXPERT";
export type ChallengeDimension = "POEM" | "IDIOM";
export type ChallengeWinner = Participant | "DRAW";
export type ChildDifficulty = 1 | 2 | 3 | 4 | 5;
export type ChallengePhase =
  | "CHILD_TURN"
  | "HANDOFF"
  | "PARENT_TURN"
  | "RESULT";
export type HandoffTarget = "PARENT_TURN" | "RESULT";

/**
 * 语文家长挑战配置：由孩子在 SETUP 阶段选定，整局固定。
 * - `dimension` 决定整局题型集合（诗词/成语）。
 * - `childDifficulty` 为孩子回合难度，家长回合按 `tier` 抬档。
 */
export interface ChineseChallengeConfig {
  mode: ChallengeMode;
  tier: ParentTier;
  dimension: ChallengeDimension;
  childDifficulty: ChildDifficulty;
  abilityLevel: ContentLevel;
  durationMs: number;
  questionCount: number;
  contentVersion: string;
  ruleVersion: string;
}

export interface PendingWrongFeedback {
  submittedAnswer: string;
  correctAnswer: string;
}

export interface ChallengeAttempt {
  knowledgePointId: KnowledgePointId;
  questionType: QuestionType;
  questionSeed: string;
  submittedAnswer: string;
  correctAnswer: string;
  correct: boolean;
  responseTimeMs: number;
}

export interface TurnProgress {
  participant: Participant;
  questionIndex: number;
  answeredCount: number;
  correctCount: number;
  activeElapsedMs: number;
  questionActiveElapsedMs: number;
  attempts: readonly ChallengeAttempt[];
  remainingMs?: number;
  pendingWrongFeedback?: PendingWrongFeedback;
}

export interface ChallengeSession {
  challengeId: string;
  readonly startedAt: number;
  phase: ChallengePhase;
  handoffTarget: HandoffTarget | null;
  config: ChineseChallengeConfig;
  child: TurnProgress;
  parent: TurnProgress;
  paused: boolean;
  updatedAt: number;
}

export interface ChallengeResultDetails {
  winner: ChallengeWinner;
  mode: ChallengeMode;
  playedAt: number;
  child: Pick<
    TurnProgress,
    "correctCount" | "answeredCount" | "activeElapsedMs"
  >;
  parent: Pick<
    TurnProgress,
    "correctCount" | "answeredCount" | "activeElapsedMs"
  >;
  replay: Pick<ChineseChallengeConfig, "mode" | "tier">;
}
