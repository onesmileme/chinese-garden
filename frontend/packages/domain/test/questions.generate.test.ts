import { describe, it, expect } from "vitest";
import {
  generateQuestion,
  lookupAnswer,
  isCorrectAnswer,
  isPoemFillCorrect,
  serializePoemFill,
  poemBlankCount,
  canGeneratePoemMatch,
} from "../src/questions/generate";
import type { ContentLevel, ContentMetadata } from "@cc/content-schema";
import type { Corpus } from "../src/questions/generate";

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

// 古文乐园语料库：仅诗词与成语，无识字/拼音（K12）内容。
const corpus: Corpus = {
  poems: withActiveMetadata([
    {
      id: "sc-jingyesi" as any,
      title: "静夜思",
      author: "李白",
      lines: ["床前明月光", "疑是地上霜", "举头望明月", "低头思故乡"],
      difficulty: 2,
    },
    {
      id: "sc-chunxiao" as any,
      title: "春晓",
      author: "孟浩然",
      lines: ["春眠不觉晓", "处处闻啼鸟", "夜来风雨声", "花落知多少"],
      difficulty: 2,
    },
  ]),
  idioms: withActiveMetadata([
    {
      id: "cy-madaochenggong" as any,
      text: "马到成功",
      meaning: "事情顺利，很快取得成功",
      headPinyin: "ma",
      tailPinyin: "gong",
      difficulty: 1,
    },
    {
      id: "cy-gongshigongban" as any,
      text: "公事公办",
      meaning: "按公事的原则办事，不讲私人情面",
      headPinyin: "gong",
      tailPinyin: "ban",
      difficulty: 1,
    },
    {
      id: "cy-gongchengmingjiu" as any,
      text: "功成名就",
      meaning: "功业建立，名声也随之取得",
      headPinyin: "gong",
      tailPinyin: "jiu",
      difficulty: 1,
    },
    {
      id: "cy-banmenongfu" as any,
      text: "班门弄斧",
      meaning: "在行家面前卖弄本领，不自量力",
      headPinyin: "ban",
      tailPinyin: "fu",
      difficulty: 1,
    },
  ]),
};

describe("poemBlankCount", () => {
  it("uses 2 blanks for easy poems and 3 for harder ones", () => {
    expect(poemBlankCount(1)).toBe(2);
    expect(poemBlankCount(2)).toBe(2);
    expect(poemBlankCount(3)).toBe(3);
  });
});

describe("canGeneratePoemMatch", () => {
  it("requires at least two lines for an upper/lower match", () => {
    expect(canGeneratePoemMatch({ lines: ["孤篇"] })).toBe(false);
    expect(canGeneratePoemMatch({ lines: ["上句", "下句"] })).toBe(true);
  });
});

describe("lookupAnswer (RNG-free authoritative)", () => {
  it("IDIOM_CHAIN returns the first successor in corpus order", () => {
    expect(
      lookupAnswer("IDIOM_CHAIN", "cy-madaochenggong" as any, corpus),
    ).toBe("公事公办");
  });
  it("IDIOM_MEANING returns the idiom meaning", () => {
    expect(
      lookupAnswer("IDIOM_MEANING", "cy-madaochenggong" as any, corpus),
    ).toBe("事情顺利，很快取得成功");
  });
  it("IDIOM_CHAIN rejects a source without a successor", () => {
    expect(() =>
      lookupAnswer("IDIOM_CHAIN", "cy-madaochenggong" as any, {
        ...corpus,
        idioms: [corpus.idioms[0]!],
      }),
    ).toThrow("no idiom successor: cy-madaochenggong");
  });
  it("throws when idiom knowledge point is missing", () => {
    expect(() =>
      lookupAnswer("IDIOM_CHAIN", "cy-nope" as any, corpus),
    ).toThrow("idiom not found: cy-nope");
  });
  it("POEM_FILL answer is seed-dependent and cannot be looked up", () => {
    expect(() =>
      lookupAnswer("POEM_FILL", "sc-jingyesi" as any, corpus),
    ).toThrow(/seed-dependent/);
  });
  it("POEM_MATCH_NEXT answer is seed-dependent and cannot be looked up", () => {
    expect(() =>
      lookupAnswer("POEM_MATCH_NEXT", "sc-jingyesi" as any, corpus),
    ).toThrow(/seed-dependent/);
  });
});

