import type {
  ContentLevel,
  ContentMetadata,
  Idiom,
} from "@cc/content-schema";
import { asKnowledgePointId } from "@cc/content-schema";
import { describe, expect, it } from "vitest";
import {
  canAssemble,
  findIdiomSuccessors,
} from "../src/questions/idiom-chain";
import {
  makeSeededRng,
  seededShuffle,
} from "../src/questions/deterministic-random";
import {
  generateQuestion,
  isCorrectAnswer,
  type Corpus,
} from "../src/questions/generate";
import * as domain from "../src";

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

const idioms: Idiom[] = withActiveMetadata([
  {
    id: asKnowledgePointId("cy-madaochenggong"),
    text: "马到成功",
    meaning: "事情顺利，很快取得成功",
    headPinyin: "ma",
    tailPinyin: "gong",
    difficulty: 1,
  },
  {
    id: asKnowledgePointId("cy-gongshigongban"),
    text: "公事公办",
    meaning: "按公事原则处理",
    headPinyin: "gong",
    tailPinyin: "ban",
    difficulty: 1,
  },
  {
    id: asKnowledgePointId("cy-gongchengmingjiu"),
    text: "功成名就",
    meaning: "功业建立，名声取得",
    headPinyin: "gong",
    tailPinyin: "jiu",
    difficulty: 2,
  },
  {
    id: asKnowledgePointId("cy-dafeisuowen"),
    text: "答非所问",
    meaning: "回答的不是所问的内容",
    headPinyin: "da",
    tailPinyin: "wen",
    difficulty: 2,
  },
]);

const beginnerCorpus: Corpus = {
  characters: [],
  poems: [],
  idioms,
};

describe("findIdiomSuccessors", () => {
  it("returns matching successors in corpus order", () => {
    expect(findIdiomSuccessors(idioms[0]!, idioms).map((idiom) => idiom.text))
      .toEqual(["公事公办", "功成名就"]);
  });
});

describe("canAssemble", () => {
  it("assembles an idiom when every character is available", () => {
    expect(canAssemble("人人平等", ["人", "平", "人", "等"])).toBe(true);
  });

  it("rejects an idiom when a repeated character is missing", () => {
    expect(canAssemble("人人平等", ["人", "平", "心", "等"])).toBe(false);
  });
});

describe("deterministic random helpers", () => {
  it("reproduces the existing seeded random sequence", () => {
    const rng = makeSeededRng("seed-1");

    expect([rng(), rng(), rng()]).toEqual([
      0.8126733123790473,
      0.5248212472070009,
      0.5631958588492125,
    ]);
  });

  it("reproduces the existing Fisher-Yates ordering", () => {
    expect(seededShuffle(["a", "b", "c", "d"], makeSeededRng("seed-1")))
      .toEqual(["a", "c", "b", "d"]);
  });
});

describe("IDIOM_CHAIN generation", () => {
  it("deterministically builds an eight-character beginner question", () => {
    const question = generateQuestion(
      "IDIOM_CHAIN",
      asKnowledgePointId("cy-madaochenggong"),
      beginnerCorpus,
      "seed-1",
    );

    expect(question.prompt).toBe("马到成功");
    expect(question.options).toHaveLength(8);
    expect(question.correctAnswer).toBe("公事公办");
    expect(question.acceptedAnswers).toContain("公事公办");
    expect(canAssemble(question.correctAnswer, question.options)).toBe(true);
    expect(
      generateQuestion(
        "IDIOM_CHAIN",
        asKnowledgePointId("cy-madaochenggong"),
        beginnerCorpus,
        "seed-1",
      ),
    ).toEqual(question);
  });

  it("builds twelve candidates for an advanced source", () => {
    const advancedCorpus: Corpus = {
      ...beginnerCorpus,
      idioms: [
        { ...idioms[0]!, level: 3, difficulty: 3 },
        ...idioms.slice(1),
      ],
    };

    expect(
      generateQuestion(
        "IDIOM_CHAIN",
        asKnowledgePointId("cy-madaochenggong"),
        advancedCorpus,
        "seed-1",
      ).options,
    ).toHaveLength(12);
  });

  it("accepts every successor constructible from the final candidates", () => {
    const question = generateQuestion(
      "IDIOM_CHAIN",
      asKnowledgePointId("cy-madaochenggong"),
      beginnerCorpus,
      "multi-243",
    );

    expect(question.acceptedAnswers).toEqual(["公事公办", "功成名就"]);
  });

  it("rejects an unknown idiom", () => {
    expect(() =>
      generateQuestion(
        "IDIOM_CHAIN",
        asKnowledgePointId("cy-unknown"),
        beginnerCorpus,
        "seed-1",
      ),
    ).toThrow("idiom not found: cy-unknown");
  });

  it("rejects a source without a successor", () => {
    expect(() =>
      generateQuestion(
        "IDIOM_CHAIN",
        asKnowledgePointId("cy-madaochenggong"),
        { ...beginnerCorpus, idioms: [idioms[0]!, idioms[3]!] },
        "seed-1",
      ),
    ).toThrow("no idiom successor: cy-madaochenggong");
  });

  it("rejects a corpus with insufficient filler characters", () => {
    const advancedSource = {
      ...idioms[0]!,
      level: 3 as const,
      difficulty: 3 as const,
    };

    expect(() =>
      generateQuestion(
        "IDIOM_CHAIN",
        asKnowledgePointId("cy-madaochenggong"),
        { ...beginnerCorpus, idioms: [advancedSource, idioms[1]!] },
        "seed-1",
      ),
    ).toThrow("insufficient idiom filler characters: cy-madaochenggong");
  });
});

describe("isCorrectAnswer", () => {
  it("accepts a non-canonical answer listed by the question", () => {
    const question = generateQuestion(
      "IDIOM_CHAIN",
      asKnowledgePointId("cy-madaochenggong"),
      beginnerCorpus,
      "multi-243",
    );

    expect(isCorrectAnswer(question, "功成名就")).toBe(true);
  });

  it("rejects an answer outside the accepted set", () => {
    const question = generateQuestion(
      "IDIOM_CHAIN",
      asKnowledgePointId("cy-madaochenggong"),
      beginnerCorpus,
      "multi-243",
    );

    expect(isCorrectAnswer(question, "答非所问")).toBe(false);
  });

  it("uses the canonical answer for legacy questions", () => {
    const question = generateQuestion(
      "IDIOM_CHAIN",
      asKnowledgePointId("cy-madaochenggong"),
      beginnerCorpus,
      "seed-1",
    );
    const { acceptedAnswers: _acceptedAnswers, ...legacyQuestion } = question;

    expect(isCorrectAnswer(legacyQuestion, "公事公办")).toBe(true);
  });
});

describe("domain exports", () => {
  it("exports deterministic random and idiom chain helpers", () => {
    expect({
      makeSeededRng: domain.makeSeededRng,
      seededShuffle: domain.seededShuffle,
      findIdiomSuccessors: domain.findIdiomSuccessors,
      canAssemble: domain.canAssemble,
      isCorrectAnswer: domain.isCorrectAnswer,
    }).toEqual({
      makeSeededRng,
      seededShuffle,
      findIdiomSuccessors,
      canAssemble,
      isCorrectAnswer,
    });
  });
});
