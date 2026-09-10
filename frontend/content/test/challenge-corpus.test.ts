import { describe, expect, it } from "vitest";
import {
  challengeContent,
  challengeContentVersion,
  challengeCorpus,
} from "../src";

describe("challengeCorpus", () => {
  it("binds the production corpus to its content version", () => {
    expect(challengeContent).toEqual({
      corpus: challengeCorpus,
      contentVersion: challengeContentVersion,
    });
    expect(challengeContent.corpus).toBe(challengeCorpus);
  });

  it("exports only active schema-validated corpus-v5 content", () => {
    expect(challengeContentVersion).toBe("corpus-v5");
    expect(challengeCorpus.characters).toHaveLength(122);
    expect(challengeCorpus.poems).toHaveLength(23);
    expect(challengeCorpus.idioms).toHaveLength(47);
    expect(
      [
        ...challengeCorpus.characters,
        ...challengeCorpus.poems,
        ...challengeCorpus.idioms,
      ].every((entry) => entry.status === "ACTIVE"),
    ).toBe(true);
  });

  it("contains the hard content required by parent challenges", () => {
    expect(
      challengeCorpus.characters.filter((entry) => entry.difficulty === 4),
    ).toHaveLength(12);
    expect(
      challengeCorpus.characters.filter((entry) => entry.difficulty === 5),
    ).toHaveLength(12);
    expect(
      challengeCorpus.poems.filter(
        (entry) => entry.difficulty === 4 || entry.difficulty === 5,
      ),
    ).toHaveLength(10);
  });
});
