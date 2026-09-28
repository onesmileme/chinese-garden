import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface GuwendaoPoemCandidate {
  importKey: string;
  source: string;
  sourceHash: string;
  ruleVersion: string;
  id: string;
  type: string;
  suggestedLevel: number;
  suggestedDifficulty: number;
  promotionRequired: boolean;
}

const candidatePath = new URL(
  "../candidates/poems-guwendao-tang-320.ndjson",
  import.meta.url,
);

describe("Guwendao Tang poem candidate snapshot", () => {
  it("contains 320 unique draft poem candidates with stable boundaries", () => {
    const raw = readFileSync(candidatePath, "utf8");

    expect(raw.endsWith("\n")).toBe(true);
    expect(raw.endsWith("\n\n")).toBe(false);

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
    expect(candidates[0]?.id).toBe("sc-gwd-45c396367f59");
    expect(candidates[319]?.id).toBe("sc-gwd-cdc327abcbc1");
  });
});
