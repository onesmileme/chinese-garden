import type { GuwendaoPoemCandidate } from "./guwendao-poem-candidates";
import {
  canonicalJsonSha256,
  poemIdentity,
  sha256Text,
} from "./poem-identity";

export type ContentStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type ContentLevel = "L1" | "L2" | "L3" | "L4" | "L5";

export interface AdminPoemItem {
  id: string;
  type: "POEM";
  status: ContentStatus;
  revision: number;
  level: ContentLevel;
  difficulty: ContentLevel;
  promotionRequired: boolean;
  tags: string[];
  payload: {
    title: string;
    author: string;
    lines: string[];
    charRefs: string[];
    source?: {
      sourceId: string;
      dynasty: string;
      category: string;
      sourceUrl: string;
    };
  };
}

export interface ValidationResponse {
  valid: boolean;
  issues: Array<{
    code: string;
    itemId: string;
    path: string;
    message: string;
  }>;
}

export type PoemReviewCheck =
  | "SOURCE_MATCH"
  | "FIELDS_COMPLETE"
  | "CANDIDATE_TITLE_UNIQUE"
  | "CANDIDATE_BODY_UNIQUE"
  | "BACKEND_PAYLOAD_MATCH"
  | "CONTENT_VALID"
  | "ACTIVE_DUPLICATE_CONFIRMED";

export interface PoemReviewEntry {
  id: string;
  expectedRevision: number;
  expectedStatus: "DRAFT";
  title: string;
  author: string;
  sourceId: string;
  sourceHash: string;
  payloadHash: string;
  poemIdentityHash: string;
  decision: "ACTIVATE" | "ARCHIVE_DUPLICATE";
  checks: PoemReviewCheck[];
  duplicateOf: string | null;
}

export type ClassifiedPoemReviewEntry = Omit<PoemReviewEntry, "checks">;

export interface ClassifiedPoemReview {
  candidateSha256: string;
  entries: ClassifiedPoemReviewEntry[];
}

export interface ClassifyPoemReviewInput {
  candidateText: string;
  catalog: readonly AdminPoemItem[];
  expectedCandidateSha256: string;
}

const COMMON_CHECKS: PoemReviewCheck[] = [
  "SOURCE_MATCH",
  "FIELDS_COMPLETE",
  "CANDIDATE_TITLE_UNIQUE",
  "CANDIDATE_BODY_UNIQUE",
  "BACKEND_PAYLOAD_MATCH",
];
const EXPECTED_CANDIDATE_COUNT = 320;
const EXPECTED_ACTIVATE_COUNT = 310;
const EXPECTED_ARCHIVE_COUNT = 10;
const EXPECTED_CANDIDATE_REVISION = 2;
const RULE_VERSION = "guwendao-tang-poem-v2";
const SOURCE = "GUWENDAO_TANG";
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SOURCE_ID_PATTERN = /^[0-9a-f]{12}$/;
const CANDIDATE_KEYS = [
  "importKey",
  "source",
  "sourceRef",
  "sourceHash",
  "ruleVersion",
  "id",
  "type",
  "suggestedLevel",
  "suggestedDifficulty",
  "promotionRequired",
  "tags",
  "payload",
  "score",
] as const;
const PAYLOAD_KEYS = [
  "title",
  "author",
  "lines",
  "charRefs",
  "source",
] as const;
const SOURCE_KEYS = [
  "sourceId",
  "dynasty",
  "category",
  "sourceUrl",
] as const;
const REVIEW_KEYS = [
  "id",
  "expectedRevision",
  "expectedStatus",
  "title",
  "author",
  "sourceId",
  "sourceHash",
  "payloadHash",
  "poemIdentityHash",
  "decision",
  "checks",
  "duplicateOf",
] as const;
const ACTIVATE_CHECKS: PoemReviewCheck[] = [
  ...COMMON_CHECKS,
  "CONTENT_VALID",
];
const ARCHIVE_CHECKS: PoemReviewCheck[] = [
  ...COMMON_CHECKS,
  "ACTIVE_DUPLICATE_CONFIRMED",
];

