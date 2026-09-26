import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface Candidate {
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

const candidatePath = new URL(
  "../candidates/idioms-thuocl-top1000.ndjson",
  import.meta.url,
);
const manifestPath = new URL(
  "../candidates/idioms-thuocl-top1000.manifest.json",
  import.meta.url,
);
const bankPath = new URL("../corpus/idiom-bank.json", import.meta.url);

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function compareUnicodeCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0)!);
  const rightPoints = Array.from(
    right,
    (character) => character.codePointAt(0)!,
  );
  const length = Math.min(leftPoints.length, rightPoints.length);

  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) {
      return leftPoints[index]! - rightPoints[index]!;
    }
  }
  return leftPoints.length - rightPoints.length;
}

describe("THUOCL idiom candidate snapshot", () => {
  it("contains 1,000 deterministic, isolated review-only candidates", () => {
    const raw = readFileSync(candidatePath, "utf8");
    const bankRaw = readFileSync(bankPath, "utf8");

    expect(raw.endsWith("\n")).toBe(true);
    expect(raw.endsWith("\n\n")).toBe(false);
    expect(sha256(raw)).toBe(
      "e7604bb594b6ad5951713cf48038b4f73f2482b4a90e702b171f76dff668cafe",
    );

    const lines = raw.slice(0, -1).split("\n");
    const candidates = lines.map(
      (line) => JSON.parse(line) as Candidate,
    );
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const bank = JSON.parse(bankRaw);
    const formalTexts = new Set(
      bank.idioms.map(({ text }: { text: string }) => text),
    );

    expect(lines.every((line) => line.length > 0)).toBe(true);
    expect(candidates).toHaveLength(1000);
    expect(new Set(candidates.map(({ id }) => id)).size).toBe(1000);
    expect(new Set(candidates.map(({ text }) => text)).size).toBe(1000);

    for (const [index, candidate] of candidates.entries()) {
      expect(Object.keys(candidate).sort()).toEqual([
        "frequency",
        "head",
        "id",
        "pinyin",
        "reviewFlags",
        "sourceRank",
        "status",
        "tail",
        "text",
      ]);
      expect(candidate.id).toBe(
        `idiom-candidate-${String(index + 1).padStart(4, "0")}`,
      );
      expect(candidate.sourceRank).toBe(index + 1);
      expect(candidate.text).toMatch(/^[\u4E00-\u9FFF]{4}$/u);
      expect(candidate.pinyin).toHaveLength(4);
      expect(
        candidate.pinyin.every(
          (syllable) => typeof syllable === "string" && syllable.length > 0,
        ),
      ).toBe(true);
      expect(candidate.head).toBe(Array.from(candidate.text)[0]);
      expect(candidate.tail).toBe(Array.from(candidate.text)[3]);
      expect(Number.isSafeInteger(candidate.frequency)).toBe(true);
      expect(candidate.frequency).toBeGreaterThan(0);
      expect(candidate.status).toBe("NEEDS_MEANING");
      expect(candidate.reviewFlags).toEqual([
        "PINYIN_UNVERIFIED",
        "MEANING_MISSING",
      ]);
      expect(formalTexts.has(candidate.text)).toBe(false);
      expect(candidate).not.toHaveProperty("meaning");

      if (index > 0) {
        const previous = candidates[index - 1]!;
        expect(previous.frequency).toBeGreaterThanOrEqual(candidate.frequency);
        if (previous.frequency === candidate.frequency) {
          expect(
            compareUnicodeCodePoints(previous.text, candidate.text),
          ).toBeLessThan(0);
        }
      }
    }

    expect(Object.keys(manifest).sort()).toEqual([
      "generator",
      "inputs",
      "output",
      "schemaVersion",
      "source",
      "stats",
    ]);
    expect(Object.keys(manifest.source).sort()).toEqual([
      "commit",
      "fetchedAt",
      "license",
      "licenseUrl",
      "name",
      "sha256",
      "url",
    ]);
    expect(Object.keys(manifest.generator).sort()).toEqual([
      "command",
      "fieldMapping",
      "pinyinProVersion",
      "ranking",
    ]);
    expect(Object.keys(manifest.generator.fieldMapping).sort()).toEqual([
      "frequency",
      "head",
      "pinyin",
      "reviewFlags",
      "sourceRank",
      "status",
      "tail",
      "text",
    ]);
    expect(Object.keys(manifest.inputs).sort()).toEqual([
      "idiomBankSha256",
    ]);
    expect(Object.keys(manifest.stats).sort()).toEqual([
      "available",
      "excludedExisting",
      "fourCharacterRecords",
      "output",
      "sourceRecords",
      "uniqueRecords",
    ]);
    expect(Object.keys(manifest.output).sort()).toEqual([
      "count",
      "file",
      "sha256",
    ]);
    expect(manifest.schemaVersion).toBe("idiom-candidates-v1");
    expect(manifest.source.name).toBe("THUOCL");
    expect(manifest.source.url).toBe(
      "https://raw.githubusercontent.com/thunlp/THUOCL/a30ce79d895d01ab5132a5c74c29703ff7efb4cc/data/THUOCL_chengyu.txt",
    );
    expect(manifest.source.license).toBe("MIT");
    expect(manifest.source.licenseUrl).toBe(
      "https://github.com/thunlp/THUOCL/blob/a30ce79d895d01ab5132a5c74c29703ff7efb4cc/LICENSE",
    );
    expect(manifest.source.commit).toBe(
      "a30ce79d895d01ab5132a5c74c29703ff7efb4cc",
    );
    expect(manifest.source.fetchedAt).toBe("2026-09-26T00:00:00.000Z");
    expect(manifest.source.sha256).toBe(
      "c339d5d6e37d4f8ecdcb82f2a02b7fdfc66796f0a5215155f2aff8a77e89a7eb",
    );
    expect(manifest.inputs.idiomBankSha256).toBe(sha256(bankRaw));
    expect(manifest.generator.command).toBe(
      "pnpm exec tsx packages/content-cli/src/bin.ts idiom-candidates",
    );
    expect(manifest.generator.pinyinProVersion).toBe("3.29.4");
    expect(manifest.generator.ranking).toBe(
      "frequency-desc-text-unicode-asc",
    );
    expect(manifest.generator.fieldMapping).toEqual({
      text: "NFC-normalized THUOCL term",
      frequency: "maximum THUOCL DF for the normalized term",
      pinyin: "four trimmed syllables generated by pinyin-pro",
      head: "first Unicode code point of text",
      tail: "fourth Unicode code point of text",
      sourceRank: "one-based position after deterministic ranking",
      status: "fixed NEEDS_MEANING",
      reviewFlags: "fixed PINYIN_UNVERIFIED and MEANING_MISSING",
    });
    expect(manifest.output.file).toBe(
      "idioms-thuocl-top1000.ndjson",
    );
    expect(manifest.output.count).toBe(candidates.length);
    expect(manifest.output.sha256).toBe(sha256(raw));

    expect(manifest.stats).toEqual({
      sourceRecords: 8519,
      fourCharacterRecords: 7874,
      uniqueRecords: 7874,
      excludedExisting: 44,
      available: 7830,
      output: 1000,
    });
    for (const value of Object.values(manifest.stats)) {
      expect(Number.isSafeInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
    expect(manifest.stats.sourceRecords).toBe(8519);
    expect(manifest.stats.sourceRecords).toBeGreaterThanOrEqual(
      manifest.stats.fourCharacterRecords,
    );
    expect(manifest.stats.fourCharacterRecords).toBeGreaterThanOrEqual(
      manifest.stats.uniqueRecords,
    );
    expect(manifest.stats.excludedExisting).toBeLessThanOrEqual(
      manifest.stats.uniqueRecords,
    );
    expect(manifest.stats.available).toBe(
      manifest.stats.uniqueRecords - manifest.stats.excludedExisting,
    );
    expect(manifest.stats.available).toBeGreaterThanOrEqual(
      manifest.stats.output,
    );
    expect(manifest.stats.output).toBe(candidates.length);
  });
});
