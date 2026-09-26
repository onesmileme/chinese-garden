import { describe, expect, it } from "vitest";
import {
  buildIdiomCandidateManifest,
  buildIdiomCandidates,
  serializeIdiomCandidates,
  sha256Text,
} from "../src/idiom-candidates";

const pinyinFor = (text: string): string[] =>
  Array.from(text).map((character) => `py-${character}`);

describe("buildIdiomCandidates", () => {
  it("normalizes, filters, deduplicates, excludes existing words, and ranks deterministically", () => {
    const result = buildIdiomCandidates({
      sourceText: [
        "春夏秋冬\t20",
        "山高水长\t30",
        " 山高水长 \t40",
        "一心一意\t100",
        "三字词\t90",
        "A山高水\t80",
        "",
      ].join("\n"),
      existingTexts: new Set(["一心一意"]),
      count: 2,
      pinyinFor,
    });

    expect(result.candidates).toEqual([
      {
        id: "idiom-candidate-0001",
        text: "山高水长",
        pinyin: ["py-山", "py-高", "py-水", "py-长"],
        head: "山",
        tail: "长",
        frequency: 40,
        sourceRank: 1,
        status: "NEEDS_MEANING",
        reviewFlags: ["PINYIN_UNVERIFIED", "MEANING_MISSING"],
      },
      {
        id: "idiom-candidate-0002",
        text: "春夏秋冬",
        pinyin: ["py-春", "py-夏", "py-秋", "py-冬"],
        head: "春",
        tail: "冬",
        frequency: 20,
        sourceRank: 2,
        status: "NEEDS_MEANING",
        reviewFlags: ["PINYIN_UNVERIFIED", "MEANING_MISSING"],
      },
    ]);
    expect(result.stats).toEqual({
      sourceRecords: 6,
      fourCharacterRecords: 4,
      uniqueRecords: 3,
      excludedExisting: 1,
      available: 2,
      output: 2,
    });
  });

  it("uses Unicode text order to break equal-frequency ties", () => {
    const result = buildIdiomCandidates({
      sourceText: "春夏秋冬\t10\n山高水长\t10\n山高水远\t10\n",
      existingTexts: new Set(),
      count: 3,
      pinyinFor,
    });
    expect(result.candidates.map(({ text }) => text)).toEqual([
      "山高水远",
      "山高水长",
      "春夏秋冬",
    ]);
  });

  it.each([
    "坏行",
    "春夏秋冬\tnan",
    "春夏秋冬\t1.5",
    "春夏秋冬\t0",
    "春夏秋冬\t-1",
    "春夏秋冬\t0x10",
    "春夏秋冬\t1e2",
    "春夏秋冬\t+1",
    "春夏秋冬\t9007199254740992",
  ])(
    "rejects malformed source line %s",
    (line) => {
      expect(() =>
        buildIdiomCandidates({
          sourceText: line,
          existingTexts: new Set(),
          count: 1,
          pinyinFor,
        }),
      ).toThrow(/THUOCL line 1/);
    },
  );

  it("rejects non-positive target counts and insufficient candidates", () => {
    expect(() =>
      buildIdiomCandidates({
        sourceText: "春夏秋冬\t1\n",
        existingTexts: new Set(),
        count: 0,
        pinyinFor,
      }),
    ).toThrow("count must be a positive integer");
    expect(() =>
      buildIdiomCandidates({
        sourceText: "春夏秋冬\t1\n",
        existingTexts: new Set(),
        count: 1.5,
        pinyinFor,
      }),
    ).toThrow("count must be a positive integer");
    expect(() =>
      buildIdiomCandidates({
        sourceText: "春夏秋冬\t1\n",
        existingTexts: new Set(),
        count: 2,
        pinyinFor,
      }),
    ).toThrow("requested 2 candidates, only 1 available");
  });

  it("rejects generated pinyin that does not contain four syllables", () => {
    expect(() =>
      buildIdiomCandidates({
        sourceText: "春夏秋冬\t1\n",
        existingTexts: new Set(),
        count: 1,
        pinyinFor: () => ["chūn"],
      }),
    ).toThrow("春夏秋冬: expected 4 pinyin syllables");
    expect(() =>
      buildIdiomCandidates({
        sourceText: "春夏秋冬\t1\n",
        existingTexts: new Set(),
        count: 1,
        pinyinFor: () => ["chūn", "xià", " ", "dōng"],
      }),
    ).toThrow("春夏秋冬: expected 4 pinyin syllables");
  });

  it("trims every generated pinyin syllable", () => {
    const result = buildIdiomCandidates({
      sourceText: "春夏秋冬\t1\n",
      existingTexts: new Set(),
      count: 1,
      pinyinFor: () => [" chūn ", "xià", "qiū", "dōng"],
    });
    expect(result.candidates[0].pinyin).toEqual([
      "chūn",
      "xià",
      "qiū",
      "dōng",
    ]);
  });
});