describe("generateQuestion — POEM_MATCH_NEXT", () => {
  it("is deterministic for the same seed", () => {
    const a = generateQuestion(
      "POEM_MATCH_NEXT",
      "sc-jingyesi" as any,
      corpus,
      "s",
    );
    const b = generateQuestion(
      "POEM_MATCH_NEXT",
      "sc-jingyesi" as any,
      corpus,
      "s",
    );
    expect(a).toEqual(b);
  });
  it("prompts with a line and answers with its immediate next line", () => {
    const q = generateQuestion(
      "POEM_MATCH_NEXT",
      "sc-jingyesi" as any,
      corpus,
      "match-1",
    );
    const lines = corpus.poems[0]!.lines;
    const promptIndex = lines.indexOf(q.prompt);
    expect(promptIndex).toBeGreaterThanOrEqual(0);
    expect(promptIndex).toBeLessThan(lines.length - 1);
    expect(q.correctAnswer).toBe(lines[promptIndex + 1]);
  });
  it("offers 4 unique options that include the correct next line", () => {
    const q = generateQuestion(
      "POEM_MATCH_NEXT",
      "sc-jingyesi" as any,
      corpus,
      "match-opts",
    );
    expect(q.options).toHaveLength(4);
    expect(new Set(q.options).size).toBe(4);
    expect(q.options).toContain(q.correctAnswer);
  });
  it("is judged correct only for the matching next line", () => {
    const q = generateQuestion(
      "POEM_MATCH_NEXT",
      "sc-jingyesi" as any,
      corpus,
      "match-judge",
    );
    expect(isCorrectAnswer(q, q.correctAnswer)).toBe(true);
    const wrong = q.options.find((o) => o !== q.correctAnswer)!;
    expect(isCorrectAnswer(q, wrong)).toBe(false);
  });
  it("rejects a poem with fewer than two lines", () => {
    const single: Corpus = {
      ...corpus,
      poems: withActiveMetadata([
        {
          id: "sc-one" as any,
          title: "孤句",
          author: "t",
          lines: ["独在异乡为异客"],
          difficulty: 1,
        },
      ]),
    };
    expect(() =>
      generateQuestion("POEM_MATCH_NEXT", "sc-one" as any, single, "s"),
    ).toThrow("poem has too few lines for POEM_MATCH_NEXT: sc-one");
  });
  it("throws when poem knowledge point is missing", () => {
    expect(() =>
      generateQuestion("POEM_MATCH_NEXT", "sc-nope" as any, corpus, "s"),
    ).toThrow(/poem not found/);
  });
});

