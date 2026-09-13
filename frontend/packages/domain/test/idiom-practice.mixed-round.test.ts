import type {
  ContentLevel,
  ContentMetadata,
  Idiom,
} from "@cc/content-schema";
import { asKnowledgePointId } from "@cc/content-schema";
import { describe, expect, it } from "vitest";
import {
  createMixedIdiomRound,
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

// 闭合接龙组(每条都有后继),覆盖初级(≤2)与进阶(≥3),
// 且总量 ≥ 4,足以为释义题提供干扰项。
const corpus: Corpus = {
  characters: [],
  poems: [],
  idioms: [
    idiom("cy-yixinyiyi", "一心一意", "yi", "yi", 1),
    idiom("cy-yiqifengfa", "意气风发", "yi", "fa", 2),
    idiom("cy-fayangguangda", "发扬光大", "fa", "da", 1),
    idiom("cy-dagonggaocheng", "大功告成", "da", "cheng", 2),
    idiom("cy-chengqianshangwan", "成千上万", "cheng", "wan", 1),
    idiom("cy-wanzhongyixin", "万众一心", "wan", "xin", 2),
    idiom("cy-xinxiangshicheng", "心想事成", "xin", "cheng", 1),
    idiom("cy-chengqiankaihou", "承前启后", "cheng", "hou", 3),
    idiom("cy-houlaijushang", "后来居上", "hou", "shang", 3),
    idiom("cy-shanghangxiaxiao", "上行下效", "shang", "xiao", 4),
    idiom("cy-xiaofachengqian", "效法承前", "xiao", "cheng", 5),
  ],
};

describe("createMixedIdiomRound", () => {
  it("deterministically alternates chain and meaning questions", () => {
    const first = createMixedIdiomRound(corpus, "BEGINNER", "round-1");
    const again = createMixedIdiomRound(corpus, "BEGINNER", "round-1");

    expect(first).toEqual(again);
    expect(first).toHaveLength(IDIOM_ROUND_SIZE);
    expect(first.map((question) => question.questionType)).toEqual([
      "IDIOM_CHAIN",
      "IDIOM_MEANING",
      "IDIOM_CHAIN",
      "IDIOM_MEANING",
      "IDIOM_CHAIN",
      "IDIOM_MEANING",
      "IDIOM_CHAIN",
      "IDIOM_MEANING",
      "IDIOM_CHAIN",
      "IDIOM_MEANING",
    ]);
  });

  it("draws chain questions from the requested difficulty band", () => {
    const beginnerIds = new Set(
      corpus.idioms
        .filter((candidate) => candidate.difficulty <= 2)
        .map((candidate) => candidate.id),
    );

    const chain = createMixedIdiomRound(corpus, "BEGINNER", "round-band")
      .filter((question) => question.questionType === "IDIOM_CHAIN");

    expect(chain).toHaveLength(5);
    expect(
      chain.every((question) => beginnerIds.has(question.knowledgePointId)),
    ).toBe(true);
  });

  it("uses advanced idioms for the chain half of an advanced round", () => {
    const advancedIds = new Set(
      corpus.idioms
        .filter((candidate) => candidate.difficulty >= 3)
        .map((candidate) => candidate.id),
    );

    const chain = createMixedIdiomRound(corpus, "ADVANCED", "round-adv")
      .filter((question) => question.questionType === "IDIOM_CHAIN");

    expect(chain).toHaveLength(5);
    expect(
      chain.every((question) => advancedIds.has(question.knowledgePointId)),
    ).toBe(true);
  });

  it("rejects a level with no playable idioms for the chain half", () => {
    expect(() =>
      createMixedIdiomRound({ ...corpus, idioms: [] }, "BEGINNER", "round-empty"),
    ).toThrow("no idioms for level: BEGINNER");
  });

  it("rejects a corpus without enough idioms for meaning distractors", () => {
    const tooFew = corpus.idioms.filter(
      (candidate) => candidate.difficulty <= 2,
    ).slice(0, 3);

    expect(() =>
      createMixedIdiomRound(
        { ...corpus, idioms: tooFew },
        "BEGINNER",
        "round-thin",
      ),
    ).toThrow("not enough idioms for idiom-meaning practice");
  });
});
