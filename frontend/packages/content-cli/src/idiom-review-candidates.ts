import { createHash } from "node:crypto";

export interface BuildIdiomReviewCandidatesOptions {
  candidateText: string;
  manifest: unknown;
  toneFreePinyinFor(text: string): string[];
  contentIdForText?: (text: string) => string;
}

export interface IdiomReviewCandidate {
  importKey: string;
  source: "THUOCL_IDIOM";
  sourceRef: string;
  sourceHash: string;
  ruleVersion: "thuocl-idiom-review-v1";
  id: string;
  type: "IDIOM";
  suggestedLevel: 5;
  suggestedDifficulty: 5;
  promotionRequired: true;
  tags: ["成语", "THUOCL", "待补释义", "拼音待复核"];
  payload: {
    text: string;
    meaning: "";
    headPinyin: string;
    tailPinyin: string;
    pinyin: string[];
    source: {
      candidateId: string;
      sourceCommit: string;
      sourceRank: number;
      frequency: number;
      reviewFlags: ["PINYIN_UNVERIFIED", "MEANING_MISSING"];
    };
  };
  score: number;
}

interface SourceCandidate {
  id: string;
  text: string;
  pinyin: string[];
  head: string;
  tail: string;
  frequency: number;
  sourceRank: number;
  status: "NEEDS_MEANING";
  reviewFlags: ["PINYIN_UNVERIFIED", "MEANING_MISSING"];
}

interface CandidateManifest {
  sourceUrl: string;
  sourceCommit: string;
}

const EXPECTED_COUNT = 1000;
const SOURCE = "THUOCL_IDIOM";
const RULE_VERSION = "thuocl-idiom-review-v1";
const FOUR_BASIC_CJK = /^[\u4E00-\u9FFF]{4}$/u;
const TONE_FREE_PINYIN = /^[a-z]+$/;
const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const REVIEW_FLAGS = [
  "PINYIN_UNVERIFIED",
  "MEANING_MISSING",
] as const;

function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function requireObject(
  value: unknown,
  context: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireHttpsUrl(value: unknown, context: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${context} must be a non-empty HTTPS URL`);
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.hostname.length === 0) {
      throw new Error();
    }
  } catch {
    throw new Error(`${context} must be a non-empty HTTPS URL`);
  }
  return value;
}

function parseManifest(
  value: unknown,
  candidateText: string,
): CandidateManifest {
  const manifest = requireObject(value, "manifest");
  if (manifest.schemaVersion !== "idiom-candidates-v1") {
    throw new Error("manifest.schemaVersion must be idiom-candidates-v1");
  }

  const source = requireObject(manifest.source, "manifest.source");
  if (source.name !== "THUOCL") {
    throw new Error("manifest.source.name must be THUOCL");
  }
  const sourceUrl = requireHttpsUrl(source.url, "manifest.source.url");
  if (typeof source.commit !== "string" || !COMMIT.test(source.commit)) {
    throw new Error(
      "manifest.source.commit must be 40 lowercase hex characters",
    );
  }

  const output = requireObject(manifest.output, "manifest.output");
  if (output.count !== EXPECTED_COUNT) {
    throw new Error(`manifest.output.count must be exactly ${EXPECTED_COUNT}`);
  }
  if (typeof output.sha256 !== "string" || !SHA256.test(output.sha256)) {
    throw new Error(
      "manifest.output.sha256 must be 64 lowercase hex characters",
    );
  }
  if (output.sha256 !== sha256Text(candidateText)) {
    throw new Error("manifest.output.sha256 does not match candidateText");
  }

  return {
    sourceUrl,
    sourceCommit: source.commit,
  };
}

function requireNonEmptyString(
  value: unknown,
  context: string,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${context} must be a non-empty string`);
  }
  return value;
}