describe("generateQuestion — IDIOM_MEANING", () => {
  it("is deterministic for the same seed", () => {
    const a = generateQuestion(
      "IDIOM_MEANING",
      "cy-madaochenggong" as any,
      corpus,
      "s",
    );
    const b = generateQuestion(
      "IDIOM_MEANING",
      "cy-madaochenggong" as any,
      corpus,
      "s",
    );
    expect(a).toEqual(b);
  });
  it("prompts with the idiom and answers with its meaning", () => {
    const q = generateQuestion(
      "IDIOM_MEANING",
      "cy-madaochenggong" as any,
      corpus,
      "meaning-1",
    );
    expect(q.prompt).toBe("马到成功");
    expect(q.correctAnswer).toBe("事情顺利，很快取得成功");
  });
  it("offers 4 unique meaning options that include the correct one", () => {
    const q = generateQuestion(
      "IDIOM_MEANING",
      "cy-madaochenggong" as any,
      corpus,
      "meaning-opts",
    );
    expect(q.options).toHaveLength(4);
    expect(new Set(q.options).size).toBe(4);
    expect(q.options).toContain(q.correctAnswer);
  });
  it("is judged correct only for the matching meaning", () => {
    const q = generateQuestion(
      "IDIOM_MEANING",
      "cy-madaochenggong" as any,
      corpus,
      "meaning-judge",
    );
    expect(isCorrectAnswer(q, q.correctAnswer)).toBe(true);
    const wrong = q.options.find((o) => o !== q.correctAnswer)!;
    expect(isCorrectAnswer(q, wrong)).toBe(false);
  });
  it("throws when it cannot assemble enough distinct meaning options", () => {
    const sparse: Corpus = {
      ...corpus,
      idioms: corpus.idioms.slice(0, 3),
    };
    // 仅 3 个成语 → 只剩 2 个干扰释义，无法凑够 3 个。
    expect(() =>
      generateQuestion("IDIOM_MEANING", "cy-madaochenggong" as any, sparse, "s"),
    ).toThrow("cannot build idiom-meaning options: cy-madaochenggong");
  });
  it("throws when idiom knowledge point is missing", () => {
    expect(() =>
      generateQuestion("IDIOM_MEANING", "cy-nope" as any, corpus, "s"),
    ).toThrow(/idiom not found/);
  });
});

describe("generateQuestion — POEM_FILL", () => {
  it("is deterministic and produces structured display / blanks / candidates", () => {
    const q = generateQuestion(
      "POEM_FILL",
      "sc-jingyesi" as any,
      corpus,
      "seed-1",
    );
    expect(generateQuestion("POEM_FILL", "sc-jingyesi" as any, corpus, "seed-1"))
      .toEqual(q);
    expect(q.prompt).toBe("静夜思");
    expect(q.displayLines).toBeDefined();
    expect(q.displayLines!.join("")).toContain("＿");
    expect(q.blanks).toHaveLength(2); // difficulty 2 → 2 blanks
    expect(q.candidates).toBeDefined();
    // 候选池 = 正确字 + 干扰字
    expect(q.candidates!.length).toBe(4);
    for (const b of q.blanks!) expect(q.candidates).toContain(b.answer);
    // 每个空的答案都是原诗中的字
    const allChars = corpus.poems[0]!.lines.join("");
    for (const b of q.blanks!) expect(allChars).toContain(b.answer);
    // 挖空数 = 展示中 ＿ 的数量
    expect((q.displayLines!.join("").match(/＿/g) ?? []).length).toBe(2);
  });
  it("does not repeat candidate glyphs", () => {
    const q = generateQuestion(
      "POEM_FILL",
      "sc-jingyesi" as any,
      corpus,
      "unique-candidates-3",
    );

    expect(new Set(q.blanks!.map((blank) => blank.answer)).size).toBe(
      q.blanks!.length,
    );
    expect(new Set(q.candidates).size).toBe(q.candidates!.length);
  });
  it("blank count follows poem difficulty", () => {
    const hard: Corpus = {
      ...corpus,
      poems: [{ ...corpus.poems[0]!, level: 4, difficulty: 4 }],
    };
    const q = generateQuestion("POEM_FILL", "sc-jingyesi" as any, hard, "s");
    expect(q.blanks).toHaveLength(3);
  });
  it("different seeds produce different blank combinations for the same poem", () => {
    const serials = new Set(
      ["a", "b", "c", "d", "e", "f"].map(
        (s) =>
          generateQuestion("POEM_FILL", "sc-jingyesi" as any, corpus, s)
            .correctAnswer,
      ),
    );
    expect(serials.size).toBeGreaterThan(1);
  });
  it("serialized correctAnswer follows the index=char|... format", () => {
    const q = generateQuestion(
      "POEM_FILL",
      "sc-jingyesi" as any,
      corpus,
      "seed-1",
    );
    expect(q.correctAnswer).toMatch(/^0=.\|1=.$/);
    expect(q.correctAnswer).toBe(
      serializePoemFill(
        Object.fromEntries(q.blanks!.map((b) => [b.index, b.answer])),
      ),
    );
  });
  it("rejects a poem without enough unique candidate glyphs", () => {
    const repeatCorpus: Corpus = {
      ...corpus,
      poems: withActiveMetadata([
        {
          id: "sc-rep" as any,
          title: "叠字",
          author: "t",
          lines: ["山山山山"],
          difficulty: 1,
        },
      ]),
    };

    expect(() =>
      generateQuestion("POEM_FILL", "sc-rep" as any, repeatCorpus, "s"),
    ).toThrow("poem has too few unique characters for POEM_FILL: sc-rep");
  });
  it("throws when poem has too few unique characters", () => {
    const tiny: Corpus = {
      ...corpus,
      poems: withActiveMetadata([
        {
          id: "sc-tiny" as any,
          title: "短",
          author: "t",
          lines: ["山"],
          difficulty: 1,
        },
      ]),
    };
    expect(() =>
      generateQuestion("POEM_FILL", "sc-tiny" as any, tiny, "s"),
    ).toThrow(/too few unique characters/);
  });
  it("throws when poem knowledge point is missing", () => {
    expect(() =>
      generateQuestion("POEM_FILL", "sc-nope" as any, corpus, "s"),
    ).toThrow(/poem not found/);
  });
});

