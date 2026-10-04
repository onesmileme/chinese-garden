import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface SourceCandidate {
  id: string;
  text: string;
  pinyin: string[];
  head: string;
  tail: string;
  frequency: number;
  sourceRank: number;
  status: string;
  reviewFlags: string[];
}

interface ImportCandidate {
  importKey: string;
  source: string;
  sourceRef: string;
  sourceHash: string;
  ruleVersion: string;
  id: string;
  type: string;
  suggestedLevel: number;
  suggestedDifficulty: number;
  promotionRequired: boolean;
  tags: string[];
  payload: {
    text: string;
    meaning: string;
    headPinyin: string;
    tailPinyin: string;
    pinyin: string[];
    source: {
      candidateId: string;
      sourceCommit: string;
      sourceRank: number;
      frequency: number;
      reviewFlags: string[];
    };
  };
  score: number;
}

interface Manifest {
  source: {
    url: string;
    commit: string;
  };
}

const sourcePath = new URL(
  "../candidates/idioms-thuocl-top1000.ndjson",
  import.meta.url,
);
const manifestPath = new URL(
  "../candidates/idioms-thuocl-top1000.manifest.json",
  import.meta.url,
);
const importPath = new URL(
  "../candidates/idioms-thuocl-top1000-import.ndjson",
  import.meta.url,
);

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function parseNdjson<T>(raw: string): T[] {
  expect(raw.endsWith("\n")).toBe(true);
  expect(raw.endsWith("\n\n")).toBe(false);
  return raw
    .slice(0, -1)
    .split("\n")
    .map((line) => JSON.parse(line) as T);
}

describe("THUOCL idiom review import snapshot", () => {
  it("preserves all 1,000 source candidates as review-only imports", () => {
    const importRaw = readFileSync(importPath, "utf8");
    const sourceCandidates = parseNdjson<SourceCandidate>(
      readFileSync(sourcePath, "utf8"),
    );
    const manifest = JSON.parse(
      readFileSync(manifestPath, "utf8"),
    ) as Manifest;
    const importCandidates = parseNdjson<ImportCandidate>(importRaw);

    expect(sha256(importRaw)).toBe(
      "f18d2ab2c79f75fa795aedae9a42412755791ff9784a8c15cd10df5c40caeb2f",
    );
    expect(importCandidates).toHaveLength(1000);
    expect(new Set(importCandidates.map(({ id }) => id)).size).toBe(1000);
    expect(
      new Set(importCandidates.map(({ importKey }) => importKey)).size,
    ).toBe(1000);
    expect(importCandidates.every(({ type }) => type === "IDIOM")).toBe(true);
    expect(
      importCandidates.every(({ suggestedLevel }) => suggestedLevel === 5),
    ).toBe(true);
    expect(
      importCandidates.every(({ promotionRequired }) => promotionRequired),
    ).toBe(true);
    expect(
      importCandidates.every(({ payload }) => payload.meaning === ""),
    ).toBe(true);
    expect(
      importCandidates.every(({ sourceHash }) =>
        /^[0-9a-f]{64}$/.test(sourceHash),
      ),
    ).toBe(true);

    expect(sourceCandidates).toHaveLength(importCandidates.length);
    for (const [index, sourceCandidate] of sourceCandidates.entries()) {
      const importCandidate = importCandidates[index]!;
      const canonicalSource = JSON.stringify({
        id: sourceCandidate.id,
        text: sourceCandidate.text,
        pinyin: sourceCandidate.pinyin,
        head: sourceCandidate.head,
        tail: sourceCandidate.tail,
        frequency: sourceCandidate.frequency,
        sourceRank: sourceCandidate.sourceRank,
        status: sourceCandidate.status,
        reviewFlags: sourceCandidate.reviewFlags,
      });

      expect(importCandidate.importKey).toBe(
        `THUOCL_IDIOM:${sourceCandidate.id}`,
      );
      expect(importCandidate.source).toBe("THUOCL_IDIOM");
      expect(importCandidate.sourceRef).toBe(manifest.source.url);
      expect(importCandidate.sourceHash).toBe(sha256(canonicalSource));
      expect(importCandidate.ruleVersion).toBe("thuocl-idiom-review-v1");
      expect(importCandidate.id).toBe(
        `cy-thuocl-${sha256(sourceCandidate.text).slice(0, 12)}`,
      );
      expect(importCandidate.type).toBe("IDIOM");
      expect(importCandidate.suggestedLevel).toBe(5);
      expect(importCandidate.suggestedDifficulty).toBe(5);
      expect(importCandidate.promotionRequired).toBe(true);
      expect(importCandidate.tags).toEqual([
        "成语",
        "THUOCL",
        "待补释义",
        "拼音待复核",
      ]);
      expect(importCandidate.payload.text).toBe(sourceCandidate.text);
      expect(importCandidate.payload.meaning).toBe("");
      expect(importCandidate.payload.headPinyin).toMatch(/^[a-z]+$/);
      expect(importCandidate.payload.tailPinyin).toMatch(/^[a-z]+$/);
      expect(importCandidate.payload.pinyin).toEqual(sourceCandidate.pinyin);
      expect(importCandidate.payload.source).toEqual({
        candidateId: sourceCandidate.id,
        sourceCommit: manifest.source.commit,
        sourceRank: sourceCandidate.sourceRank,
        frequency: sourceCandidate.frequency,
        reviewFlags: sourceCandidate.reviewFlags,
      });
      expect(importCandidate.score).toBe(sourceCandidate.frequency);
    }
  });
});
