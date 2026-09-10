import type {
  ContentLevelValue,
  CreateReleaseRequest,
  ReleaseArtifactInput,
  ReleaseStatus,
} from "@cc/api-client";

export interface CreateReleaseFormData {
  version: string;
  masteryRuleVersion: string;
  progressionRuleVersion: string;
  contentLevelRuleVersion: string;
  minClientVersion: string;
}

export interface ArtifactFormRow {
  level: ContentLevelValue;
  artifactUrl: string;
  sha256: string;
  fileSize: string;
}

export class ReleaseFormError extends Error {}

const NEXT_STATUS: Record<ReleaseStatus, ReleaseStatus | null> = {
  DRAFT: "VALIDATED",
  VALIDATED: "PUBLISHED",
  PUBLISHED: "RETIRED",
  RETIRED: null,
};

export function nextReleaseStatus(
  status: ReleaseStatus,
): ReleaseStatus | null {
  return NEXT_STATUS[status];
}

export function toCreateReleaseRequest(
  form: CreateReleaseFormData,
): CreateReleaseRequest {
  const request = {
    version: form.version.trim(),
    masteryRuleVersion: form.masteryRuleVersion.trim(),
    progressionRuleVersion: form.progressionRuleVersion.trim(),
    contentLevelRuleVersion: form.contentLevelRuleVersion.trim(),
    minClientVersion: form.minClientVersion.trim(),
  };
  if (Object.values(request).some((value) => value === "")) {
    throw new ReleaseFormError("请填写所有快照字段");
  }
  return request;
}

export function toArtifactInputs(
  rows: readonly ArtifactFormRow[],
): ReleaseArtifactInput[] {
  if (rows.length !== 5) {
    throw new ReleaseFormError("必须登记 L1-L5 五个制品");
  }
  const levels = rows.map(({ level }) => level);
  if (
    new Set(levels).size !== 5 ||
    ![1, 2, 3, 4, 5].every((level) => levels.includes(level as ContentLevelValue))
  ) {
    throw new ReleaseFormError("制品等级必须唯一");
  }

  return rows.map((row) => ({
    level: row.level,
    artifactUrl: normalizeHttpsUrl(row.artifactUrl),
    sha256: normalizeSha256(row.sha256),
    fileSize: normalizeFileSize(row.fileSize),
    format: "tar+gzip",
  }));
}

function normalizeHttpsUrl(value: string): string {
  const normalized = value.trim();
  try {
    const url = new URL(normalized);
    if (url.protocol === "https:" && url.host !== "") return normalized;
  } catch {
    // The shared message below is more useful to an operator than URL parser errors.
  }
  throw new ReleaseFormError("制品 URL 必须是绝对 HTTPS 地址");
}

function normalizeSha256(value: string): string {
  const normalized = value.trim();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new ReleaseFormError("SHA-256 必须是 64 位小写十六进制");
  }
  return normalized;
}

function normalizeFileSize(value: string): number {
  const normalized = value.trim();
  if (!/^[1-9]\d*$/.test(normalized)) {
    throw new ReleaseFormError("文件大小必须是正整数");
  }
  const size = Number(normalized);
  if (!Number.isSafeInteger(size)) {
    throw new ReleaseFormError("文件大小必须是正整数");
  }
  return size;
}