describe("isPoemFillCorrect", () => {
  const q = generateQuestion(
    "POEM_FILL",
    "sc-jingyesi" as any,
    corpus,
    "seed-1",
  );
  it("is true only when every blank is filled correctly", () => {
    const allRight = Object.fromEntries(q.blanks!.map((b) => [b.index, b.answer]));
    expect(isPoemFillCorrect(q, allRight)).toBe(true);
  });
  it("is false when any blank is wrong", () => {
    const oneWrong = Object.fromEntries(
      q.blanks!.map((b, i) => [b.index, i === 0 ? "错" : b.answer]),
    );
    expect(isPoemFillCorrect(q, oneWrong)).toBe(false);
  });
  it("is false when a blank is missing", () => {
    expect(isPoemFillCorrect(q, {})).toBe(false);
  });
  it("is false when the question has no blanks", () => {
    expect(isPoemFillCorrect({ ...q, blanks: [] }, {})).toBe(false);
    expect(isPoemFillCorrect({ ...q, blanks: undefined }, {})).toBe(false);
  });
  it("is reachable through isCorrectAnswer via the serialized string", () => {
    expect(isCorrectAnswer(q, q.correctAnswer)).toBe(true);
    expect(isCorrectAnswer(q, "")).toBe(false);
    const wrong = serializePoemFill(
      Object.fromEntries(q.blanks!.map((b, i) => [b.index, i === 0 ? "错" : b.answer])),
    );
    expect(isCorrectAnswer(q, wrong)).toBe(false);
  });
});

describe("isCorrectAnswer — non POEM_FILL", () => {
  it("uses acceptedAnswers when present", () => {
    const q = generateQuestion(
      "IDIOM_CHAIN",
      "cy-madaochenggong" as any,
      corpus,
      "s",
    );
    expect(isCorrectAnswer(q, q.correctAnswer)).toBe(true);
    expect(isCorrectAnswer(q, "不相关")).toBe(false);
  });
  it("falls back to correctAnswer when acceptedAnswers is absent", () => {
    const q = generateQuestion(
      "IDIOM_MEANING",
      "cy-madaochenggong" as any,
      corpus,
      "s",
    );
    expect(q.acceptedAnswers).toBeUndefined();
    expect(isCorrectAnswer(q, q.correctAnswer)).toBe(true);
    expect(isCorrectAnswer(q, "毫不相干")).toBe(false);
  });
});
