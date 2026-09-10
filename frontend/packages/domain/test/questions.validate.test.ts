import { describe, it, expect } from "vitest";
import type {
  ContentLevel,
  ContentMetadata,
  KnowledgePointId,
} from "@cc/content-schema";
import { validateCorpus } from "../src/questions/validate";
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

const base: Corpus = {
  characters: withActiveMetadata([
    {
      id: "hz-ma-妈" as any,
      char: "妈",
      pinyin: "mā",
      imageId: "i",
      theme: "family",
      strokes: 6,
      difficulty: 1,
    },
    {
      id: "hz-yue-月" as any,
      char: "月",
      pinyin: "yuè",
      imageId: "i",
      theme: "nature",
      strokes: 4,
      difficulty: 1,
    },
  ]),
  poems: withActiveMetadata([
    {
      id: "sc-1" as any,
      title: "t",
      author: "a",
      lines: ["妈月光山"],
      charRefs: ["hz-ma-妈" as any, "hz-yue-月" as any],
      difficulty: 2,
    },
  ]),
  idioms: [],
};

const chain = withActiveMetadata([
  {
    id: "cy-madaochenggong" as KnowledgePointId,
    text: "马到成功",
    meaning: "事情顺利，很快取得成功",
    headPinyin: "ma",
    tailPinyin: "gong",
    difficulty: 1 as const,
  },
  {
    id: "cy-gongshigongban" as KnowledgePointId,
    text: "公事公办",
    meaning: "按公事原则处理",
    headPinyin: "gong",
    tailPinyin: "ban",
    difficulty: 1 as const,
  },
]);

describe("validateCorpus", () => {
  it("returns no issues for a consistent corpus", () => {
    expect(validateCorpus(base)).toEqual([]);
  });
  it("flags a poem charRef missing from the character bank", () => {
    const bad: Corpus = {
      ...base,
      poems: [{ ...base.poems[0]!, charRefs: ["hz-nope" as any] }],
    };
    expect(validateCorpus(bad).map((i) => i.code)).toContain(
      "POEM_CHARREF_MISSING",
    );
  });
  it("flags a character pinyin without a recognizable tone", () => {
    const bad: Corpus = {
      ...base,
      characters: [
        { ...base.characters[0]!, pinyin: "ma" },
        base.characters[1]!,
      ],
    };
    expect(validateCorpus(bad).map((i) => i.code)).toContain(
      "PINYIN_TONE_MALFORMED",
    );
  });
  it("flags a poem with too few unique characters to generate POEM_FILL", () => {
    const bad: Corpus = {
      ...base,
      poems: [{ ...base.poems[0]!, lines: ["山山山山"], charRefs: [] }],
    };
    expect(validateCorpus(bad).map((i) => i.code)).toContain(
      "POEM_FILL_NO_CANDIDATE",
    );
  });
  it("flags a difficulty out of 1..5", () => {
    const bad: Corpus = {
      ...base,
      characters: [
        { ...base.characters[0]!, difficulty: 9 },
        base.characters[1]!,
      ],
    };
    expect(validateCorpus(bad).map((i) => i.code)).toContain(
      "DIFFICULTY_OUT_OF_RANGE",
    );
  });
  it("flags duplicate ids", () => {
    const bad: Corpus = {
      ...base,
      characters: [
        base.characters[0]!,
        { ...base.characters[1]!, id: "hz-ma-妈" as any },
      ],
    };
    expect(validateCorpus(bad).map((i) => i.code)).toContain("DUPLICATE_ID");
  });
  it("flags a poem with empty lines", () => {
    const bad: Corpus = { ...base, poems: [{ ...base.poems[0]!, lines: [] }] };
    expect(validateCorpus(bad).map((i) => i.code)).toContain(
      "POEM_EMPTY_LINES",
    );
  });
  it("flags a poem difficulty out of 1..5", () => {
    // charRefs 置空以隔离，仅触发诗库 difficulty 越界分支。
    const bad: Corpus = {
      ...base,
      poems: [{ ...base.poems[0]!, difficulty: 6, charRefs: [] }],
    };
    const issues = validateCorpus(bad);
    expect(
      issues.some(
        (i) => i.code === "DIFFICULTY_OUT_OF_RANGE" && i.entityId === "sc-1",
      ),
    ).toBe(true);
  });

  it.each([
    [{ ...chain[0]!, text: "成功" }, "IDIOM_NOT_FOUR_CHARS"],
    [{ ...chain[0]!, headPinyin: "gōng" }, "IDIOM_PINYIN_INVALID"],
    [{ ...chain[0]!, difficulty: 6 }, "IDIOM_DIFFICULTY_OUT_OF_RANGE"],
    [{ ...chain[0]!, tailPinyin: "none" }, "IDIOM_NO_SUCCESSOR"],
  ])("reports invalid idiom semantics", (idiom, code) => {
    expect(
      validateCorpus({
        ...base,
        idioms: [idiom, chain[1]!],
      } as Corpus).map((issue) => issue.code),
    ).toContain(code);
  });

  it("flags an idiom id colliding with another knowledge point", () => {
    const idiom = { ...chain[0]!, id: base.characters[0]!.id };

    expect(
      validateCorpus({
        ...base,
        idioms: [idiom, chain[1]!],
      }).map((issue) => issue.code),
    ).toContain("DUPLICATE_ID");
  });

  it("tolerates an absent character bank (古文乐园默认无字库)", () => {
    const { characters: _characters, ...withoutCharacters } = base;
    const corpus = withoutCharacters as Corpus;

    // 无字库时诗句的 charRef 无从比对，报缺失即可，且不应抛错。
    expect(validateCorpus(corpus).map((issue) => issue.code)).toContain(
      "POEM_CHARREF_MISSING",
    );
  });

  it("tolerates a poem without charRefs", () => {
    const { charRefs: _charRefs, ...poemWithoutRefs } = base.poems[0]!;
    const corpus: Corpus = {
      ...base,
      poems: [poemWithoutRefs as Corpus["poems"][number]],
    };

    expect(validateCorpus(corpus)).toEqual([]);
  });
});
