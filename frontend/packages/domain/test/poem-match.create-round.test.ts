import type {
  ContentLevel,
  ContentMetadata,
  Poem,
} from "@cc/content-schema";
import { asKnowledgePointId } from "@cc/content-schema";
import { describe, expect, it } from "vitest";
import {
  createPoemMatchRound,
  POEM_MATCH_ROUND_SIZE,
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

describe("createPoemMatchRound", () => {
  it("deterministically creates ten POEM_MATCH_NEXT questions", () => {
    const first = createPoemMatchRound(corpus, "round-1");
    const again = createPoemMatchRound(corpus, "round-1");

    expect(first).toEqual(again);
    expect(first).toHaveLength(POEM_MATCH_ROUND_SIZE);
    expect(
      first.every(
        (question) =>
          question.questionType === "POEM_MATCH_NEXT" &&
          question.options.length === 4,
      ),
    ).toBe(true);
  });

  it("restricts a round to poems unlocked at the ability level", () => {
    const unlockedIds = new Set(
      corpus.poems
        .filter((candidate) => candidate.level <= 2)
        .map((candidate) => candidate.id),
    );

    const questions = createPoemMatchRound(corpus, "round-2", 2);

    expect(questions).toHaveLength(POEM_MATCH_ROUND_SIZE);
    expect(
      questions.every((question) =>
        unlockedIds.has(question.knowledgePointId),
      ),
    ).toBe(true);
  });

  it("skips poems with too few lines to match", () => {
    const singleLine = poem("sc-short", "单句", ["天地一沙鸥"], 1);
    const questions = createPoemMatchRound(
      { ...corpus, poems: [singleLine, ...corpus.poems] },
      "round-short",
    );

    expect(questions).toHaveLength(POEM_MATCH_ROUND_SIZE);
    expect(
      questions.some(
        (question) =>
          question.knowledgePointId === asKnowledgePointId("sc-short"),
      ),
    ).toBe(false);
  });

  it("rejects a corpus without matchable poems", () => {
    expect(() =>
      createPoemMatchRound({ ...corpus, poems: [] }, "round-empty"),
    ).toThrow("no poems for poem-match practice");
  });
});
