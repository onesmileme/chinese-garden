import { createHash } from "node:crypto";

export interface GuwendaoPoemCandidate {
  importKey: string;
  source: "GUWENDAO_TANG";
  sourceRef: string;
  sourceHash: string;
  ruleVersion: "guwendao-tang-poem-v1";
  id: string;
  type: "POEM";
  suggestedLevel: 5;
  suggestedDifficulty: 5;
  promotionRequired: true;
  tags: [string, string, string];
  payload: {
    title: string;
    author: string;
    lines: string[];
    charRefs: [];
    source: {
      sourceId: string;
      dynasty: string;
      category: string;
      sourceUrl: string;
    };
  };
  score: 100;
}

interface GuwendaoSourcePoem {
  sourceId: string;
  category: string;
  indexTitle: string;
  title: string;
  author: string;
  dynasty: string;
  text: string;
  lines: string[];
  sourceUrl: string;
}

const EXPECTED_RECORD_COUNT = 320;
const SOURCE_ID_PATTERN = /^[0-9a-f]{12}$/;

function requireObject(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${context} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireText(
  record: Record<string, unknown>,
  field: string,
  context: string,
): string {
  const value = record[field];
  if (typeof value !== "string") {
    throw new Error(`${context}.${field} must be a string`);
  }
  const normalized = value.normalize("NFC").trim();
  if (normalized.length === 0) {
    throw new Error(`${context}.${field} must not be empty`);
  }
  return normalized;
}

function parsePoem(value: unknown, index: number): GuwendaoSourcePoem {
  const context = `poems[${index}]`;
  const record = requireObject(value, context);
  const sourceId = requireText(record, "sourceId", context);
  if (!SOURCE_ID_PATTERN.test(sourceId)) {
    throw new Error(`${context}.sourceId must be 12 lowercase hex characters`);
  }

  const category = requireText(record, "category", context);
  const indexTitle = requireText(record, "indexTitle", context);
  const title = requireText(record, "title", context);
  const author = requireText(record, "author", context);
  const dynasty = requireText(record, "dynasty", context);
  const text = requireText(record, "text", context);
  const sourceUrl = requireText(record, "sourceUrl", context);
  const expectedSourceUrl =
    `https://www.guwendao.net/shiwenv_${sourceId}.aspx`;
  if (sourceUrl !== expectedSourceUrl) {
    throw new Error(`${context}.sourceUrl does not match sourceId`);
  }

  if (!Array.isArray(record.lines) || record.lines.length === 0) {
    throw new Error(`${context}.lines must be a non-empty array`);
  }
  const lines = record.lines.map((line, lineIndex) => {
    if (typeof line !== "string") {
      throw new Error(`${context}.lines[${lineIndex}] must be a string`);
    }
    const normalized = line.normalize("NFC").trim();
    if (normalized.length === 0) {
      throw new Error(`${context}.lines[${lineIndex}] must not be empty`);
    }
    return normalized;
  });
  if (text !== lines.join("\n")) {
    throw new Error(`${context}.text must equal lines joined with a newline`);
  }

  return {
    sourceId,
    category,
    indexTitle,
    title,
    author,
    dynasty,
    text,
    lines,
    sourceUrl,
  };
}

function sourceHash(poem: GuwendaoSourcePoem): string {
  const canonical = JSON.stringify({
    sourceId: poem.sourceId,
    category: poem.category,
    indexTitle: poem.indexTitle,
    title: poem.title,
    author: poem.author,
    dynasty: poem.dynasty,
    text: poem.text,
    lines: poem.lines,
    sourceUrl: poem.sourceUrl,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function buildGuwendaoPoemCandidates(
  input: unknown,
): GuwendaoPoemCandidate[] {
  const document = requireObject(input, "input");
  if (document.recordCount !== EXPECTED_RECORD_COUNT) {
    throw new Error(`recordCount must be exactly ${EXPECTED_RECORD_COUNT}`);
  }
  if (!Array.isArray(document.errors)) {
    throw new Error("errors must be an array");
  }
  if (document.errors.length !== 0) {
    throw new Error("errors must be empty");
  }
  if (
    !Array.isArray(document.poems) ||
    document.poems.length !== EXPECTED_RECORD_COUNT
  ) {
    throw new Error(`poems must contain exactly ${EXPECTED_RECORD_COUNT} records`);
  }

  const poems = document.poems.map(parsePoem);
  const sourceIds = new Set<string>();

  return poems.map((poem, index) => {
    if (sourceIds.has(poem.sourceId)) {
      throw new Error(`poems[${index}].sourceId must be unique`);
    }
    sourceIds.add(poem.sourceId);

    return {
      importKey: `GUWENDAO_TANG:${poem.sourceId}`,
      source: "GUWENDAO_TANG",
      sourceRef: poem.sourceUrl,
      sourceHash: sourceHash(poem),
      ruleVersion: "guwendao-tang-poem-v1",
      id: `sc-gwd-${poem.sourceId}`,
      type: "POEM",
      suggestedLevel: 5,
      suggestedDifficulty: 5,
      promotionRequired: true,
      tags: ["唐诗", "古文岛", poem.category],
      payload: {
        title: poem.title,
        author: poem.author,
        lines: poem.lines,
        charRefs: [],
        source: {
          sourceId: poem.sourceId,
          dynasty: poem.dynasty,
          category: poem.category,
          sourceUrl: poem.sourceUrl,
        },
      },
      score: 100,
    };
  });
}

export function serializeGuwendaoPoemCandidates(
  candidates: readonly GuwendaoPoemCandidate[],
): string {
  return candidates.length === 0
    ? ""
    : `${candidates.map((candidate) => JSON.stringify(candidate)).join("\n")}\n`;
}
