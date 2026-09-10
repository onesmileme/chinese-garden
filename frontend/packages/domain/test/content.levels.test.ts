import { challengeCorpus } from "@cc/content";
import { describe, expect, it } from "vitest";
import { corpusAtOrBelow } from "../src/content/levels";

describe("corpusAtOrBelow", () => {
  it("keeps only active content up to the requested ability level", () => {
    const result = corpusAtOrBelow(challengeCorpus, 2);

    expect(
      [...result.characters, ...result.poems, ...result.idioms].every(
        (item) => item.status === "ACTIVE" && item.level <= 2,
      ),
    ).toBe(true);
    expect(result.characters.length).toBeGreaterThan(0);
    expect(result.characters.length).toBeLessThan(
      challengeCorpus.characters.length,
    );
  });
});
