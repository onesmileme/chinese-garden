import { asKnowledgePointId } from "@cc/content-schema";
import type { Corpus } from "@cc/domain";
import { describe, expect, it } from "vitest";
import {
  assessmentKnowledgePointIds,
  describeKnowledgePoint,
  knowledgePointDifficulty,
  knowledgePointTitle,
} from "../src/content/runtime-corpus";

const metadata = {
  promotionRequired: true,
  status: "ACTIVE" as const,
  tags: [],
  revision: 1,
};
const corpus: Corpus = {
  poems: [
    {
      ...metadata,
      id: asKnowledgePointId("sc-level-1"),
      title: "一级诗",
      author: "作者甲",
      lines: ["春眠不觉晓", "处处闻啼鸟"],
      difficulty: 1,
      level: 1,
    },
    {
      ...metadata,
      id: asKnowledgePointId("sc-level-3"),
      title: "三级诗",
      author: "作者乙",
      lines: ["天地玄黄", "宇宙洪荒"],
      difficulty: 3,
      level: 3,
    },
  ],
  idioms: [
    {
      ...metadata,
      id: asKnowledgePointId("cy-level-1"),
      text: "一心一意",
      meaning: "形容做事专心",
      headPinyin: "yi",
      tailPinyin: "yi",
      difficulty: 1,
      level: 1,
    },
    {
      ...metadata,
      id: asKnowledgePointId("cy-level-2"),
      text: "心心相印",
      meaning: "彼此心意相通",
      headPinyin: "xin",
      tailPinyin: "yin",
      difficulty: 2,
      level: 2,
    },
  ],
};

describe("runtime corpus lookup", () => {
  it("describes poem and idiom knowledge points", () => {
    expect(
      describeKnowledgePoint(corpus, asKnowledgePointId("sc-level-1")),
    ).toEqual({ kind: "POEM" });
    expect(knowledgePointTitle(corpus, asKnowledgePointId("sc-level-1"))).toBe(
      "一级诗",
    );
    expect(
      describeKnowledgePoint(corpus, asKnowledgePointId("cy-level-1")),
    ).toEqual({ kind: "IDIOM" });
    expect(
      knowledgePointTitle(corpus, asKnowledgePointId("cy-level-1")),
    ).toBe("一心一意");
    expect(
      knowledgePointDifficulty(corpus, asKnowledgePointId("cy-level-2")),
    ).toBe(2);
  });

  it("rejects missing knowledge points", () => {
    expect(() =>
      describeKnowledgePoint(corpus, asKnowledgePointId("missing")),
    ).toThrow("knowledge point not found");
    expect(() =>
      knowledgePointDifficulty(corpus, asKnowledgePointId("missing")),
    ).toThrow("knowledge point not found");
    expect(() =>
      knowledgePointTitle(corpus, asKnowledgePointId("missing")),
    ).toThrow("knowledge point not found");
  });

  it("selects one deterministic assessment point for every unlocked level", () => {
    const ids = assessmentKnowledgePointIds(corpus, 3);

    expect(ids).toEqual([
      asKnowledgePointId("cy-level-1"),
      asKnowledgePointId("cy-level-2"),
      asKnowledgePointId("sc-level-3"),
    ]);
    expect(assessmentKnowledgePointIds(corpus, 3)).toEqual(ids);
  });

  it("falls back to an unlocked point and rejects an empty corpus", () => {
    const sparse: Corpus = {
      poems: [corpus.poems[0]!],
      idioms: [],
    };

    expect(assessmentKnowledgePointIds(sparse, 2)).toEqual([
      asKnowledgePointId("sc-level-1"),
      asKnowledgePointId("sc-level-1"),
    ]);
    expect(() =>
      assessmentKnowledgePointIds({ poems: [], idioms: [] }, 1),
    ).toThrow("no unlocked content for assessment");
  });
});
