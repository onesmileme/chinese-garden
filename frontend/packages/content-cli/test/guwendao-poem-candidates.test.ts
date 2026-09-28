import { describe, expect, it } from "vitest";
import {
  buildGuwendaoPoemCandidates,
  serializeGuwendaoPoemCandidates,
} from "../src/guwendao-poem-candidates";

interface SourcePoem {
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

interface SourceDocument {
  recordCount: number;
  errors: string[];
  poems: SourcePoem[];
}

function sourceDocument(): SourceDocument {
  const poems = Array.from({ length: 320 }, (_, index) => {
    const sourceId = index.toString(16).padStart(12, "0");
    const lines = ["第一句。", "第二句。"];
    return {
      sourceId,
      category: "五言绝句",
      indexTitle: `测试诗 ${index}`,
      title: `测试诗 ${index}`,
      author: "测试作者",
      dynasty: "唐代",
      text: lines.join("\n"),
      lines,
      sourceUrl: `https://www.guwendao.net/shiwenv_${sourceId}.aspx`,
    };
  });
  return { recordCount: poems.length, errors: [], poems };
}

describe("buildGuwendaoPoemCandidates", () => {
  it("converts all 320 source poems to auditable draft candidates", () => {
    const candidates = buildGuwendaoPoemCandidates(sourceDocument());

    expect(candidates).toHaveLength(320);
    expect(candidates[0]).toEqual({
      importKey: "GUWENDAO_TANG:000000000000",
      source: "GUWENDAO_TANG",
      sourceRef: "https://www.guwendao.net/shiwenv_000000000000.aspx",
      sourceHash:
        "738ce6d27d541bd79521682b7da7b3a3d0916b15f1e2f3dd18200e6c5f458ccf",
      ruleVersion: "guwendao-tang-poem-v1",
      id: "sc-gwd-000000000000",
      type: "POEM",
      suggestedLevel: 5,
      suggestedDifficulty: 5,
      promotionRequired: true,
      tags: ["唐诗", "古文岛", "五言绝句"],
      payload: {
        title: "测试诗 0",
        author: "测试作者",
        lines: ["第一句。", "第二句。"],
        charRefs: [],
        source: {
          sourceId: "000000000000",
          dynasty: "唐代",
          category: "五言绝句",
          sourceUrl:
            "https://www.guwendao.net/shiwenv_000000000000.aspx",
        },
      },
      score: 100,
    });
    expect(new Set(candidates.map(({ id }) => id)).size).toBe(320);
  });

  it.each([
    [
      "recordCount",
      (document: SourceDocument) => {
        document.recordCount = 319;
      },
      "recordCount must be exactly 320",
    ],
    [
      "errors",
      (document: SourceDocument) => {
        document.errors = ["fetch failed"];
      },
      "errors must be empty",
    ],
    [
      "duplicate sourceId",
      (document: SourceDocument) => {
        document.poems[1]!.sourceId = "000000000000";
        document.poems[1]!.sourceUrl =
          "https://www.guwendao.net/shiwenv_000000000000.aspx";
      },
      "poems[1].sourceId must be unique",
    ],
    [
      "invalid source URL",
      (document: SourceDocument) => {
        document.poems[0]!.sourceUrl =
          "https://example.com/shiwenv_000000000000.aspx";
      },
      "poems[0].sourceUrl does not match sourceId",
    ],
    [
      "empty lines",
      (document: SourceDocument) => {
        document.poems[0]!.lines = [];
      },
      "poems[0].lines must be a non-empty array",
    ],
    [
      "text mismatch",
      (document: SourceDocument) => {
        document.poems[0]!.text = "不同文本";
      },
      "poems[0].text must equal lines joined with a newline",
    ],
  ])("rejects invalid source data: %s", (_name, mutate, expectedMessage) => {
    const document = sourceDocument();
    mutate(document);

    expect(() => buildGuwendaoPoemCandidates(document)).toThrow(
      expectedMessage,
    );
  });

  it("serializes and hashes the same source deterministically", () => {
    const first = buildGuwendaoPoemCandidates(sourceDocument());
    const second = buildGuwendaoPoemCandidates(sourceDocument());
    const firstOutput = serializeGuwendaoPoemCandidates(first);

    expect(serializeGuwendaoPoemCandidates(second)).toBe(firstOutput);
    expect(firstOutput.split("\n")).toHaveLength(321);
    expect(firstOutput.endsWith("\n")).toBe(true);
  });

  it("changes the source hash when an audited source field changes", () => {
    const original = sourceDocument();
    const changed = sourceDocument();
    changed.poems[0]!.indexTitle = "不同的索引标题";

    const originalHash = buildGuwendaoPoemCandidates(original)[0]!.sourceHash;
    const changedHash = buildGuwendaoPoemCandidates(changed)[0]!.sourceHash;

    expect(changedHash).not.toBe(originalHash);
  });

  it("hashes NFC and NFD source text identically", () => {
    const nfc = sourceDocument();
    const nfd = sourceDocument();
    nfc.poems[0]!.indexTitle = "\u00e9";
    nfd.poems[0]!.indexTitle = "e\u0301";

    const nfcHash = buildGuwendaoPoemCandidates(nfc)[0]!.sourceHash;
    const nfdHash = buildGuwendaoPoemCandidates(nfd)[0]!.sourceHash;

    expect(nfdHash).toBe(nfcHash);
  });

  it("accepts an empty string for indexTitle", () => {
    const document = sourceDocument();
    document.poems[0]!.indexTitle = "";

    expect(() => buildGuwendaoPoemCandidates(document)).not.toThrow();
  });

  it("rejects a non-string indexTitle", () => {
    const document = sourceDocument();
    document.poems[0]!.indexTitle = 42 as unknown as string;

    expect(() => buildGuwendaoPoemCandidates(document)).toThrow(
      "poems[0].indexTitle must be a string",
    );
  });

  it("rejects poems outside the Tang dynasty", () => {
    const document = sourceDocument();
    document.poems[0]!.dynasty = "宋代";

    expect(() => buildGuwendaoPoemCandidates(document)).toThrow(
      "poems[0].dynasty must be 唐代",
    );
  });

  it.each([
    ["Cc", "\u0000", "control or format characters"],
    ["Cf", "\u200b", "control or format characters"],
    ["lone surrogate", "\ud800", "lone surrogate"],
  ])("rejects %s characters in source fields", (_name, unsafe, message) => {
    const document = sourceDocument();
    document.poems[0]!.author = `测试${unsafe}作者`;

    expect(() => buildGuwendaoPoemCandidates(document)).toThrow(
      `poems[0].author must not contain ${message}`,
    );
  });
});
