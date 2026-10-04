import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface GuwendaoPoemCandidate {
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
    title: string;
    author: string;
    lines: string[];
    charRefs: string[];
    source: {
      sourceId: string;
      dynasty: string;
      category: string;
      sourceUrl: string;
    };
  };
  score: number;
}

const candidatePath = new URL(
  "../candidates/poems-guwendao-tang-320.ndjson",
  import.meta.url,
);

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

describe("Guwendao Tang poem candidate snapshot", () => {
  it("contains 320 unique draft poem candidates with stable boundaries", () => {
    const raw = readFileSync(candidatePath, "utf8");

    expect(raw.endsWith("\n")).toBe(true);
    expect(raw.endsWith("\n\n")).toBe(false);
    expect(sha256(raw)).toBe(
      "b21cf8a247955766db62b7eabe076e4e884ba2b4b7c40645af66583d609d3def",
    );

    const candidates = raw
      .slice(0, -1)
      .split("\n")
      .map((line) => JSON.parse(line) as GuwendaoPoemCandidate);

    expect(candidates).toHaveLength(320);
    expect(new Set(candidates.map(({ id }) => id)).size).toBe(320);
    expect(new Set(candidates.map(({ importKey }) => importKey)).size).toBe(
      320,
    );
    expect(candidates.every(({ source }) => source === "GUWENDAO_TANG")).toBe(
      true,
    );
    expect(
      candidates.every(
        ({ ruleVersion }) => ruleVersion === "guwendao-tang-poem-v2",
      ),
    ).toBe(true);
    const displayKeys = candidates.map(
      ({ payload }) => `${payload.author}\u0000${payload.title}`,
    );
    expect(new Set(displayKeys).size).toBe(320);

    const titlesById = Object.fromEntries(
      candidates.map(({ id, payload }) => [id, payload.title]),
    );
    expect(titlesById).toMatchObject({
      "sc-gwd-2d27cb0ecae4": "无题二首·其一（凤尾香罗薄几重）",
      "sc-gwd-05c6c4ccf634": "无题二首·其一（昨夜星辰昨夜风）",
      "sc-gwd-0c472e85a3ad": "隋宫（乘兴南游不戒严）",
      "sc-gwd-09fd71c77ec7": "隋宫（紫泉宫殿锁烟霞）",
    });
    expect(candidates.every(({ type }) => type === "POEM")).toBe(true);
    expect(
      candidates.every(({ suggestedLevel }) => suggestedLevel === 5),
    ).toBe(true);
    expect(
      candidates.every(
        ({ suggestedDifficulty }) => suggestedDifficulty === 5,
      ),
    ).toBe(true);
    expect(
      candidates.every(({ promotionRequired }) => promotionRequired),
    ).toBe(true);
    expect(
      candidates.every(({ sourceHash }) =>
        /^[0-9a-f]{64}$/.test(sourceHash),
      ),
    ).toBe(true);

    for (const candidate of candidates) {
      expect(Object.keys(candidate).sort()).toEqual([
        "id",
        "importKey",
        "payload",
        "promotionRequired",
        "ruleVersion",
        "score",
        "source",
        "sourceHash",
        "sourceRef",
        "suggestedDifficulty",
        "suggestedLevel",
        "tags",
        "type",
      ]);
      expect(Object.keys(candidate.payload).sort()).toEqual([
        "author",
        "charRefs",
        "lines",
        "source",
        "title",
      ]);
      expect(Object.keys(candidate.payload.source).sort()).toEqual([
        "category",
        "dynasty",
        "sourceId",
        "sourceUrl",
      ]);

      const { sourceId, sourceUrl } = candidate.payload.source;
      const expectedSourceUrl =
        `https://www.guwendao.net/shiwenv_${sourceId}.aspx`;

      expect(sourceId).toMatch(/^[0-9a-f]{12}$/);
      expect(candidate.id).toBe(`sc-gwd-${sourceId}`);
      expect(candidate.importKey).toBe(`GUWENDAO_TANG:${sourceId}`);
      expect(candidate.sourceRef).toBe(expectedSourceUrl);
      expect(sourceUrl).toBe(expectedSourceUrl);
    }

    expect(candidates[0]?.id).toBe("sc-gwd-45c396367f59");
    expect(candidates[319]?.id).toBe("sc-gwd-cdc327abcbc1");
  });
});
