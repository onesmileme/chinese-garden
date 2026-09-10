import { describe, it, expect } from "vitest";
import {
  characterSchema,
  contentLevelSchema,
  contentStatusSchema,
  idiomSchema,
  poemSchema,
  questionTypeSchema,
} from "../src";

const metadata = {
  level: 2,
  difficulty: 3,
  promotionRequired: true,
  status: "ACTIVE",
  tags: ["nature"],
  revision: 1,
} as const;

const activeMetadata = {
  level: 1,
  difficulty: 1,
  promotionRequired: true,
  status: "ACTIVE",
  tags: [],
  revision: 1,
} as const;

const validChar = {
  id: "hz-ma-妈",
  char: "妈",
  pinyin: "mā",
  imageId: "img-ma",
  theme: "family",
  strokes: 6,
  ...activeMetadata,
};

const validPoem = {
  id: "sc-jingyesi",
  title: "静夜思",
  author: "李白",
  lines: ["床前明月光", "疑是地上霜", "举头望明月", "低头思故乡"],
  charRefs: ["hz-yue-月", "hz-guang-光"],
  ...activeMetadata,
  difficulty: 2,
};

const validIdiom = {
  id: "cy-madaochenggong",
  text: "马到成功",
  meaning: "事情顺利，很快取得成功",
  headPinyin: "ma",
  tailPinyin: "gong",
  ...activeMetadata,
};

describe("leveled content metadata", () => {
  it("accepts shared leveled metadata on every content type", () => {
    expect(contentLevelSchema.parse(5)).toBe(5);
    expect(contentStatusSchema.parse("ACTIVE")).toBe("ACTIVE");
    expect(
      characterSchema.parse({
        id: "hz-yue-月",
        char: "月",
        pinyin: "yuè",
        imageId: "img-yue",
        theme: "nature",
        strokes: 4,
        ...metadata,
      }),
    ).toMatchObject(metadata);
    expect(
      poemSchema.parse({
        id: "sc-test",
        title: "测试",
        author: "佚名",
        lines: ["明月"],
        charRefs: ["hz-yue-月"],
        ...metadata,
      }),
    ).toMatchObject(metadata);
    expect(
      idiomSchema.parse({
        id: "cy-madaochenggong",
        text: "马到成功",
        meaning: "顺利成功",
        headPinyin: "ma",
        tailPinyin: "gong",
        ...metadata,
      }),
    ).toMatchObject(metadata);
  });

  it.each([0, 6, 1.5])("rejects content level %s", (level) => {
    expect(() => contentLevelSchema.parse(level)).toThrow();
  });

  it("rejects unknown content status", () => {
    expect(() => contentStatusSchema.parse("PUBLISHED")).toThrow();
  });
});

describe("characterSchema", () => {
  it("accepts a valid character", () => {
    expect(characterSchema.parse(validChar).char).toBe("妈");
  });
  it("does not require or produce removed meaning/words/authoredDistractors", () => {
    const parsed = characterSchema.parse(validChar);
    expect(parsed).not.toHaveProperty("meaning");
    expect(parsed).not.toHaveProperty("words");
    expect(parsed).not.toHaveProperty("authoredDistractors");
  });
  it("strips removed fields when present on input", () => {
    const parsed = characterSchema.parse({
      ...validChar,
      meaning: "妈妈 / mother",
      words: ["妈妈", "姑妈"],
      authoredDistractors: ["爸"],
    });
    expect(parsed).not.toHaveProperty("meaning");
    expect(parsed).not.toHaveProperty("words");
    expect(parsed).not.toHaveProperty("authoredDistractors");
  });
  it("rejects difficulty outside 1..5", () => {
    expect(() =>
      characterSchema.parse({ ...validChar, difficulty: 6 }),
    ).toThrow();
  });
  it("rejects empty char", () => {
    expect(() => characterSchema.parse({ ...validChar, char: "" })).toThrow();
  });
  it("rejects empty pinyin", () => {
    expect(() => characterSchema.parse({ ...validChar, pinyin: "" })).toThrow();
  });
  it("rejects missing pinyin", () => {
    const { pinyin, ...noPinyin } = validChar;
    expect(() => characterSchema.parse(noPinyin)).toThrow();
  });
  it("rejects non-positive strokes", () => {
    expect(() => characterSchema.parse({ ...validChar, strokes: 0 })).toThrow();
  });
});

describe("poemSchema", () => {
  it("accepts a valid poem", () => {
    expect(poemSchema.parse(validPoem).title).toBe("静夜思");
  });
  it("accepts a poem without charRefs (K12 plumbing is optional)", () => {
    const { charRefs, ...noRefs } = validPoem;
    expect(poemSchema.parse(noRefs).title).toBe("静夜思");
  });
  it("accepts adult appreciation fields", () => {
    const parsed = poemSchema.parse({
      ...validPoem,
      dynasty: "唐",
      genre: "五言绝句",
      translation: "床前洒满明亮的月光……",
      annotations: [{ char: "霜", note: "喻指月光清冷" }],
      appreciation: "以月寄乡思，语浅情深。",
    });
    expect(parsed.dynasty).toBe("唐");
    expect(parsed.annotations?.[0]?.char).toBe("霜");
  });
  it("rejects empty lines", () => {
    expect(() => poemSchema.parse({ ...validPoem, lines: [] })).toThrow();
  });
  it("rejects difficulty outside 1..5", () => {
    expect(() => poemSchema.parse({ ...validPoem, difficulty: 0 })).toThrow();
  });
});

describe("idiomSchema", () => {
  it("accepts one authored four-character idiom", () => {
    expect(idiomSchema.parse(validIdiom)).toEqual(validIdiom);
  });

  it.each([
    [{ ...validIdiom, text: "成功" }, "text"],
    [{ ...validIdiom, text: "ABCD" }, "text"],
    [{ ...validIdiom, headPinyin: "gōng" }, "headPinyin"],
    [{ ...validIdiom, tailPinyin: "GONG" }, "tailPinyin"],
    [{ ...validIdiom, difficulty: 6 }, "difficulty"],
  ])("rejects an invalid idiom", (value, path) => {
    expect(
      idiomSchema.safeParse(value).error?.issues.some(
        (issue) => issue.path[0] === path,
      ),
    ).toBe(true);
  });
});

describe("questionTypeSchema", () => {
  it("accepts the four consolidated question types", () => {
    expect(questionTypeSchema.parse("POEM_FILL")).toBe("POEM_FILL");
    expect(questionTypeSchema.parse("POEM_MATCH_NEXT")).toBe("POEM_MATCH_NEXT");
    expect(questionTypeSchema.parse("IDIOM_CHAIN")).toBe("IDIOM_CHAIN");
    expect(questionTypeSchema.parse("IDIOM_MEANING")).toBe("IDIOM_MEANING");
  });

  it.each([
    "CHAR_TO_PINYIN",
    "CHAR_TO_TONE",
    "CHAR_TO_MEANING",
    "MEANING_TO_CHAR",
    "WORD_MATCH",
    "POEM_FILL_BLANK",
    "POEM_ORDER",
    "POEM_FILL_CHAR",
    "POEM_ORDER_CHAR",
  ])("rejects removed question type %s", (removed) => {
    expect(questionTypeSchema.safeParse(removed).success).toBe(false);
  });
});
