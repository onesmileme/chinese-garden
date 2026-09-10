import { createHttpClient, type HttpAuthOptions } from "./http";

export type AdminRole = "ADMIN" | "EDITOR" | "REVIEWER" | "PUBLISHER";
export type ContentLevel = "L1" | "L2" | "L3" | "L4" | "L5";
export type ContentLevelValue = 1 | 2 | 3 | 4 | 5;
export type ContentType = "CHARACTER" | "POEM" | "IDIOM";
export type ContentStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type ReleaseStatus = "DRAFT" | "VALIDATED" | "PUBLISHED" | "RETIRED";

export interface AdminSession {
  actor: string;
  roles: AdminRole[];
  active: boolean;
}

export interface SaveContentDraft {
  id: string;
  type: ContentType;
  level: ContentLevel;
  difficulty: ContentLevel;
  promotionRequired: boolean;
  tags: string[];
  payload: Record<string, unknown>;
}

export interface AdminContentItem extends SaveContentDraft {
  status: ContentStatus;
  revision: number;
}

export interface ContentSearchQuery {
  type?: ContentType;
  level?: ContentLevel;
  status?: ContentStatus;
  tag?: string;
  keyword?: string;
  cursor?: string;
  limit?: number;
}

export interface ContentPage {
  items: AdminContentItem[];
  nextCursor: string | null;
}

export interface ContentIssue {
  code: string;
  itemId: string;
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ContentIssue[];
}

export interface LevelCoverage {
  level: ContentLevel;
  characters: number;
  poems: number;
  chainableIdioms: number;
  blockingIssues: string[];
}

export interface ImportBatchRequest {
  ruleVersion: string;
  [key: string]: unknown;
}

export interface RawCandidate {
  importKey: string;
  source: string;
  sourceRef: string;
  sourceHash: string;
  ruleVersion: string;
  id: string;
  type: ContentType;
  suggestedLevel: number;
  suggestedDifficulty: number;
  promotionRequired: boolean;
  tags: string[];
  payload: Record<string, unknown>;
  score: number;
}

export interface ImportBatch {
  id: string;
  ruleVersion: string;
  status: string;
  requested: Record<string, unknown>;
  startedAt: string;
  completedAt: string | null;
}

export interface ImportChunkResult {
  imported: number;
  skipped: number;
  rejected: number;
}

export interface ReleaseSearchQuery {
  status?: ReleaseStatus;
  cursor?: string;
  limit?: number;
}

export interface ReleaseSummary {
  version: string;
  masteryRuleVersion: string;
  progressionRuleVersion: string;
  contentLevelRuleVersion: string;
  minClientVersion: string;
  status: ReleaseStatus;
  artifactCount: number;
  createdAt: string;
  publishedAt: string | null;
}

export interface ReleasePage {
  items: ReleaseSummary[];
  nextCursor: string | null;
}

export interface CreateReleaseRequest {
  version: string;
  masteryRuleVersion: string;
  progressionRuleVersion: string;
  contentLevelRuleVersion: string;
  minClientVersion: string;
}

export interface ReleaseArtifactInput {
  level: ContentLevelValue;
  artifactUrl: string;
  sha256: string;
  fileSize: number;
  format: "tar+gzip";
}

export interface ReleaseArtifact {
  releaseVersion: string;
  level: ContentLevel;
  artifactUrl: string;
  sha256: string;
  fileSize: number;
  format: "tar+gzip";
  masteryRuleVersion: string;
  progressionRuleVersion: string;
  contentLevelRuleVersion: string;
  minClientVersion: string;
}

export interface ReleaseDetail extends CreateReleaseRequest {
  status: ReleaseStatus;
  artifacts: ReleaseArtifact[];
  items: AdminContentItem[];
}

