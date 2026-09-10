import type {
  ContentLevel,
  ContentMetadata,
  Poem,
} from "@cc/content-schema";
import { asKnowledgePointId } from "@cc/content-schema";
import { describe, expect, it } from "vitest";
import {
  createPoemPracticeRound,
  POEM_ROUND_SIZE,
  type Corpus,
} from "../src";

function withActiveMetadata<T extends { difficulty: ContentLevel }>(
  item: T,
): T & ContentMetadata {
  return {
    ...item,
    level: item.difficulty,
    promotionRequired: true,
    status: "ACTIVE",
    tags: [],
    revision: 1,
  };
}

function poem(
  id: string,
  title: string,
  lines: string[],
  difficulty: ContentLevel,
): Poem {
  return withActiveMetadata({
    id: asKnowledgePointId(id),
    title,
    author: "佚名",
    lines,
    charRefs: [asKnowledgePointId("hz-ma-妈")],
    difficulty,
  });
}

const corpus: Corpus = {
  characters: [],
  poems: [
    poem("sc-jingyesi", "静夜思", [
      "床前明月光",
      "疑是地上霜",
      "举头望明月",
      "低头思故乡",
    ], 2),
    poem("sc-yonge", "咏鹅", [
      "鹅鹅鹅",
      "曲项向天歌",
      "白毛浮绿水",
      "红掌拨清波",
    ], 1),
  ],
  idioms: [],
};

describe("createPoemPracticeRound", () => {
  it("deterministically creates ten POEM_FILL questions", () => {
    const first = createPoemPracticeRound(corpus, "round-1");
    const again = createPoemPracticeRound(corpus, "round-1");

    expect(first).toEqual(again);
    expect(first).toHaveLength(POEM_ROUND_SIZE);
    expect(
      first.every((question) => question.questionType === "POEM_FILL"),
    ).toBe(true);
    expect(
      first.every((question) => (question.blanks?.length ?? 0) > 0),
    ).toBe(true);
  });

  it("varies blanks across positions for the same poem", () => {
    const questions = createPoemPracticeRound(corpus, "round-2");
    const jingyesi = questions.filter(
      (question) =>
        question.knowledgePointId === asKnowledgePointId("sc-jingyesi"),
    );
    const serialized = new Set(
      jingyesi.map((question) => question.correctAnswer),
    );

    expect(jingyesi.length).toBeGreaterThan(1);
    expect(serialized.size).toBeGreaterThan(1);
  });

  it("rejects a corpus without playable poems", () => {
    expect(() =>
      createPoemPracticeRound({ ...corpus, poems: [] }, "round-empty"),
    ).toThrow("no poems for poem practice");
  });

  it("skips poems that are too short to fill", () => {
    const shortPoem = poem("sc-short", "短", ["天"], 1);
    const questions = createPoemPracticeRound(
      { ...corpus, poems: [shortPoem, ...corpus.poems] },
      "round-short",
    );

    expect(questions).toHaveLength(POEM_ROUND_SIZE);
    expect(
      questions.some(
        (question) =>
          question.knowledgePointId === asKnowledgePointId("sc-short"),
      ),
    ).toBe(false);
  });

  it("skips poems without enough unique candidate glyphs", () => {
    const repeatedPoem = poem("sc-repeat", "叠字", ["山山山山"], 1);
    const questions = createPoemPracticeRound(
      { ...corpus, poems: [repeatedPoem, ...corpus.poems] },
      "round-repeat",
    );

    expect(questions).toHaveLength(POEM_ROUND_SIZE);
    expect(
      questions.some(
        (question) =>
          question.knowledgePointId === asKnowledgePointId("sc-repeat"),
      ),
    ).toBe(false);
  });
});
