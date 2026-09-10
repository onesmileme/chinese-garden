import type { ContentLevelRules } from "@cc/content-schema";

export type ValidationStage =
  | "SCHEMA"
  | "CORPUS"
  | "VERSION"
  | "GOLDEN_TS"
  | "GOLDEN_JAVA";

export interface ValidationIssue {
  stage: ValidationStage;
  path: string;
  code: string;
  message: string;
}

export interface CharacterBank {
  version: string;
  characters: unknown[];
}

export interface PoemBank {
  version: string;
  poems: unknown[];
}

export interface IdiomBank {
  version: string;
  idioms: unknown[];
}

export interface ContentBundle {
  characterBank: CharacterBank;
  poemBank: PoemBank;
  idiomBank: IdiomBank;
  masteryRules: { ruleVersion: string };
  progressionRules: { ruleVersion: string };
  contentLevelRules: ContentLevelRules;
  questionsVector: { contentVersion: string; cases: unknown[] };
  testVectors: Record<string, unknown>;
}

export interface RuntimePackBundle extends ContentBundle {
  curriculumMap: unknown;
}

export type ContentLevel = 1 | 2 | 3 | 4 | 5;

export interface ReleaseSnapshotItem {
  id: string;
  type: "CHARACTER" | "POEM" | "IDIOM";
  status: "ACTIVE";
  revision: number;
  level: ContentLevel;
  difficulty: ContentLevel;
  promotionRequired: boolean;
  tags: string[];
  payload: unknown;
}

export interface ReleaseSnapshotResponse {
  version: string;
  masteryRuleVersion: string;
  progressionRuleVersion: string;
  contentLevelRuleVersion: string;
  minClientVersion: string;
  items: ReleaseSnapshotItem[];
}

export interface CreateReleaseRequest {
  version: string;
  masteryRuleVersion: string;
  progressionRuleVersion: string;
  contentLevelRuleVersion: string;
  minClientVersion: string;
}

export interface ReleaseArtifactRegistration {
  level: ContentLevel;
  artifactUrl: string;
  sha256: string;
  fileSize: number;
  format: "tar+gzip";
}

export interface PackResult {
  bytes: Uint8Array;
  sha256: string;
  fileSize: number;
}

export interface RegisterReleaseRequest {
  version: string;
  ruleVersion: string;
  manifestUrl: string;
  sha256: string;
  fileSize: number;
  minClientVersion: string;
}

export type ReleaseStatus = "DRAFT" | "VALIDATED" | "PUBLISHED" | "RETIRED";

export interface PublishOptions {
  version: string;
  ruleVersion: string;
  contentLevelRuleVersion: string;
  minClientVersion: string;
  approvedBy: string;
  dryRun: boolean;
}

export interface PublishOutcome {
  ok: boolean;
  version: string;
  sha256: string;
  manifestUrl: string | null;
  finalStatus: ReleaseStatus | null;
  issues: ValidationIssue[];
}

export interface LeveledPublishOutcome {
  ok: boolean;
  version: string;
  artifacts: ReleaseArtifactRegistration[];
  finalStatus: ReleaseStatus | null;
  issues: ValidationIssue[];
}