function compareIds(
  left: { id: string },
  right: { id: string },
): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function escapeMarkdownTableCell(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|")
    .replace(/\r\n|\r|\n/g, "<br>");
}

function requirePlainJsonStructure(
  value: unknown,
  context: string,
  ancestors = new Set<object>(),
): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`${context} must be a finite number`);
    }
    return;
  }
  if (typeof value !== "object") {
    throw new Error(`${context} must be a valid JSON value`);
  }
  if (ancestors.has(value)) {
    throw new Error(`${context} must not contain circular references`);
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        throw new Error(`${context} must be a plain JSON array`);
      }
      const keys = Reflect.ownKeys(value);
      const indexDescriptors: Array<[number, PropertyDescriptor]> = [];
      for (const key of keys) {
        if (typeof key === "symbol") {
          throw new Error(`${context} must not contain symbol properties`);
        }
        if (key === "length") continue;
        if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
          throw new Error(`${context} must not contain non-index properties`);
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
        if (!descriptor.enumerable || !("value" in descriptor)) {
          throw new Error(
            `${context}[${key}] must be an enumerable data property`,
          );
        }
        indexDescriptors.push([Number(key), descriptor]);
      }
      if (indexDescriptors.length !== value.length) {
        throw new Error(`${context} must not be sparse`);
      }
      indexDescriptors.sort(([left], [right]) => left - right);
      for (const [index, descriptor] of indexDescriptors) {
        requirePlainJsonStructure(
          descriptor.value,
          `${context}[${index}]`,
          ancestors,
        );
      }
      return;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${context} must be a plain JSON object`);
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === "symbol") {
        throw new Error(`${context} must not contain symbol properties`);
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (!descriptor.enumerable || !("value" in descriptor)) {
        throw new Error(
          `${context}.${key} must be an enumerable data property`,
        );
      }
      requirePlainJsonStructure(
        descriptor.value,
        `${context}.${key}`,
        ancestors,
      );
    }
  } finally {
    ancestors.delete(value);
  }
}

function requireObject(
  value: unknown,
  context: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }
  requirePlainJsonStructure(value, context);
  return value as Record<string, unknown>;
}

function requireExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  context: string,
): void {
  const allowed = new Set(keys);
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) {
      throw new Error(`${context}.${key} is required`);
    }
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`${context}.${key} is not allowed`);
    }
  }
}

function requireNonEmptyString(value: unknown, context: string): string {
  if (typeof value !== "string") {
    throw new Error(`${context} must be a string`);
  }
  if (value.length === 0) {
    throw new Error(`${context} must not be empty`);
  }
  return value;
}

function parseCandidate(
  value: Record<string, unknown>,
  context: string,
): GuwendaoPoemCandidate {
  requireExactKeys(value, CANDIDATE_KEYS, context);
  if (value.source !== SOURCE) {
    throw new Error(`${context}.source must be ${SOURCE}`);
  }
  if (value.ruleVersion !== RULE_VERSION) {
    throw new Error(`${context}.ruleVersion must be ${RULE_VERSION}`);
  }
  if (value.type !== "POEM") {
    throw new Error(`${context}.type must be POEM`);
  }
  if (value.suggestedLevel !== 5) {
    throw new Error(`${context}.suggestedLevel must be 5`);
  }
  if (value.suggestedDifficulty !== 5) {
    throw new Error(`${context}.suggestedDifficulty must be 5`);
  }
  if (value.promotionRequired !== true) {
    throw new Error(`${context}.promotionRequired must be true`);
  }
  if (value.score !== 100) {
    throw new Error(`${context}.score must be 100`);
  }

  const payload = requireObject(value.payload, `${context}.payload`);
  requireExactKeys(payload, PAYLOAD_KEYS, `${context}.payload`);
  const title = requireNonEmptyString(
    payload.title,
    `${context}.payload.title`,
  );
  const author = requireNonEmptyString(
    payload.author,
    `${context}.payload.author`,
  );
  if (!Array.isArray(payload.lines) || payload.lines.length === 0) {
    throw new Error(`${context}.payload.lines must be a non-empty array`);
  }
  const lines = payload.lines.map((line, index) =>
    requireNonEmptyString(line, `${context}.payload.lines[${index}]`),
  );
  if (!Array.isArray(payload.charRefs) || payload.charRefs.length !== 0) {
    throw new Error(`${context}.payload.charRefs must be an empty array`);
  }

  const source = requireObject(
    payload.source,
    `${context}.payload.source`,
  );
  requireExactKeys(source, SOURCE_KEYS, `${context}.payload.source`);
  const sourceId = requireNonEmptyString(
    source.sourceId,
    `${context}.payload.source.sourceId`,
  );
  if (!SOURCE_ID_PATTERN.test(sourceId)) {
    throw new Error(
      `${context}.payload.source.sourceId must be 12 lowercase hex characters`,
    );
  }
  if (source.dynasty !== "唐代") {
    throw new Error(`${context}.payload.source.dynasty must be 唐代`);
  }
  const category = requireNonEmptyString(
    source.category,
    `${context}.payload.source.category`,
  );
  const sourceUrl = requireNonEmptyString(
    source.sourceUrl,
    `${context}.payload.source.sourceUrl`,
  );
  if (
    sourceUrl !==
    `https://www.guwendao.net/shiwenv_${sourceId}.aspx`
  ) {
    throw new Error(
      `${context}.payload.source.sourceUrl does not match sourceId`,
    );
  }

  const importKey = requireNonEmptyString(
    value.importKey,
    `${context}.importKey`,
  );
  if (importKey !== `${SOURCE}:${sourceId}`) {
    throw new Error(`${context}.importKey does not match sourceId`);
  }
  const sourceRef = requireNonEmptyString(
    value.sourceRef,
    `${context}.sourceRef`,
  );
  if (sourceRef !== sourceUrl) {
    throw new Error(
      `${context}.sourceRef does not match payload.source.sourceUrl`,
    );
  }
  const sourceHash = requireNonEmptyString(
    value.sourceHash,
    `${context}.sourceHash`,
  );
  if (!SHA256_PATTERN.test(sourceHash)) {
    throw new Error(`${context}.sourceHash must be a lowercase SHA-256`);
  }
  const id = requireNonEmptyString(value.id, `${context}.id`);
  if (id !== `sc-gwd-${sourceId}`) {
    throw new Error(`${context}.id does not match sourceId`);
  }
  if (!Array.isArray(value.tags)) {
    throw new Error(`${context}.tags must be an array`);
  }
  const tags = value.tags.map((tag, index) =>
    requireNonEmptyString(tag, `${context}.tags[${index}]`),
  );
  if (
    tags.length !== 3 ||
    tags[0] !== "唐诗" ||
    tags[1] !== "古文岛" ||
    tags[2] !== category
  ) {
    throw new Error(`${context}.tags must match the source category`);
  }

  return {
    importKey,
    source: SOURCE,
    sourceRef,
    sourceHash,
    ruleVersion: RULE_VERSION,
    id,
    type: "POEM",
    suggestedLevel: 5,
    suggestedDifficulty: 5,
    promotionRequired: true,
    tags: [tags[0], tags[1], tags[2]],
    payload: {
      title,
      author,
      lines,
      charRefs: [],
      source: {
        sourceId,
        dynasty: "唐代",
        category,
        sourceUrl,
      },
    },
    score: 100,
  };
}