describe("idiom candidate output", () => {
  const generated = buildIdiomCandidates({
    sourceText: "春夏秋冬\t1\n",
    existingTexts: new Set(),
    count: 1,
    pinyinFor,
  });
  const validStats = {
    sourceRecords: 10,
    fourCharacterRecords: 8,
    uniqueRecords: 6,
    excludedExisting: 2,
    available: 4,
    output: 3,
  };
  const validManifestOptions = {
    sourceCommit: "a".repeat(40),
    sourceSha256: "a".repeat(64),
    bankSha256: "b".repeat(64),
    outputSha256: "c".repeat(64),
    fetchedAt: "2026-09-26T00:00:00.000Z",
    pinyinProVersion: "3.29.4",
    count: 3,
    stats: validStats,
  };

  it("serializes stable newline-delimited JSON", () => {
    const output = serializeIdiomCandidates(generated.candidates);
    const expected =
      '{"id":"idiom-candidate-0001","text":"春夏秋冬","pinyin":["py-春","py-夏","py-秋","py-冬"],"head":"春","tail":"冬","frequency":1,"sourceRank":1,"status":"NEEDS_MEANING","reviewFlags":["PINYIN_UNVERIFIED","MEANING_MISSING"]}\n';
    const repeated = buildIdiomCandidates({
      sourceText: "春夏秋冬\t1\n",
      existingTexts: new Set(),
      count: 1,
      pinyinFor,
    });

    expect(output).toBe(expected);
    expect(serializeIdiomCandidates(repeated.candidates)).toBe(expected);
    expect(serializeIdiomCandidates([])).toBe("");
  });

  it("hashes UTF-8 text with SHA-256", () => {
    expect(sha256Text("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("builds the complete manifest contract", () => {
    expect(buildIdiomCandidateManifest(validManifestOptions)).toEqual({
      schemaVersion: "idiom-candidates-v1",
      source: {
        name: "THUOCL",
        url: `https://raw.githubusercontent.com/thunlp/THUOCL/${"a".repeat(40)}/data/THUOCL_chengyu.txt`,
        license: "MIT",
        licenseUrl: `https://github.com/thunlp/THUOCL/blob/${"a".repeat(40)}/LICENSE`,
        commit: "a".repeat(40),
        sha256: "a".repeat(64),
        fetchedAt: "2026-09-26T00:00:00.000Z",
      },
      generator: {
        command:
          "pnpm exec tsx packages/content-cli/src/bin.ts idiom-candidates",
        pinyinProVersion: "3.29.4",
        ranking: "frequency-desc-text-unicode-asc",
        fieldMapping: {
          text: "NFC-normalized THUOCL term",
          frequency: "maximum THUOCL DF for the normalized term",
          pinyin: "four trimmed syllables generated by pinyin-pro",
          head: "first Unicode code point of text",
          tail: "fourth Unicode code point of text",
          sourceRank: "one-based position after deterministic ranking",
          status: "fixed NEEDS_MEANING",
          reviewFlags: "fixed PINYIN_UNVERIFIED and MEANING_MISSING",
        },
      },
      inputs: { idiomBankSha256: "b".repeat(64) },
      stats: validStats,
      output: {
        file: "idioms-thuocl-top1000.ndjson",
        count: 3,
        sha256: "c".repeat(64),
      },
    });
  });

  it.each([
    "2026-09-26T00:00:00Z",
    "2026-09-26T08:30:00.123+08:00",
    "2026-09-26T08:30:00-04:30",
  ])("accepts complete ISO timestamps with a timezone: %s", (fetchedAt) => {
    expect(
      buildIdiomCandidateManifest({ ...validManifestOptions, fetchedAt }).source
        .fetchedAt,
    ).toBe(fetchedAt);
  });

  it.each([
    ["sourceCommit", "main"],
    ["sourceSha256", ""],
    ["bankSha256", "bad-hash"],
    ["outputSha256", "bad-hash"],
    ["fetchedAt", "invalid"],
    ["fetchedAt", "2026-09-26"],
    ["fetchedAt", "2026-09-26T00:00:00"],
    ["fetchedAt", "2026-02-30T00:00:00Z"],
    ["pinyinProVersion", ""],
    ["count", 2],
  ] as const)("rejects malformed manifest field %s", (field, value) => {
    const valid = {
      sourceCommit: "a".repeat(40),
      sourceSha256: "a".repeat(64),
      bankSha256: "b".repeat(64),
      outputSha256: "c".repeat(64),
      fetchedAt: "2026-09-26T00:00:00.000Z",
      pinyinProVersion: "3.29.4",
      count: 1,
      stats: generated.stats,
    };
    expect(() =>
      buildIdiomCandidateManifest({ ...valid, [field]: value }),
    ).toThrow();
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects non-positive or unsafe manifest count %s",
    (count) => {
      expect(() =>
        buildIdiomCandidateManifest({ ...validManifestOptions, count }),
      ).toThrow("count must be a positive safe integer");
    },
  );

  it.each(
    (
      [
        "sourceRecords",
        "fourCharacterRecords",
        "uniqueRecords",
        "excludedExisting",
        "available",
        "output",
      ] as const
    ).flatMap((field) =>
      [-1, 1.5, Number.MAX_SAFE_INTEGER + 1].map(
        (value) => [field, value] as const,
      ),
    ),
  )("rejects invalid stats.%s value %s", (field, value) => {
    expect(() =>
      buildIdiomCandidateManifest({
        ...validManifestOptions,
        stats: { ...validStats, [field]: value },
      }),
    ).toThrow(`${field} must be a non-negative safe integer`);
  });

  it.each([
    [
      { sourceRecords: 7 },
      "sourceRecords must be greater than or equal to fourCharacterRecords",
    ],
    [
      { fourCharacterRecords: 5 },
      "fourCharacterRecords must be greater than or equal to uniqueRecords",
    ],
    [
      { excludedExisting: 7 },
      "excludedExisting must be less than or equal to uniqueRecords",
    ],
    [
      { available: 5 },
      "available must equal uniqueRecords minus excludedExisting",
    ],
    [
      { output: 5 },
      "available must be greater than or equal to output",
    ],
  ] as const)("rejects inconsistent manifest stats %#", (stats, message) => {
    expect(() =>
      buildIdiomCandidateManifest({
        ...validManifestOptions,
        count: "output" in stats ? stats.output : validManifestOptions.count,
        stats: { ...validStats, ...stats },
      }),
    ).toThrow(message);
  });
});