export interface AdminOperationsPort {
  session(): Promise<AdminSession>;
  searchContent(query: ContentSearchQuery): Promise<ContentPage>;
  getContent(id: string): Promise<AdminContentItem>;
  createContent(draft: SaveContentDraft): Promise<AdminContentItem>;
  updateContent(
    id: string,
    expectedRevision: number,
    draft: SaveContentDraft,
  ): Promise<AdminContentItem>;
  validateContent(id: string): Promise<ValidationResult>;
  activateContent(
    id: string,
    expectedRevision: number,
  ): Promise<AdminContentItem>;
  archiveContent(
    id: string,
    expectedRevision: number,
  ): Promise<AdminContentItem>;
  coverage(): Promise<LevelCoverage[]>;
  createImport(request: ImportBatchRequest): Promise<ImportBatch>;
  appendImport(
    id: string,
    candidates: RawCandidate[],
  ): Promise<ImportChunkResult>;
  completeImport(id: string): Promise<ImportBatch>;
  getImport(id: string): Promise<ImportBatch>;
  searchReleases(query: ReleaseSearchQuery): Promise<ReleasePage>;
  createRelease(request: CreateReleaseRequest): Promise<ReleaseDetail>;
  getRelease(version: string): Promise<ReleaseDetail>;
  registerArtifacts(
    version: string,
    artifacts: ReleaseArtifactInput[],
  ): Promise<void>;
  transitionRelease(
    version: string,
    toStatus: ReleaseStatus,
  ): Promise<void>;
}

export function createAdminOperationsClient(
  baseUrl: string,
  getToken: () => string | null,
  options: HttpAuthOptions = {},
): AdminOperationsPort {
  const http = createHttpClient(baseUrl, getToken, {
    ...options,
    tokenHeader: "X-Admin-Token",
  });
  return {
    session: () => http.get("/v1/admin/session"),
    searchContent: (query) => {
      const params = new URLSearchParams();
      if (query.type !== undefined) params.set("type", query.type);
      if (query.level !== undefined) params.set("level", query.level);
      if (query.status !== undefined) params.set("status", query.status);
      if (query.tag !== undefined) params.set("tag", query.tag);
      if (query.keyword !== undefined) params.set("keyword", query.keyword);
      if (query.cursor !== undefined) params.set("cursor", query.cursor);
      if (query.limit !== undefined) params.set("limit", String(query.limit));
      const search = params.toString();
      return http.get(
        `/v1/admin/content/items${search === "" ? "" : `?${search}`}`,
      );
    },
    getContent: (id) =>
      http.get(`/v1/admin/content/items/${encodeURIComponent(id)}`),
    createContent: (draft) => http.post("/v1/admin/content/items", draft),
    updateContent: (id, expectedRevision, draft) =>
      http.patch(
        `/v1/admin/content/items/${encodeURIComponent(id)}?expectedRevision=${expectedRevision}`,
        draft,
      ),
    validateContent: (id) =>
      http.post(
        `/v1/admin/content/items/${encodeURIComponent(id)}/validate`,
        {},
      ),
    activateContent: (id, expectedRevision) =>
      http.post(
        `/v1/admin/content/items/${encodeURIComponent(id)}/activate?expectedRevision=${expectedRevision}`,
        {},
      ),
    archiveContent: (id, expectedRevision) =>
      http.post(
        `/v1/admin/content/items/${encodeURIComponent(id)}/archive?expectedRevision=${expectedRevision}`,
        {},
      ),
    coverage: () => http.get("/v1/admin/content/levels/coverage"),
    createImport: (request) =>
      http.post("/v1/admin/content-imports", request),
    appendImport: (id, candidates) =>
      http.post(
        `/v1/admin/content-imports/${encodeURIComponent(id)}/candidates`,
        candidates,
      ),
    completeImport: (id) =>
      http.post(
        `/v1/admin/content-imports/${encodeURIComponent(id)}/complete`,
        {},
      ),
    getImport: (id) =>
      http.get(`/v1/admin/content-imports/${encodeURIComponent(id)}`),
    searchReleases: (query) => {
      const params = new URLSearchParams();
      if (query.status !== undefined) params.set("status", query.status);
      if (query.cursor !== undefined) params.set("cursor", query.cursor);
      if (query.limit !== undefined) params.set("limit", String(query.limit));
      const search = params.toString();
      return http.get(
        `/v1/admin/content/releases${search === "" ? "" : `?${search}`}`,
      );
    },
    createRelease: (request) =>
      http.post("/v1/admin/content/releases/snapshots", request),
    getRelease: (version) =>
      http.get(
        `/v1/admin/content/releases/${encodeURIComponent(version)}/snapshot`,
      ),
    registerArtifacts: (version, artifacts) =>
      http.post(
        `/v1/admin/content/releases/${encodeURIComponent(version)}/artifacts`,
        { artifacts },
      ),
    transitionRelease: (version, toStatus) =>
      http.post(
        `/v1/admin/content/releases/${encodeURIComponent(version)}/status`,
        { toStatus },
      ),
  };
}