function parseCandidates(text: string): GuwendaoPoemCandidate[] {
  const candidates: GuwendaoPoemCandidate[] = [];
  text.split("\n").forEach((line, index) => {
    if (line.trim() === "") return;
    const context = `candidate line ${index + 1}`;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(`${context} must be valid JSON`);
    }
    const record = requireObject(value, context);
    candidates.push(parseCandidate(record, context));
  });
  if (candidates.length !== EXPECTED_CANDIDATE_COUNT) {
    throw new Error(
      `candidate file must contain exactly ${EXPECTED_CANDIDATE_COUNT} records`,
    );
  }
  return candidates;
}

function validateCandidateUniqueness(
  candidates: readonly GuwendaoPoemCandidate[],
): Map<string, string> {
  const ids = new Set<string>();
  const titles = new Set<string>();
  const identities = new Map<string, string>();
  for (const candidate of candidates) {
    if (ids.has(candidate.id)) {
      throw new Error(`duplicate candidate ID: ${candidate.id}`);
    }
    ids.add(candidate.id);

    const titleKey = JSON.stringify([
      candidate.payload.author,
      candidate.payload.title,
    ]);
    if (titles.has(titleKey)) {
      throw new Error(
        `duplicate candidate author and title: ${candidate.id}`,
      );
    }
    titles.add(titleKey);

    const identity = poemIdentity(
      candidate.payload.author,
      candidate.payload.lines,
    );
    if (identities.has(identity)) {
      throw new Error(`duplicate candidate poem identity: ${candidate.id}`);
    }
    identities.set(identity, candidate.id);
  }
  return new Map(
    [...identities].map(([identity, id]) => [id, identity]),
  );
}

