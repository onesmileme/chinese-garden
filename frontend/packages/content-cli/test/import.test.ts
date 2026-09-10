import { describe, it, expect } from "vitest";
import {
  importCharacters,
  importPoems,
  importIdioms,
  toneFreeSyllable,
} from "../src/import";
import { characterSchema, poemSchema, idiomSchema } from "@cc/content-schema";

describe("toneFreeSyllable", () => {
  it("strips tone marks and lowercases", () => {
    expect(toneFreeSyllable("chūn")).toBe("chun");
    expect(toneFreeSyllable("hǎi")).toBe("hai");
    expect(toneFreeSyllable("Lǜ")).toBe("lv");
    expect(toneFreeSyllable("é")).toBe("e");
  });
});

describe("importCharacters", () => {
  const source = {
    type: "characters" as const,
    level: 3 as const,
    items: [
      {
        char: "春",
        pinyin: "chūn",
        strokes: 9,
        theme: "nature",
        difficulty: 3,
        source: "通用规范汉字表",
      },
    ],
  };

  it("derives a stable id, DRAFT status, empty tags and revision 1", () => {
    const result = importCharacters(source, { existingIds: new Set() });
    expect(result.items).toHaveLength(1);
    const c = result.items[0];
    expect(c.id).toBe("hz-chun-春");
    expect(c.imageId).toBe("img-春");
    expect(c.level).toBe(3);
    expect(c.difficulty).toBe(3);
    expect(c.status).toBe("DRAFT");
    expect(c.tags).toEqual([]);
    expect(c.revision).toBe(1);
    // still a valid character (DRAFT is a legal status)
    expect(characterSchema.parse(c).id).toBe(c.id);
  });

  it("defaults difficulty to the level when omitted", () => {
    const result = importCharacters(
      { ...source, items: [{ char: "海", pinyin: "hǎi", strokes: 10, theme: "nature" }] },
      { existingIds: new Set() },
    );
    expect(result.items[0].difficulty).toBe(3);
  });

  it("skips items whose derived id already exists and reports them", () => {
    const result = importCharacters(source, {
      existingIds: new Set(["hz-chun-春"]),
    });
    expect(result.items).toHaveLength(0);
    expect(result.skipped).toEqual(["hz-chun-春"]);
  });

  it("dedupes duplicate ids within the same source batch", () => {
    const result = importCharacters(
      {
        ...source,
        items: [
          { char: "春", pinyin: "chūn", strokes: 9, theme: "nature" },
          { char: "春", pinyin: "chūn", strokes: 9, theme: "nature" },
        ],
      },
      { existingIds: new Set() },
    );
    expect(result.items).toHaveLength(1);
    expect(result.skipped).toEqual(["hz-chun-春"]);
  });

  it("honours an explicit imageId and promotionRequired override with no options", () => {
    const result = importCharacters({
      ...source,
      items: [
        {
          char: "海",
          pinyin: "hǎi",
          strokes: 10,
          theme: "nature",
          imageId: "img-custom",
          promotionRequired: false,
        },
      ],
    });
    const c = result.items[0];
    expect(c.imageId).toBe("img-custom");
    expect(c.promotionRequired).toBe(false);
  });
});

describe("importPoems", () => {
  const catalog = [
    { id: "hz-shan-山", char: "山", level: 1, status: "ACTIVE" },
    { id: "hz-shui-水", char: "水", level: 1, status: "ACTIVE" },
    { id: "hz-ren-人", char: "人", level: 1, status: "ACTIVE" },
    { id: "hz-hua-花", char: "花", level: 2, status: "ACTIVE" },
    { id: "hz-niao-鸟", char: "鸟", level: 2, status: "DRAFT" },
  ];

  const source = {
    type: "poems" as const,
    level: 1 as const,
    items: [
      {
        id: "sc-hua-wangwei",
        title: "画",
        author: "王维",
        lines: ["远看山有色", "近听水无声", "春去花还在", "人来鸟不惊"],
        difficulty: 2,
        source: "传王维《画》",
      },
    ],
  };

  it("derives charRefs limited to in-line ACTIVE chars at level <= poem.level", () => {
    const result = importPoems(source, { catalog });
    const p = result.items[0];
    // 山 水 人 are ACTIVE L1 and appear in lines -> included
    // 花 is ACTIVE but L2 > poem L1 -> excluded
    // 鸟 is DRAFT -> excluded
    expect(p.charRefs).toEqual(["hz-shan-山", "hz-shui-水", "hz-ren-人"]);
    expect(p.status).toBe("DRAFT");
    expect(p.level).toBe(1);
    expect(p.difficulty).toBe(2);
    expect(poemSchema.parse(p).id).toBe(p.id);
  });

  it("keeps an explicit charRefs override when provided", () => {
    const result = importPoems(
      {
        ...source,
        items: [{ ...source.items[0], charRefs: ["hz-shan-山"] }],
      },
      { catalog },
    );
    expect(result.items[0].charRefs).toEqual(["hz-shan-山"]);
    expect(result.issues).toEqual([]);
  });

  it("flags an explicit charRef that is absent from the active catalog", () => {
    const result = importPoems(
      {
        ...source,
        items: [{ ...source.items[0], charRefs: ["hz-shan-山", "hz-yue-月"] }],
      },
      { catalog },
    );
    expect(result.issues).toContainEqual({
      entityId: "sc-hua-wangwei",
      code: "POEM_CHAR_REF_MISSING",
      message: expect.stringContaining("hz-yue-月"),
    });
  });

  it("flags an explicit charRef whose character is only DRAFT", () => {
    const result = importPoems(
      {
        ...source,
        items: [{ ...source.items[0], charRefs: ["hz-niao-鸟"] }],
      },
      { catalog },
    );
    expect(result.issues).toContainEqual({
      entityId: "sc-hua-wangwei",
      code: "POEM_CHAR_REF_MISSING",
      message: expect.stringContaining("hz-niao-鸟"),
    });
  });

  it("flags an explicit charRef whose level exceeds the poem level", () => {
    const result = importPoems(
      {
        ...source,
        items: [{ ...source.items[0], charRefs: ["hz-hua-花"] }],
      },
      { catalog },
    );
    expect(result.issues).toContainEqual({
      entityId: "sc-hua-wangwei",
      code: "POEM_CHAR_LEVEL_TOO_HIGH",
      message: expect.stringContaining("hz-hua-花"),
    });
  });

  it("reports no issues for auto-derived charRefs", () => {
    const result = importPoems(source, { catalog });
    expect(result.issues).toEqual([]);
  });

  it("skips a poem whose id already exists", () => {
    const result = importPoems(source, {
      catalog,
      existingIds: new Set(["sc-hua-wangwei"]),
    });
    expect(result.items).toHaveLength(0);
    expect(result.skipped).toEqual(["sc-hua-wangwei"]);
  });

  it("defaults difficulty and promotionRequired when omitted", () => {
    const result = importPoems(
      {
        ...source,
        items: [
          {
            id: "sc-plain",
            title: "无题",
            author: "佚名",
            lines: ["山山水水"],
          },
        ],
      },
      { catalog },
    );
    const p = result.items[0];
    expect(p.difficulty).toBe(1);
    expect(p.promotionRequired).toBe(true);
  });
});

