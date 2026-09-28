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
      "eb01d3ec8cccb704d70a6616f167fddf7f94f6f71ca8fb776f5eb7bf028dcca1",
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
        ({ ruleVersion }) => ruleVersion === "guwendao-tang-poem-v1",
      ),
    ).toBe(true);
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