function indexCatalog(
  catalog: readonly AdminPoemItem[],
): Map<string, AdminPoemItem> {
  const byId = new Map<string, AdminPoemItem>();
  for (const item of catalog) {
    if (byId.has(item.id)) {
      throw new Error(`duplicate backend item ID: ${item.id}`);
    }
    byId.set(item.id, item);
  }
  return byId;
}

function validateBackendCandidate(
  candidate: GuwendaoPoemCandidate,
  backend: AdminPoemItem | undefined,
): string {
  if (backend === undefined) {
    throw new Error(`backend item missing: ${candidate.id}`);
  }
  const context = `backend item ${candidate.id}`;
  if (backend.type !== "POEM") {
    throw new Error(`${context}.type must be POEM`);
  }
  if (backend.status !== "DRAFT") {
    throw new Error(`${context}.status must be DRAFT`);
  }
  if (backend.revision !== EXPECTED_CANDIDATE_REVISION) {
    throw new Error(
      `${context}.revision must be ${EXPECTED_CANDIDATE_REVISION}`,
    );
  }
  if (backend.level !== `L${candidate.suggestedLevel}`) {
    throw new Error(`${context}.level does not match candidate`);
  }
  if (backend.difficulty !== `L${candidate.suggestedDifficulty}`) {
    throw new Error(`${context}.difficulty does not match candidate`);
  }
  if (backend.promotionRequired !== candidate.promotionRequired) {
    throw new Error(`${context}.promotionRequired does not match candidate`);
  }
  if (JSON.stringify(backend.tags) !== JSON.stringify(candidate.tags)) {
    throw new Error(`${context}.tags do not match candidate`);
  }
  const candidatePayloadHash = canonicalJsonSha256(candidate.payload);
  const backendPayloadHash = canonicalJsonSha256(backend.payload);
  if (backendPayloadHash !== candidatePayloadHash) {
    throw new Error(`${context}.payload does not match candidate`);
  }
  return backendPayloadHash;
}

