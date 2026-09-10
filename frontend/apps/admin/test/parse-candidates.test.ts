import { describe, expect, it } from "vitest";
import { parseCandidateNdjson } from "../src/import/parse-candidates";

const validCandidate = {
  importKey: "raw-corpus-v1:character:月",
  source: "XINHUA_WORD",
  sourceRef: "月",
  sourceHash: "hash-yue",
  ruleVersion: "raw-corpus-v1",
  id: "hz-yue-月",
  type: "CHARACTER",
  suggestedLevel: 1,
  suggestedDifficulty: 1,
  promotionRequired: true,
  tags: ["自然"],
  payload: {
    char: "月",
    pinyin: "yuè",
    imageId: "img-moon",
    theme: "自然",
    strokes: 4,
  },
  score: 95,
};

describe("parseCandidateNdjson", () => {
  it("reports the source line for invalid JSON", () => {
    expect(() => parseCandidateNdjson('{"id":')).toThrow(
      "第 1 行不是有效 JSON",
    );
  });

  it("removes a BOM, skips empty lines and preserves Unicode payloads", () => {
    const source = `\uFEFF${JSON.stringify(validCandidate)}\r\n \r\n`;

    expect(parseCandidateNdjson(source)).toEqual({
      candidates: [validCandidate],
      ruleVersion: "raw-corpus-v1",
    });
  });

  it("rejects non-object rows using the original source line number", () => {
    expect(() => parseCandidateNdjson("\n[]")).toThrow(
      "第 2 行必须是 JSON 对象",
    );
  });

  it.each([
    ["importKey", ""],
    ["source", null],
    ["sourceRef", 1],
    ["sourceHash", false],
    ["ruleVersion", ""],
    ["id", null],
    ["suggestedLevel", 0],
    ["suggestedDifficulty", 6],
    ["tags", ["valid", 1]],
    ["payload", []],
    ["score", "95"],
    ["promotionRequired", "yes"],
  ])("rejects an API-incompatible %s field", (field, value) => {
    const source = JSON.stringify({
      ...validCandidate,
      [field]: value,
    });

    expect(() => parseCandidateNdjson(source)).toThrow(
      `第 1 行字段 ${field} 无效`,
    );
  });

  it("normalizes the CLI candidate to the exact backend DTO", () => {
    const { promotionRequired: _omitted, ...cliCandidate } =
      validCandidate;
    const source = JSON.stringify({
      ...cliCandidate,
      ignoredByBackend: true,
    });

    expect(parseCandidateNdjson(source).candidates[0]).toEqual({
      ...cliCandidate,
      promotionRequired: false,
    });
  });

  it("rejects content types outside the backend enum", () => {
    const source = JSON.stringify({
      ...validCandidate,
      type: "LESSON",
    });

    expect(() => parseCandidateNdjson(source)).toThrow(
      "第 1 行字段 type 无效",
    );
  });

  it("rejects mixed rule versions at the differing line", () => {
    const source = [
      JSON.stringify(validCandidate),
      JSON.stringify({
        ...validCandidate,
        importKey: "raw-corpus-v2:character:日",
        id: "hz-ri-日",
        ruleVersion: "raw-corpus-v2",
      }),
    ].join("\n");

    expect(() => parseCandidateNdjson(source)).toThrow(
      "第 2 行的 ruleVersion 与第 1 条候选不一致",
    );
  });

  it("rejects files without candidates", () => {
    expect(() => parseCandidateNdjson("\uFEFF\n \r\n")).toThrow(
      "文件中没有候选内容",
    );
  });
});
