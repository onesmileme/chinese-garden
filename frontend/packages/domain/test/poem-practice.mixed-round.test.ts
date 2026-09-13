import type {
  ContentLevel,
  ContentMetadata,
  Poem,
} from "@cc/content-schema";
import { asKnowledgePointId } from "@cc/content-schema";
import { describe, expect, it } from "vitest";
import {
  createMixedPoemRound,
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
    charRefs: [],
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
    poem("sc-dengguanque", "登鹳雀楼", [
      "白日依山尽",
      "黄河入海流",
      "欲穷千里目",
      "更上一层楼",
    ], 4),
  ],
  idioms: [],
};

describe("createMixedPoemRound", () => {
  it("deterministically alternates fill and match questions", () => {
    const first = createMixedPoemRound(corpus, "round-1");
    const again = createMixedPoemRound(corpus, "round-1");

    expect(first).toEqual(again);
    expect(first).toHaveLength(POEM_ROUND_SIZE);
    expect(first.map((question) => question.questionType)).toEqual([
      "POEM_FILL",
      "POEM_MATCH_NEXT",
      "POEM_FILL",
      "POEM_MATCH_NEXT",
      "POEM_FILL",
      "POEM_MATCH_NEXT",
      "POEM_FILL",
      "POEM_MATCH_NEXT",
      "POEM_FILL",
      "POEM_MATCH_NEXT",
    ]);
  });

  it("emits five of each question type with unique per-question seeds", () => {
    const questions = createMixedPoemRound(corpus, "round-seeds");
    const fill = questions.filter((q) => q.questionType === "POEM_FILL");
    const match = questions.filter(
      (q) => q.questionType === "POEM_MATCH_NEXT",
    );

    expect(fill).toHaveLength(5);
    expect(match).toHaveLength(5);
    expect(new Set(questions.map((q) => q.seed)).size).toBe(POEM_ROUND_SIZE);
    expect(
      match.every(
        (question) =>
          question.options.length === 4 &&
          question.options.includes(question.correctAnswer),
      ),
    ).toBe(true);
  });

  it("restricts a round to poems unlocked at the ability level", () => {
    const unlockedIds = new Set(
      corpus.poems
        .filter((candidate) => candidate.level <= 2)
        .map((candidate) => candidate.id),
    );

    const questions = createMixedPoemRound(corpus, "round-level", 2);

    expect(questions).toHaveLength(POEM_ROUND_SIZE);
    expect(
      questions.every((question) =>
        unlockedIds.has(question.knowledgePointId),
      ),
    ).toBe(true);
  });

  it("rejects a corpus without fillable poems", () => {
    expect(() =>
      createMixedPoemRound({ ...corpus, poems: [] }, "round-empty"),
    ).toThrow("no poems for poem practice");
  });

  it("rejects a corpus without matchable poems", () => {
    const singleLine = poem(
      "sc-oneline",
      "独句",
      ["床前明月光疑是地上霜举头望明月低头思故乡"],
      1,
    );

    expect(() =>
      createMixedPoemRound({ ...corpus, poems: [singleLine] }, "round-nomatch"),
    ).toThrow("no poems for poem-match practice");
  });
});