export function classifyPoemReview(
  input: ClassifyPoemReviewInput,
): ClassifiedPoemReview {
  requireObject(input, "review input");
  const candidateSha256 = sha256Text(input.candidateText);
  if (candidateSha256 !== input.expectedCandidateSha256) {
    throw new Error("candidate SHA-256 mismatch");
  }
  const candidates = parseCandidates(input.candidateText);
  const candidateIdentityById = validateCandidateUniqueness(candidates);
  const backendById = indexCatalog(input.catalog);
  const activeByIdentity = new Map<string, AdminPoemItem[]>();
  for (const item of input.catalog) {
    if (item.status !== "ACTIVE") continue;
    const identity = poemIdentity(item.payload.author, item.payload.lines);
    activeByIdentity.set(identity, [
      ...(activeByIdentity.get(identity) ?? []),
      item,
    ]);
  }

  const entries = candidates.map((candidate) => {
    const backend = backendById.get(candidate.id);
    const payloadHash = validateBackendCandidate(candidate, backend);
    const identity = candidateIdentityById.get(candidate.id)!;
    const duplicates = activeByIdentity.get(identity) ?? [];
    if (duplicates.length > 1) {
      throw new Error(
        `candidate ${candidate.id} matches more than one ACTIVE poem`,
      );
    }
    return {
      id: candidate.id,
      expectedRevision: EXPECTED_CANDIDATE_REVISION,
      expectedStatus: "DRAFT" as const,
      title: candidate.payload.title,
      author: candidate.payload.author,
      sourceId: candidate.payload.source.sourceId,
      sourceHash: candidate.sourceHash,
      payloadHash,
      poemIdentityHash: sha256Text(identity),
      decision:
        duplicates.length === 0
          ? ("ACTIVATE" as const)
          : ("ARCHIVE_DUPLICATE" as const),
      duplicateOf: duplicates[0]?.id ?? null,
    };
  });
  const activateCount = entries.filter(
    ({ decision }) => decision === "ACTIVATE",
  ).length;
  const archiveCount = entries.length - activateCount;
  if (
    activateCount !== EXPECTED_ACTIVATE_COUNT ||
    archiveCount !== EXPECTED_ARCHIVE_COUNT
  ) {
    throw new Error(
      `review decisions must be exactly ${EXPECTED_ACTIVATE_COUNT} ACTIVATE and ${EXPECTED_ARCHIVE_COUNT} ARCHIVE_DUPLICATE; received ${activateCount} ACTIVATE and ${archiveCount} ARCHIVE_DUPLICATE`,
    );
  }

  return {
    candidateSha256,
    entries: entries.sort(compareIds),
  };
}

function snapshotValidationResponses(
  validationById: ReadonlyMap<string, ValidationResponse>,
): Map<string, unknown> {
  let iterator: MapIterator<[unknown, unknown]>;
  try {
    iterator = Map.prototype.entries.call(validationById) as MapIterator<
      [unknown, unknown]
    >;
  } catch {
    throw new Error("validation responses must be a Map");
  }
  const rawEntries = Array.from(iterator);
  const ids = rawEntries.map(([id], index) => {
    const context = `validation response key ${index + 1}`;
    requirePlainJsonStructure(id, context);
    return requireNonEmptyString(id, context);
  });

  const snapshot = new Map<string, unknown>();
  rawEntries.forEach(([, response], index) => {
    const id = ids[index]!;
    requirePlainJsonStructure(
      response,
      `validation response for ${id}`,
    );
    snapshot.set(id, response);
  });
  return snapshot;
}

export function finalizePoemReview(
  classified: ClassifiedPoemReview,
  validationById: ReadonlyMap<string, ValidationResponse>,
): PoemReviewEntry[] {
  requirePlainJsonStructure(classified, "classified review");
  const validationSnapshot =
    snapshotValidationResponses(validationById);
  const activationIds = new Set(
    classified.entries
      .filter(({ decision }) => decision === "ACTIVATE")
      .map(({ id }) => id),
  );
  for (const id of validationSnapshot.keys()) {
    if (!activationIds.has(id)) {
      throw new Error(`unexpected validation response for ${id}`);
    }
  }

  return classified.entries.map((entry) => {
    if (entry.decision === "ACTIVATE") {
      const response = validationSnapshot.get(entry.id);
      if (response === undefined) {
        throw new Error(`missing validation response for ${entry.id}`);
      }
      const responseRecord = requireObject(
        response,
        `validation response for ${entry.id}`,
      );
      if (
        responseRecord.valid !== true ||
        !Array.isArray(responseRecord.issues) ||
        responseRecord.issues.length !== 0
      ) {
        throw new Error(
          `validation response for ${entry.id} must be valid with zero issues`,
        );
      }
      return {
        ...entry,
        checks: [...COMMON_CHECKS, "CONTENT_VALID"],
      };
    }
    return {
      ...entry,
      checks: [...COMMON_CHECKS, "ACTIVE_DUPLICATE_CONFIRMED"],
    };
  });
}

