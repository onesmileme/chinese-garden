import {
  asKnowledgePointId,
  type ContentLevel,
  type ContentMetadata,
} from "@cc/content-schema";
import type { Corpus, DailyPlan } from "@cc/domain";
import { describe, expect, it } from "vitest";
import {
  materializeAssessmentQuestions,
  materializeDailyQuestions,
  type DailySession,
} from "../src";

const idiomKpId = asKnowledgePointId("cy-yixinyiyi");
const poemKpId = asKnowledgePointId("sc-jingyesi");

const withActiveMetadata = <T extends { difficulty: ContentLevel }>(
  items: T[],
): Array<T & ContentMetadata> =>
  items.map((item) => ({
    ...item,
    level: item.difficulty,
    promotionRequired: true,
    status: "ACTIVE",
    tags: [],
    revision: 1,
  }));

const corpus: Corpus = {
  poems: withActiveMetadata([
    {
      id: poemKpId,
      title: "静夜思",
      author: "李白",
      lines: ["床前明月光", "疑是地上霜", "举头望明月", "低头思故乡"],
      difficulty: 1,
    },
  ]),
  // 闭合成语链：head/tail 拼音互相衔接，保证 IDIOM_CHAIN 有后继、
  // IDIOM_MEANING 有足够干扰项。
  idioms: withActiveMetadata([
    {
      id: idiomKpId,
      text: "一心一意",
      meaning: "形容做事专心",
      headPinyin: "yi",
      tailPinyin: "yi",
      difficulty: 1,
    },
    {
      id: asKnowledgePointId("cy-sanxineryi"),
      text: "三心二意",
      meaning: "形容犹豫不决",
      headPinyin: "yi",
      tailPinyin: "yi",
      difficulty: 1,
    },
    {
      id: asKnowledgePointId("cy-xinkouruyi"),
      text: "心口如一",
      meaning: "形容表里一致",
      headPinyin: "yi",
      tailPinyin: "yi",
      difficulty: 1,
    },
    {
      id: asKnowledgePointId("cy-wanzhongyixin"),
      text: "万众一心",
      meaning: "形容团结一致",
      headPinyin: "yi",
      tailPinyin: "yi",
      difficulty: 1,
    },
  ]),
};

const levels: DailyPlan = [
  {
    name: "WAKEUP",
    slots: Array.from({ length: 5 }, () => ({
      role: "DUE_REVIEW",
      kpId: idiomKpId,
    })),
  },
  {
    name: "NEW",
    slots: Array.from({ length: 5 }, () => ({
      role: "PRACTICE",
      kpId: idiomKpId,
    })),
  },
  {
    name: "CONSOLIDATION",
    slots: [
      ...Array.from({ length: 4 }, () => ({
        role: "MIXED",
        kpId: idiomKpId,
      })),
      { role: "CHALLENGE", kpId: poemKpId },
    ],
  },
];

const session: DailySession = {
  sessionId: "session-1",
  levels,
  contentVersion: "content-v1",
  ruleVersion: "rule-v1",
};

describe("materializeDailyQuestions", () => {
  it("materializes all levels in order with stable slot seeds", () => {
    const steps = materializeDailyQuestions(session, corpus, (kpId) => ({
      kind: String(kpId).startsWith("sc-") ? "POEM" : "IDIOM",
    }));

    expect(steps).toHaveLength(15);
    expect(steps[0]).toMatchObject({
      levelIndex: 0,
      slotIndex: 0,
      role: "DUE_REVIEW",
      kpId: idiomKpId,
      question: { seed: "session-1:0:0" },
    });
    expect(steps[5]).toMatchObject({
      levelIndex: 1,
      slotIndex: 0,
      role: "PRACTICE",
      question: { seed: "session-1:1:0" },
    });
    expect(steps[14]).toMatchObject({
      levelIndex: 2,
      slotIndex: 4,
      role: "CHALLENGE",
      kpId: poemKpId,
      question: {
        seed: "session-1:2:4",
        questionType: "POEM_FILL",
      },
    });
  });
});

describe("materializeAssessmentQuestions", () => {
  it("materializes a fixed checkpoint and extra block with assessment seeds", () => {
    const questions = materializeAssessmentQuestions(
      idiomKpId,
      2,
      corpus,
      () => ({ kind: "IDIOM" }),
    );

    expect(questions).toHaveLength(7);
    expect(questions.map((question) => question.seed)).toEqual([
      "assess:cy-yixinyiyi:2:0",
      "assess:cy-yixinyiyi:2:1",
      "assess:cy-yixinyiyi:2:2",
      "assess:cy-yixinyiyi:2:3",
      "assess:cy-yixinyiyi:2:4",
      "assess:cy-yixinyiyi:2:5",
      "assess:cy-yixinyiyi:2:6",
    ]);
    expect(questions.map((question) => question.questionType)).toEqual([
      "IDIOM_MEANING",
      "IDIOM_CHAIN",
      "IDIOM_MEANING",
      "IDIOM_CHAIN",
      "IDIOM_MEANING",
      "IDIOM_CHAIN",
      "IDIOM_MEANING",
    ]);
  });
});
