import { describe, expect, it } from "vitest";
import { sha256Text } from "../src/idiom-candidates";
import {
  buildIdiomReviewCandidates,
  serializeIdiomReviewCandidates,
} from "../src/idiom-review-candidates";

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

function sourceCandidates(): SourceCandidate[] {
  const named = [
    {
      text: "坚定不移",
      pinyin: ["jiān", "dìng", "bù", "yí"],
      frequency: 54113,
    },
    {
      text: "丰富多彩",
      pinyin: ["fēng", "fù", "duō", "cǎi"],
      frequency: 34727,
    },
  ];

  return Array.from({ length: 1000 }, (_, index) => {
    const rank = index + 1;
    const generatedText = String.fromCodePoint(
      0x4e00 + Math.floor(index / 256),
      0x4e00 + (index % 256),
      0x5000,
      0x5001,
    );
    const fixture = named[index] ?? {
      text: generatedText,
      pinyin: ["a", "b", "c", "d"],
      frequency: 1000 - index,
    };
    const characters = Array.from(fixture.text);
    return {
      id: `idiom-candidate-${String(rank).padStart(4, "0")}`,
      text: fixture.text,
      pinyin: fixture.pinyin,
      head: characters[0]!,
      tail: characters[3]!,
      frequency: fixture.frequency,
      sourceRank: rank,
      status: "NEEDS_MEANING",
      reviewFlags: ["PINYIN_UNVERIFIED", "MEANING_MISSING"],
    };
  });
}

function fixture() {
  const candidates = sourceCandidates();
  const candidateText = `${candidates
    .map((candidate) => JSON.stringify(candidate))
    .join("\n")}\n`;
  const manifest = {
    schemaVersion: "idiom-candidates-v1",
    source: {
      name: "THUOCL",
      url: "https://example.com/THUOCL_chengyu.txt",
      commit: "a".repeat(40),
    },
    output: {
      count: candidates.length,
      sha256: sha256Text(candidateText),
    },
  };
  return {
    candidates,
    candidateText,
    manifest,
    toneFreePinyinFor: (text: string) =>
      text === "坚定不移"
        ? ["jian", "ding", "bu", "yi"]
        : text === "丰富多彩"
          ? ["feng", "fu", "duo", "cai"]
          : ["a", "b", "c", "d"],
  };
}

type Fixture = ReturnType<typeof fixture>;

function refreshCandidateText(input: Fixture): void {
  input.candidateText = `${input.candidates
    .map((candidate) => JSON.stringify(candidate))
    .join("\n")}\n`;
  input.manifest.output.sha256 = sha256Text(input.candidateText);
}

function buildFixture(input: Fixture) {
  return buildIdiomReviewCandidates({
    candidateText: input.candidateText,
    manifest: input.manifest,
    toneFreePinyinFor: input.toneFreePinyinFor,
  });
}