describe("importIdioms", () => {
  const source = {
    type: "idioms" as const,
    level: 3 as const,
    items: [
      {
        text: "月明千里",
        meaning: "月光普照大地",
        pinyin: "yuè míng qiān lǐ",
        difficulty: 3,
        source: "成语大词典",
      },
    ],
  };

  it("derives id and tone-free head/tail pinyin from the full reading", () => {
    const result = importIdioms(source, { existingIds: new Set() });
    const i = result.items[0];
    expect(i.id).toBe("cy-yuemingqianli");
    expect(i.headPinyin).toBe("yue");
    expect(i.tailPinyin).toBe("li");
    expect(i.level).toBe(3);
    expect(i.difficulty).toBe(3);
    expect(i.status).toBe("DRAFT");
    expect(idiomSchema.parse(i).id).toBe(i.id);
  });

  it("rejects an idiom whose text is not four Han characters", () => {
    expect(() =>
      importIdioms(
        { ...source, items: [{ ...source.items[0], text: "月明千" }] },
        { existingIds: new Set() },
      ),
    ).toThrow(/four/i);
  });

  it("rejects an idiom whose pinyin does not have four syllables", () => {
    expect(() =>
      importIdioms(
        { ...source, items: [{ ...source.items[0], pinyin: "yuè míng qiān" }] },
        { existingIds: new Set() },
      ),
    ).toThrow(/four syllables/i);
  });

  it("skips an idiom whose derived id already exists and reports it", () => {
    const result = importIdioms(source, {
      existingIds: new Set(["cy-yuemingqianli"]),
    });
    expect(result.items).toHaveLength(0);
    expect(result.skipped).toEqual(["cy-yuemingqianli"]);
  });

  it("defaults difficulty and promotionRequired when omitted and no options given", () => {
    const result = importIdioms({
      ...source,
      items: [
        {
          text: "一心一意",
          meaning: "专心专意",
          pinyin: "yī xīn yī yì",
        },
      ],
    });
    const i = result.items[0];
    expect(i.difficulty).toBe(3);
    expect(i.promotionRequired).toBe(true);
  });

  it("reports no chain issue when a successor exists in the batch", () => {
    const result = importIdioms({
      ...source,
      items: [
        { text: "月明千里", meaning: "月光普照", pinyin: "yuè míng qiān lǐ" },
        { text: "里应外合", meaning: "内外配合", pinyin: "lǐ yìng wài hé" },
      ],
    });
    expect(result.issues).toEqual([]);
  });

  it("reports no chain issue when a successor exists in the existing catalog", () => {
    const result = importIdioms(source, {
      idiomCatalog: [
        { id: "cy-lixxx", headPinyin: "li", tailPinyin: "yi", level: 2, status: "ACTIVE" },
      ],
    });
    expect(result.issues).toEqual([]);
  });

  it("flags an imported idiom with no chain successor at or below its level", () => {
    const result = importIdioms(source, {
      idiomCatalog: [
        { id: "cy-toohigh", headPinyin: "li", tailPinyin: "zz", level: 5, status: "ACTIVE" },
      ],
    });
    expect(result.issues).toContainEqual({
      entityId: "cy-yuemingqianli",
      code: "IDIOM_CHAIN_BROKEN_AT_LEVEL",
      message: expect.stringContaining("successor"),
    });
  });
});
