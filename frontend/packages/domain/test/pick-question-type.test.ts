import { describe, it, expect } from "vitest";
import { pickQuestionType } from "../src/questions/pick-question-type";

describe("pickQuestionType", () => {
  it("CHALLENGE role always yields POEM_FILL", () => {
    expect(
      pickQuestionType({ role: "CHALLENGE", kind: "POEM", seed: "s" }),
    ).toBe("POEM_FILL");
  });
  it("POEM kind yields a poem-family question type", () => {
    const t = pickQuestionType({ role: "PRACTICE", kind: "POEM", seed: "s2" });
    expect(["POEM_FILL", "POEM_MATCH_NEXT"]).toContain(t);
  });
  it("IDIOM kind yields an idiom-family question type", () => {
    const t = pickQuestionType({ role: "PRACTICE", kind: "IDIOM", seed: "s1" });
    expect(["IDIOM_CHAIN", "IDIOM_MEANING"]).toContain(t);
  });
  it("is deterministic for the same input", () => {
    const a = pickQuestionType({
      role: "PRACTICE",
      kind: "IDIOM",
      seed: "same",
    });
    const b = pickQuestionType({
      role: "PRACTICE",
      kind: "IDIOM",
      seed: "same",
    });
    expect(a).toBe(b);
  });
  it("varies across seeds within a family (covers modulo branch)", () => {
    const types = new Set(
      ["a", "b", "c", "d", "e", "f", "g", "h"].map((s) =>
        pickQuestionType({ role: "PRACTICE", kind: "IDIOM", seed: s }),
      ),
    );
    expect(types.size).toBeGreaterThan(1);
  });
});
