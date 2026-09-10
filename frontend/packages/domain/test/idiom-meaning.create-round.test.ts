import type {
  ContentLevel,
  ContentMetadata,
  Idiom,
} from "@cc/content-schema";
import { asKnowledgePointId } from "@cc/content-schema";
import { describe, expect, it } from "vitest";
import {
  createIdiomMeaningRound,
  IDIOM_MEANING_ROUND_SIZE,
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
    idiom("cy-yixinyiyi", "一心一意", "yi", "yi", 2),
    idiom("cy-wanzhongyixin", "万众一心", "wan", "xin", 2),
    idiom("cy-xinxiangshicheng", "心想事成", "xin", "cheng", 1),
    idiom("cy-yiqifengfa", "意气风发", "yi", "fa", 3),
    idiom("cy-fayangguangda", "发扬光大", "fa", "da", 4),
    idiom("cy-dagonggaocheng", "大功告成", "da", "cheng", 3),
    idiom("cy-chengqianshangwan", "成千上万", "cheng", "wan", 5),
  ],
};

describe("createIdiomMeaningRound", () => {
  it("deterministically creates ten IDIOM_MEANING questions", () => {
    const first = createIdiomMeaningRound(corpus, "round-1");
    const again = createIdiomMeaningRound(corpus, "round-1");

    expect(first).toEqual(again);
    expect(first).toHaveLength(IDIOM_MEANING_ROUND_SIZE);
    expect(
      first.every(
        (question) =>
          question.questionType === "IDIOM_MEANING" &&
          question.options.length === 4 &&
          question.options.includes(question.correctAnswer),
      ),
    ).toBe(true);
  });

  it("restricts a round to idioms unlocked at the ability level", () => {
    const unlockedIds = new Set(
      corpus.idioms
        .filter((candidate) => candidate.level <= 2)
        .map((candidate) => candidate.id),
    );

    const questions = createIdiomMeaningRound(corpus, "round-2", 2);

    expect(questions).toHaveLength(IDIOM_MEANING_ROUND_SIZE);
    expect(
      questions.every((question) =>
        unlockedIds.has(question.knowledgePointId),
      ),
    ).toBe(true);
  });

  it("rejects a corpus without enough idioms for distractors", () => {
    expect(() =>
      createIdiomMeaningRound(
        { ...corpus, idioms: corpus.idioms.slice(0, 3) },
        "round-empty",
      ),
    ).toThrow("not enough idioms for idiom-meaning practice");
  });
});
