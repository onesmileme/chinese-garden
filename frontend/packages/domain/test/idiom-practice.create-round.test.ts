import type {
  ContentLevel,
  ContentMetadata,
  Idiom,
} from "@cc/content-schema";
import { asKnowledgePointId } from "@cc/content-schema";
import { describe, expect, it } from "vitest";
import {
  createIdiomPracticeRound,
  IDIOM_ROUND_SIZE,
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

function idiom(
  id: string,
  text: string,
  headPinyin: string,
  tailPinyin: string,
  difficulty: Idiom["difficulty"],
): Idiom {
  return withActiveMetadata({
    id: asKnowledgePointId(id),
    text,
    meaning: `${text}的释义`,
    headPinyin,
    tailPinyin,
    difficulty,
  });
}

const corpus: Corpus = {
  characters: [],
  poems: [],
  idioms: [
    idiom("cy-madaochenggong", "马到成功", "ma", "gong", 1),
    idiom("cy-gongshigongban", "公事公办", "gong", "ban", 2),
    idiom("cy-banxinbanyi", "半信半疑", "ban", "yi", 3),
    idiom("cy-yixinyiyi", "一心一意", "yi", "yi", 4),
    idiom("cy-yiqifengfa", "意气风发", "yi", "fa", 3),
    idiom("cy-fayangguangda", "发扬光大", "fa", "da", 2),
    idiom("cy-dagonggaocheng", "大功告成", "da", "cheng", 3),
    idiom("cy-chengqianshangwan", "成千上万", "cheng", "wan", 1),
    idiom("cy-wanzhongyixin", "万众一心", "wan", "xin", 4),
    idiom("cy-xinxiangshicheng", "心想事成", "xin", "cheng", 1),
  ],
};

describe("createIdiomPracticeRound", () => {
  it("deterministically creates ten beginner questions", () => {
    const beginnerIds = new Set(
      corpus.idioms
        .filter((candidate) => candidate.difficulty <= 2)
        .map((candidate) => candidate.id),
    );
    const first = createIdiomPracticeRound(corpus, "BEGINNER", "round-1");
    const again = createIdiomPracticeRound(corpus, "BEGINNER", "round-1");

    expect(first).toEqual(again);
    expect(first).toHaveLength(IDIOM_ROUND_SIZE);
    expect(
      first.every(
        (question) =>
          beginnerIds.has(question.knowledgePointId) &&
          question.options.length === 8,
      ),
    ).toBe(true);
    expect(first.slice(5).map((question) => question.knowledgePointId)).toEqual(
      first.slice(0, 5).map((question) => question.knowledgePointId),
    );
  });

  it("uses only advanced idioms for an advanced round", () => {
    const advancedIds = new Set(
      corpus.idioms
        .filter((candidate) => candidate.difficulty >= 3)
        .map((candidate) => candidate.id),
    );

    const questions = createIdiomPracticeRound(
      corpus,
      "ADVANCED",
      "round-2",
    );

    expect(questions).toHaveLength(10);
    expect(
      questions.every(
        (question) =>
          advancedIds.has(question.knowledgePointId) &&
          question.options.length === 12,
      ),
    ).toBe(true);
  });

  it("skips level-matching idioms that have no successor", () => {
    const unusable = idiom(
      "cy-wuhouji",
      "无后可继",
      "wu",
      "none",
      1,
    );

    const questions = createIdiomPracticeRound(
      { ...corpus, idioms: [unusable, ...corpus.idioms] },
      "BEGINNER",
      "round-with-unusable-source",
    );

    expect(questions).toHaveLength(IDIOM_ROUND_SIZE);
    expect(
      questions.some(
        (question) => question.knowledgePointId === unusable.id,
      ),
    ).toBe(false);
  });

  it("rejects an empty eligible pool", () => {
    expect(() =>
      createIdiomPracticeRound(
        { ...corpus, idioms: [] },
        "BEGINNER",
        "round-empty",
      ),
    ).toThrow("no idioms for level: BEGINNER");
  });
});