describe("buildIdiomReviewCandidates", () => {
  it("maps the validated candidate snapshot to review imports", () => {
    const input = fixture();
    const candidates = buildFixture(input);

    expect(candidates[0]).toEqual({
      importKey: "THUOCL_IDIOM:idiom-candidate-0001",
      source: "THUOCL_IDIOM",
      sourceRef: input.manifest.source.url,
      sourceHash:
        "ad11a1f457b8c108eaa84431d66acb2da2e3adf8663a1784caec271b9a3a820f",
      ruleVersion: "thuocl-idiom-review-v1",
      id: `cy-thuocl-${sha256Text("坚定不移").slice(0, 12)}`,
      type: "IDIOM",
      suggestedLevel: 5,
      suggestedDifficulty: 5,
      promotionRequired: true,
      tags: ["成语", "THUOCL", "待补释义", "拼音待复核"],
      payload: {
        text: "坚定不移",
        meaning: "",
        headPinyin: "jian",
        tailPinyin: "yi",
        pinyin: ["jiān", "dìng", "bù", "yí"],
        source: {
          candidateId: "idiom-candidate-0001",
          sourceCommit: "a".repeat(40),
          sourceRank: 1,
          frequency: 54113,
          reviewFlags: ["PINYIN_UNVERIFIED", "MEANING_MISSING"],
        },
      },
      score: 54113,
    });
    expect(candidates).toHaveLength(1000);
    expect(new Set(candidates.map(({ id }) => id)).size).toBe(1000);
  });

  it.each([
    [
      "malformed JSON line",
      (input: Fixture) => {
        const lines = input.candidateText.trimEnd().split("\n");
        lines[0] = "{";
        input.candidateText = `${lines.join("\n")}\n`;
        input.manifest.output.sha256 = sha256Text(input.candidateText);
      },
      "candidate line 1 must be valid JSON",
    ],
    [
      "wrong candidate count",
      (input: Fixture) => {
        input.candidates.pop();
        refreshCandidateText(input);
      },
      "candidateText must contain exactly 1000 records",
    ],
    [
      "manifest output count mismatch",
      (input: Fixture) => {
        input.manifest.output.count = 999;
      },
      "manifest.output.count must be exactly 1000",
    ],
    [
      "manifest SHA-256 mismatch",
      (input: Fixture) => {
        input.manifest.output.sha256 = "b".repeat(64);
      },
      "manifest.output.sha256 does not match candidateText",
    ],
    [
      "duplicate candidate id",
      (input: Fixture) => {
        input.candidates[1]!.id = input.candidates[0]!.id;
        refreshCandidateText(input);
      },
      "candidates[1].id must be unique",
    ],
    [
      "duplicate candidate text",
      (input: Fixture) => {
        input.candidates[1]!.text = input.candidates[0]!.text;
        refreshCandidateText(input);
      },
      "candidates[1].text must be unique after normalization",
    ],
    [
      "candidate id does not match rank",
      (input: Fixture) => {
        input.candidates[0]!.id = "idiom-candidate-9999";
        refreshCandidateText(input);
      },
      "candidates[0].id must be idiom-candidate-0001",
    ],
    [
      "non-four-character text",
      (input: Fixture) => {
        input.candidates[0]!.text = "三字词";
        refreshCandidateText(input);
      },
      "candidates[0].text must contain four basic CJK characters",
    ],
    [
      "pinyin length is not four",
      (input: Fixture) => {
        input.candidates[0]!.pinyin = ["jiān"];
        refreshCandidateText(input);
      },
      "candidates[0].pinyin must contain exactly four non-empty strings",
    ],
    [
      "head or tail mismatch",
      (input: Fixture) => {
        input.candidates[0]!.tail = "错";
        refreshCandidateText(input);
      },
      "candidates[0].tail must match the fourth text character",
    ],
    [
      "review flags differ",
      (input: Fixture) => {
        input.candidates[0]!.reviewFlags = [
          "MEANING_MISSING",
          "PINYIN_UNVERIFIED",
        ] as unknown as SourceCandidate["reviewFlags"];
        refreshCandidateText(input);
      },
      "candidates[0].reviewFlags must be PINYIN_UNVERIFIED,MEANING_MISSING",
    ],
    [
      "tone-free pinyin is not four lowercase ASCII syllables",
      (input: Fixture) => {
        input.toneFreePinyinFor = () => ["Jiān", "ding", "bu", "yi"];
      },
      "tone-free pinyin must contain exactly four lowercase ASCII syllables",
    ],
  ])("rejects invalid input: %s", (_name, mutate, expectedMessage) => {
    const input = fixture();
    mutate(input);

    expect(() => buildFixture(input)).toThrow(expectedMessage);
  });

  it.each([
    [
      "non-object manifest",
      (input: Fixture) => {
        input.manifest = null as unknown as Fixture["manifest"];
      },
      "manifest must be an object",
    ],
    [
      "schema version",
      (input: Fixture) => {
        input.manifest.schemaVersion = "other";
      },
      "manifest.schemaVersion must be idiom-candidates-v1",
    ],
    [
      "source name",
      (input: Fixture) => {
        input.manifest.source.name = "OTHER";
      },
      "manifest.source.name must be THUOCL",
    ],
    [
      "source URL",
      (input: Fixture) => {
        input.manifest.source.url = "http://example.com/source.txt";
      },
      "manifest.source.url must be a non-empty HTTPS URL",
    ],
    [
      "empty source URL",
      (input: Fixture) => {
        input.manifest.source.url = "";
      },
      "manifest.source.url must be a non-empty HTTPS URL",
    ],
    [
      "source commit",
      (input: Fixture) => {
        input.manifest.source.commit = "A".repeat(40);
      },
      "manifest.source.commit must be 40 lowercase hex characters",
    ],
    [
      "output SHA-256 format",
      (input: Fixture) => {
        input.manifest.output.sha256 = "A".repeat(64);
      },
      "manifest.output.sha256 must be 64 lowercase hex characters",
    ],
  ])("rejects an invalid manifest %s", (_name, mutate, expectedMessage) => {
    const input = fixture();
    mutate(input);

    expect(() => buildFixture(input)).toThrow(expectedMessage);
  });

  it.each([
    [
      "empty id",
      (candidate: SourceCandidate) => {
        candidate.id = "";
      },
      "candidates[0].id must be a non-empty string",
    ],
    [
      "head",
      (candidate: SourceCandidate) => {
        candidate.head = "错";
      },
      "candidates[0].head must match the first text character",
    ],
    [
      "frequency",
      (candidate: SourceCandidate) => {
        candidate.frequency = 0;
      },
      "candidates[0].frequency must be a positive safe integer",
    ],
    [
      "source rank",
      (candidate: SourceCandidate) => {
        candidate.sourceRank = 2;
      },
      "candidates[0].sourceRank must be 1",
    ],
    [
      "status",
      (candidate: SourceCandidate) => {
        candidate.status =
          "READY" as unknown as SourceCandidate["status"];
      },
      "candidates[0].status must be NEEDS_MEANING",
    ],
  ])("rejects an invalid candidate %s", (_name, mutate, expectedMessage) => {
    const input = fixture();
    mutate(input.candidates[0]!);
    refreshCandidateText(input);

    expect(() => buildFixture(input)).toThrow(expectedMessage);
  });
});

describe("serializeIdiomReviewCandidates", () => {
  it("serializes deterministically as newline-delimited JSON", () => {
    const input = fixture();
    const first = serializeIdiomReviewCandidates(buildFixture(input));
    const second = serializeIdiomReviewCandidates(buildFixture(input));

    expect(first).toBe(second);
    expect(first.endsWith("\n")).toBe(true);
    expect(serializeIdiomReviewCandidates([])).toBe("");
  });
});