export function serializePoemReview(
  entries: readonly PoemReviewEntry[],
): string {
  const normalized = normalizeReviewEntries(entries, false);
  normalized.sort(compareIds);
  return `${normalized.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
}

function requireSha256(value: unknown, context: string): string {
  const hash = requireNonEmptyString(value, context);
  if (!SHA256_PATTERN.test(hash)) {
    throw new Error(`${context} must be a lowercase SHA-256`);
  }
  return hash;
}

function parseReviewEntry(value: unknown, context: string): PoemReviewEntry {
  const record = requireObject(value, context);
  requireExactKeys(record, REVIEW_KEYS, context);
  const id = requireNonEmptyString(record.id, `${context}.id`);
  if (
    typeof record.expectedRevision !== "number" ||
    !Number.isInteger(record.expectedRevision) ||
    record.expectedRevision <= 0
  ) {
    throw new Error(
      `${context}.expectedRevision must be a positive integer`,
    );
  }
  if (record.expectedStatus !== "DRAFT") {
    throw new Error(`${context}.expectedStatus must be DRAFT`);
  }
  const title = requireNonEmptyString(record.title, `${context}.title`);
  const author = requireNonEmptyString(record.author, `${context}.author`);
  const sourceId = requireNonEmptyString(
    record.sourceId,
    `${context}.sourceId`,
  );
  if (!SOURCE_ID_PATTERN.test(sourceId)) {
    throw new Error(
      `${context}.sourceId must be 12 lowercase hex characters`,
    );
  }
  const sourceHash = requireSha256(
    record.sourceHash,
    `${context}.sourceHash`,
  );
  const payloadHash = requireSha256(
    record.payloadHash,
    `${context}.payloadHash`,
  );
  const poemIdentityHash = requireSha256(
    record.poemIdentityHash,
    `${context}.poemIdentityHash`,
  );
  if (
    record.decision !== "ACTIVATE" &&
    record.decision !== "ARCHIVE_DUPLICATE"
  ) {
    throw new Error(
      `${context}.decision must be ACTIVATE or ARCHIVE_DUPLICATE`,
    );
  }
  if (!Array.isArray(record.checks)) {
    throw new Error(`${context}.checks must be an array`);
  }
  const expectedChecks =
    record.decision === "ACTIVATE" ? ACTIVATE_CHECKS : ARCHIVE_CHECKS;
  if (JSON.stringify(record.checks) !== JSON.stringify(expectedChecks)) {
    throw new Error(
      `${context}.checks do not match decision ${record.decision}`,
    );
  }

  let duplicateOf: string | null;
  if (record.decision === "ACTIVATE") {
    if (record.duplicateOf !== null) {
      throw new Error(`${context}.duplicateOf must be null for ACTIVATE`);
    }
    duplicateOf = null;
  } else {
    if (
      typeof record.duplicateOf !== "string" ||
      record.duplicateOf.length === 0
    ) {
      throw new Error(
        `${context}.duplicateOf must be a non-empty string for ARCHIVE_DUPLICATE`,
      );
    }
    duplicateOf = record.duplicateOf;
  }

  return {
    id,
    expectedRevision: record.expectedRevision,
    expectedStatus: "DRAFT",
    title,
    author,
    sourceId,
    sourceHash,
    payloadHash,
    poemIdentityHash,
    decision: record.decision,
    checks: [...expectedChecks],
    duplicateOf,
  };
}

function validateReviewEntries(
  entries: readonly PoemReviewEntry[],
  requireSorted: boolean,
): void {
  if (entries.length !== EXPECTED_CANDIDATE_COUNT) {
    throw new Error(
      `checklist must contain exactly ${EXPECTED_CANDIDATE_COUNT} entries`,
    );
  }
  const ids = new Set<string>();
  const duplicateTargets = new Set<string>();
  let previousId: string | undefined;
  let activateCount = 0;
  for (const entry of entries) {
    if (ids.has(entry.id)) {
      throw new Error(`duplicate checklist ID: ${entry.id}`);
    }
    ids.add(entry.id);
    if (requireSorted && previousId !== undefined && previousId > entry.id) {
      throw new Error("checklist IDs must be in ascending order");
    }
    previousId = entry.id;

    if (entry.decision === "ACTIVATE") {
      activateCount += 1;
    } else {
      if (duplicateTargets.has(entry.duplicateOf!)) {
        throw new Error(
          `duplicate ACTIVE target in checklist: ${entry.duplicateOf}`,
        );
      }
      duplicateTargets.add(entry.duplicateOf!);
    }
  }
  const archiveCount = entries.length - activateCount;
  if (
    activateCount !== EXPECTED_ACTIVATE_COUNT ||
    archiveCount !== EXPECTED_ARCHIVE_COUNT
  ) {
    throw new Error(
      `checklist decisions must be exactly ${EXPECTED_ACTIVATE_COUNT} ACTIVATE and ${EXPECTED_ARCHIVE_COUNT} ARCHIVE_DUPLICATE`,
    );
  }
}

function normalizeReviewEntries(
  entries: readonly PoemReviewEntry[],
  requireSorted: boolean,
): PoemReviewEntry[] {
  requirePlainJsonStructure(entries, "review entries");
  const normalized = entries.map((entry, index) =>
    parseReviewEntry(entry, `review entry ${index + 1}`),
  );
  if (!requireSorted) {
    normalized.sort(compareIds);
  }
  validateReviewEntries(normalized, requireSorted);
  return normalized;
}

export function parsePoemReview(text: string): PoemReviewEntry[] {
  requirePlainJsonStructure(text, "review text");
  if (typeof text !== "string") {
    throw new Error("review text must be a string");
  }
  const entries: PoemReviewEntry[] = [];
  text.split("\n").forEach((line, index) => {
    if (line.trim() === "") return;
    const context = `review line ${index + 1}`;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(`${context} must be valid JSON`);
    }
    entries.push(parseReviewEntry(value, context));
  });
  validateReviewEntries(entries, true);
  return entries;
}

export function serializePoemReviewSummary(
  entries: readonly PoemReviewEntry[],
  candidateSha256: string,
  checklistSha256: string,
): string {
  requirePlainJsonStructure(entries, "review entries");
  requirePlainJsonStructure(
    candidateSha256,
    "summary candidate SHA-256",
  );
  requirePlainJsonStructure(
    checklistSha256,
    "summary checklist SHA-256",
  );
  if (
    typeof candidateSha256 !== "string" ||
    typeof checklistSha256 !== "string" ||
    !SHA256_PATTERN.test(candidateSha256) ||
    !SHA256_PATTERN.test(checklistSha256)
  ) {
    throw new Error("summary hashes must be lowercase SHA-256");
  }
  const normalized = normalizeReviewEntries(entries, false);
  const duplicates = normalized
    .filter(({ decision }) => decision === "ARCHIVE_DUPLICATE")
    .sort(compareIds);
  return [
    "# Guwendao 唐诗审核摘要",
    "",
    "- Rule version: `guwendao-poem-review-v1`",
    `- Candidate SHA-256: \`${candidateSha256}\``,
    `- Checklist SHA-256: \`${checklistSha256}\``,
    `- Total: ${EXPECTED_CANDIDATE_COUNT}`,
    `- Pre-execution status: DRAFT (${EXPECTED_CANDIDATE_COUNT})`,
    `- Activate: ${EXPECTED_ACTIVATE_COUNT}`,
    `- Archive duplicate: ${EXPECTED_ARCHIVE_COUNT}`,
    "",
    "## Duplicate Mapping",
    "",
    "| Candidate | Title | Author | Active target |",
    "| --- | --- | --- | --- |",
    ...duplicates.map(
      ({ id, title, author, duplicateOf }) =>
        `| ${escapeMarkdownTableCell(id)} | ${escapeMarkdownTableCell(title)} | ${escapeMarkdownTableCell(author)} | ${escapeMarkdownTableCell(duplicateOf!)} |`,
    ),
    "",
  ].join("\n");
}