function parseCandidate(
  value: unknown,
  index: number,
  sourceIds: Set<string>,
  normalizedTexts: Set<string>,
): SourceCandidate {
  const context = `candidates[${index}]`;
  const record = requireObject(value, context);
  const id = requireNonEmptyString(record.id, `${context}.id`);
  if (sourceIds.has(id)) {
    throw new Error(`${context}.id must be unique`);
  }
  sourceIds.add(id);

  const expectedRank = index + 1;
  const expectedId =
    `idiom-candidate-${String(expectedRank).padStart(4, "0")}`;
  if (id !== expectedId) {
    throw new Error(`${context}.id must be ${expectedId}`);
  }

  const text = requireNonEmptyString(record.text, `${context}.text`);
  if (!FOUR_BASIC_CJK.test(text)) {
    throw new Error(`${context}.text must contain four basic CJK characters`);
  }
  const normalizedText = text.normalize("NFC");
  if (normalizedTexts.has(normalizedText)) {
    throw new Error(`${context}.text must be unique after normalization`);
  }
  normalizedTexts.add(normalizedText);

  if (
    !Array.isArray(record.pinyin) ||
    record.pinyin.length !== 4 ||
    record.pinyin.some(
      (syllable) =>
        typeof syllable !== "string" || syllable.trim().length === 0,
    )
  ) {
    throw new Error(
      `${context}.pinyin must contain exactly four non-empty strings`,
    );
  }
  const pinyin = record.pinyin as string[];
  const characters = Array.from(text);
  if (record.head !== characters[0]) {
    throw new Error(`${context}.head must match the first text character`);
  }
  if (record.tail !== characters[3]) {
    throw new Error(`${context}.tail must match the fourth text character`);
  }
  if (
    !Number.isSafeInteger(record.frequency) ||
    (record.frequency as number) <= 0
  ) {
    throw new Error(`${context}.frequency must be a positive safe integer`);
  }
  if (record.sourceRank !== expectedRank) {
    throw new Error(`${context}.sourceRank must be ${expectedRank}`);
  }
  if (record.status !== "NEEDS_MEANING") {
    throw new Error(`${context}.status must be NEEDS_MEANING`);
  }
  if (
    !Array.isArray(record.reviewFlags) ||
    record.reviewFlags.length !== REVIEW_FLAGS.length ||
    record.reviewFlags.some((flag, flagIndex) => flag !== REVIEW_FLAGS[flagIndex])
  ) {
    throw new Error(
      `${context}.reviewFlags must be PINYIN_UNVERIFIED,MEANING_MISSING`,
    );
  }

  return {
    id,
    text,
    pinyin,
    head: characters[0]!,
    tail: characters[3]!,
    frequency: record.frequency as number,
    sourceRank: expectedRank,
    status: "NEEDS_MEANING",
    reviewFlags: [...REVIEW_FLAGS],
  };
}

function parseCandidates(candidateText: string): SourceCandidate[] {
  const lines = candidateText
    .split(/\r?\n/)
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => line.trim().length > 0);

  if (lines.length !== EXPECTED_COUNT) {
    throw new Error(
      `candidateText must contain exactly ${EXPECTED_COUNT} records`,
    );
  }

  const sourceIds = new Set<string>();
  const normalizedTexts = new Set<string>();
  return lines.map(({ line, lineNumber }, index) => {
    let value: unknown;
    try {
      value = JSON.parse(line) as unknown;
    } catch {
      throw new Error(`candidate line ${lineNumber} must be valid JSON`);
    }
    return parseCandidate(value, index, sourceIds, normalizedTexts);
  });
}

function candidateSourceHash(candidate: SourceCandidate): string {
  const canonical = JSON.stringify({
    id: candidate.id,
    text: candidate.text,
    pinyin: candidate.pinyin,
    head: candidate.head,
    tail: candidate.tail,
    frequency: candidate.frequency,
    sourceRank: candidate.sourceRank,
    status: candidate.status,
    reviewFlags: candidate.reviewFlags,
  });
  return sha256Text(canonical);
}

export function buildIdiomReviewCandidates(
  options: BuildIdiomReviewCandidatesOptions,
): IdiomReviewCandidate[] {
  const manifest = parseManifest(options.manifest, options.candidateText);
  const sourceCandidates = parseCandidates(options.candidateText);
  const contentIdForText =
    options.contentIdForText ??
    ((text: string) => `cy-thuocl-${sha256Text(text).slice(0, 12)}`);
  const outputIds = new Set<string>();

  return sourceCandidates.map((candidate, index) => {
    const toneFreePinyin = options.toneFreePinyinFor(candidate.text);
    if (
      !Array.isArray(toneFreePinyin) ||
      toneFreePinyin.length !== 4 ||
      toneFreePinyin.some(
        (syllable) =>
          typeof syllable !== "string" || !TONE_FREE_PINYIN.test(syllable),
      )
    ) {
      throw new Error(
        `candidates[${index}]: tone-free pinyin must contain exactly four lowercase ASCII syllables`,
      );
    }

    const outputId = contentIdForText(candidate.text);
    if (outputIds.has(outputId)) {
      throw new Error(`candidates[${index}]: output id must be unique`);
    }
    outputIds.add(outputId);

    return {
      importKey: `${SOURCE}:${candidate.id}`,
      source: SOURCE,
      sourceRef: manifest.sourceUrl,
      sourceHash: candidateSourceHash(candidate),
      ruleVersion: RULE_VERSION,
      id: outputId,
      type: "IDIOM",
      suggestedLevel: 5,
      suggestedDifficulty: 5,
      promotionRequired: true,
      tags: ["成语", "THUOCL", "待补释义", "拼音待复核"],
      payload: {
        text: candidate.text,
        meaning: "",
        headPinyin: toneFreePinyin[0]!,
        tailPinyin: toneFreePinyin[3]!,
        pinyin: candidate.pinyin,
        source: {
          candidateId: candidate.id,
          sourceCommit: manifest.sourceCommit,
          sourceRank: candidate.sourceRank,
          frequency: candidate.frequency,
          reviewFlags: [...REVIEW_FLAGS],
        },
      },
      score: candidate.frequency,
    };
  });
}

export function serializeIdiomReviewCandidates(
  candidates: readonly IdiomReviewCandidate[],
): string {
  return candidates.length === 0
    ? ""
    : `${candidates.map((candidate) => JSON.stringify(candidate)).join("\n")}\n`;
}
