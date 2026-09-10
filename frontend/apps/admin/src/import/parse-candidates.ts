import type { RawCandidate } from "@cc/api-client";

export interface ParsedCandidates {
  candidates: RawCandidate[];
  ruleVersion: string;
}

type JsonObject = Record<string, unknown>;

function invalid(lineNumber: number, field: string): never {
  throw new Error(`第 ${lineNumber} 行字段 ${field} 无效`);
}

function readString(
  value: JsonObject,
  field: string,
  lineNumber: number,
): string {
  const fieldValue = value[field];
  if (typeof fieldValue !== "string" || fieldValue.length === 0) {
    return invalid(lineNumber, field);
  }
  return fieldValue;
}

function readLevel(
  value: JsonObject,
  field: string,
  lineNumber: number,
): number {
  const fieldValue = value[field];
  if (
    !Number.isInteger(fieldValue) ||
    (fieldValue as number) < 1 ||
    (fieldValue as number) > 5
  ) {
    return invalid(lineNumber, field);
  }
  return fieldValue as number;
}

function readContentType(
  value: JsonObject,
  lineNumber: number,
): RawCandidate["type"] {
  const type = value.type;
  if (type !== "CHARACTER" && type !== "POEM" && type !== "IDIOM") {
    return invalid(lineNumber, "type");
  }
  return type;
}

function toCandidate(value: JsonObject, lineNumber: number): RawCandidate {
  const tags = value.tags;
  if (
    !Array.isArray(tags) ||
    !tags.every((tag) => typeof tag === "string")
  ) {
    return invalid(lineNumber, "tags");
  }
  const payload = value.payload;
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return invalid(lineNumber, "payload");
  }
  const score = value.score;
  if (typeof score !== "number" || !Number.isFinite(score)) {
    return invalid(lineNumber, "score");
  }
  const promotionRequired = value.promotionRequired ?? false;
  if (typeof promotionRequired !== "boolean") {
    return invalid(lineNumber, "promotionRequired");
  }

  return {
    importKey: readString(value, "importKey", lineNumber),
    source: readString(value, "source", lineNumber),
    sourceRef: readString(value, "sourceRef", lineNumber),
    sourceHash: readString(value, "sourceHash", lineNumber),
    ruleVersion: readString(value, "ruleVersion", lineNumber),
    id: readString(value, "id", lineNumber),
    type: readContentType(value, lineNumber),
    suggestedLevel: readLevel(value, "suggestedLevel", lineNumber),
    suggestedDifficulty: readLevel(
      value,
      "suggestedDifficulty",
      lineNumber,
    ),
    promotionRequired,
    tags,
    payload: payload as Record<string, unknown>,
    score,
  };
}

export function parseCandidateNdjson(source: string): ParsedCandidates {
  const candidates: RawCandidate[] = [];
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);

  lines.forEach((line, index) => {
    if (line.trim() === "") return;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(`第 ${index + 1} 行不是有效 JSON`);
    }
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value)
    ) {
      throw new Error(`第 ${index + 1} 行必须是 JSON 对象`);
    }
    const candidate = toCandidate(value as JsonObject, index + 1);
    const firstCandidate = candidates[0];
    if (
      firstCandidate !== undefined &&
      candidate.ruleVersion !== firstCandidate.ruleVersion
    ) {
      throw new Error(
        `第 ${index + 1} 行的 ruleVersion 与第 1 条候选不一致`,
      );
    }
    candidates.push(candidate);
  });

  const firstCandidate = candidates[0];
  if (firstCandidate === undefined) {
    throw new Error("文件中没有候选内容");
  }

  return {
    candidates,
    ruleVersion: firstCandidate.ruleVersion,
  };
}
