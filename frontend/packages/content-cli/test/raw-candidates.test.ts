import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  normalizeText,
  toSimplified,
  isCjkChar,
  isAllCjk,
  sha256Hex,
  extractCharacters,
  extractIdioms,
  extractPoems,
  scoreAndRankCharacters,
  scoreAndRankPoems,
  scoreAndRankIdioms,
  deriveLevels,
  buildReport,
  RawCharCandidate,
  RawIdiomCandidate,
  RawPoemCandidate,
  PoetryEntry,
} from "../src/raw-candidates";

describe("normalizeText", () => {
  it("strips leading/trailing whitespace and collapses internal whitespace", () => {
    expect(normalizeText("  hello   world  ")).toBe("hello world");
  });

  it("applies NFC normalization", () => {
    const nfd = "e\u0301"; // é in NFD
    expect(normalizeText(nfd)).toBe("é");
    expect(normalizeText(nfd).length).toBe(1);
  });
});

describe("toSimplified", () => {
  it("converts common traditional characters", () => {
    expect(toSimplified("見")).toBe("见");
    expect(toSimplified("風花雪月")).toBe("风花雪月");
  });

  it("leaves already-simplified characters unchanged", () => {
    expect(toSimplified("你好")).toBe("你好");
  });
});

describe("isCjkChar / isAllCjk", () => {
  it("detects CJK characters", () => {
    expect(isCjkChar("你")).toBe(true);
    expect(isCjkChar("a")).toBe(false);
    expect(isAllCjk("你好")).toBe(true);
    expect(isAllCjk("hello")).toBe(false);
  });
});

describe("extractCharacters", () => {
  it("extracts single CJK characters from xinhua word.json with valid pinyin and strokes", () => {
    const words = [
      { word: "你", pinyin: "nǐ", strokes: 7 },
      { word: "好", pinyin: "hǎo", strokes: 6 },
      { word: "ab", pinyin: "unknown", strokes: 0 }, // non-CJK → filtered
      { word: "𠀀", pinyin: "unknown", strokes: 0 }, // extension A → filtered
    ];
    const result = extractCharacters(words, { targetCount: 3000 });
    expect(result.candidates.length).toBe(2);
    expect(result.candidates[0].payload.char).toBe("你");
    expect(result.candidates[0].source).toBe("XINHUA_WORD");
    expect(result.candidates[0].importKey).toBe("XINHUA_WORD:word:你");
    expect(result.filtered).toBe(2);
    expect(result.rejectionReasons).toHaveProperty("NOT_SINGLE_CHAR", 2);
  });

  it("sets imageId and theme from the character", () => {
    const words = [
      { word: "春", pinyin: "chūn", strokes: 9 },
    ];
    const result = extractCharacters(words, { targetCount: 3000 });
    expect(result.candidates[0].payload.imageId).toBe("img-春");
    expect(result.candidates[0].payload.theme).toBe("world");
  });

  it("classifies invalid Unicode, pinyin, and stroke values", () => {
    const result = extractCharacters(
      [
        { word: "a", pinyin: "a", strokes: 1 },
        { word: "\u3400", pinyin: "qiū", strokes: 1 },
        { word: "山", pinyin: "", strokes: 3 },
        { word: "水", pinyin: "shuǐ", strokes: "4" as unknown as number },
        { word: "火", pinyin: "huǒ", strokes: "bad" as unknown as number },
        { word: "土", pinyin: "tǔ", strokes: 0 },
        { word: "天", pinyin: "tiān", strokes: 31 },
      ],
      { targetCount: 3000 },
    );

    expect(result.candidates.map(({ payload }) => payload.char)).toEqual([
      "水",
    ]);
    expect(result.rejectionReasons).toEqual({
      NOT_CJK_CHAR: 1,
      EXTENSION_CHAR: 1,
      MISSING_PINYIN: 1,
      INVALID_STROKES: 3,
    });
  });
});

describe("extractIdioms", () => {
  it("extracts four-character idioms with valid pinyin", () => {
    const idioms = [
      { word: "一心一意", pinyin: "yī xīn yī yì", explanation: "专心专意" },
      { word: "三心二意", pinyin: "sān xīn èr yì", explanation: "不专心" },
      { word: "一心", pinyin: "yī xīn", explanation: "too short" }, // filtered
    ];
    const result = extractIdioms(idioms, { targetCount: 10000 });
    expect(result.candidates.length).toBe(2);
    expect(result.candidates[0].payload.text).toBe("一心一意");
    expect(result.candidates[0].source).toBe("XINHUA_IDIOM");
    expect(result.candidates[0].importKey).toBe("XINHUA_IDIOM:word:一心一意");
    expect(result.filtered).toBe(1);
  });

  it("derives tone-free head/tail pinyin", () => {
    const idioms = [
      { word: "一心一意", pinyin: "yī xīn yī yì", explanation: "专心" },
    ];
    const result = extractIdioms(idioms, { targetCount: 10000 });
    const p = result.candidates[0].payload;
    expect(p.headPinyin).toBe("yi");
    expect(p.tailPinyin).toBe("yi");
  });

  it("reports every invalid idiom contract", () => {
    const result = extractIdioms(
      [
        { word: "abcd", pinyin: "a b c d", explanation: "latin" },
        { word: "一心", pinyin: "yī xīn", explanation: "short" },
        { word: "一心一意", pinyin: "yī xīn", explanation: "syllables" },
        { word: "三心二意", pinyin: "sān xīn èr yì", explanation: "" },
        {
          word: "心想事成",
          pinyin: "xīn xiǎng shì chéng",
          explanation: "长".repeat(1001),
        },
      ],
      { targetCount: 10000 },
    );

    expect(result.candidates).toEqual([]);
    expect(result.rejectionReasons).toEqual({
      NOT_CJK: 1,
      NOT_FOUR_CHARS: 1,
      NOT_FOUR_SYLLABLES: 1,
      MISSING_MEANING: 1,
      MEANING_TOO_LONG: 1,
    });
  });
});

describe("extractPoems", () => {
  it("extracts poems with valid title, author, and 2-16 lines", () => {
    const entries: PoetryEntry[] = [
      {
        title: "静夜思",
        author: "李白",
        paragraphs: ["床前明月光", "疑是地上霜", "举头望明月", "低头思故乡"],
      },
      {
        title: "",
        author: "佚名",
        paragraphs: ["一行诗"], // missing title → filtered
      },
    ];
    const result = extractPoems(entries, { targetCount: 5000 });
    expect(result.candidates.length).toBe(1);
    expect(result.candidates[0].payload.title).toBe("静夜思");
    expect(result.candidates[0].payload.author).toBe("李白");
    expect(result.candidates[0].source).toBe("CHINESE_POETRY");
    expect(result.filtered).toBe(1);
  });

  it("filters poems with too few or too many lines", () => {
    const entries: PoetryEntry[] = [
      {
        title: "一行",
        author: "佚名",
        paragraphs: ["一行诗"], // 1 line → filtered
      },
      {
        title: "太长",
        author: "佚名",
        paragraphs: Array.from({ length: 17 }, (_, i) => `第${i + 1}行`), // 17 lines → filtered
      },
    ];
    const result = extractPoems(entries, { targetCount: 5000 });
    expect(result.candidates.length).toBe(0);
    expect(result.filtered).toBe(2);
  });

  it("filters lines that are too short or too long", () => {
    const entries: PoetryEntry[] = [
      {
        title: "太短",
        author: "佚名",
        paragraphs: ["他", "来了"], // 2 lines but first is < 3 chars → filtered
      },
    ];
    const result = extractPoems(entries, { targetCount: 5000 });
    expect(result.candidates.length).toBe(0);
  });

  it("normalizes to simplified and derives stable id", () => {
    // 見 → 见
    const entries: PoetryEntry[] = [
      {
        title: "山中",
        author: "王維", // 維 → 维
        paragraphs: ["山中相送罷", "日暮掩柴扉"], // 罷 → 罢
      },
    ];
    const result = extractPoems(entries, { targetCount: 5000 });
    expect(result.candidates.length).toBe(1);
    const p = result.candidates[0];
    expect(p.payload.author).toBe("王维");
    expect(p.payload.lines[0]).toBe("山中相送罢");
    expect(p.id).toMatch(/^sc-raw-/);
    // Same input must produce same id
    const result2 = extractPoems(entries, { targetCount: 5000 });
    expect(result2.candidates[0].id).toBe(p.id);
  });

  it("reports missing authors, absent paragraphs, and oversized poems", () => {
    const result = extractPoems(
      [
        {
          title: "无作者",
          author: undefined,
          paragraphs: ["山川日月", "天地玄黄"],
        } as unknown as PoetryEntry,
        {
          title: "无正文",
          author: "作者",
          paragraphs: undefined,
        } as unknown as PoetryEntry,
        {
          title: "总字数过多",
          author: "作者",
          paragraphs: Array.from({ length: 13 }, () => "山".repeat(20)),
        },
      ],
      { targetCount: 5000 },
    );

    expect(result.candidates).toEqual([]);
    expect(result.rejectionReasons).toEqual({
      MISSING_AUTHOR: 1,
      INVALID_LINE_COUNT: 1,
      TOO_MANY_CHARS: 1,
    });
  });
});

describe("scoreAndRankCharacters", () => {
  const makeChar = (char: string, strokes: number, polyphonic: boolean): RawCharCandidate => ({
    importKey: `XINHUA_WORD:word:${char}`,
    source: "XINHUA_WORD",
    sourceRef: `xinhua/word.json:${char}`,
    sourceHash: "abc",
    ruleVersion: "raw-corpus-v1",
    id: `hz-${char.toLowerCase()}-${char}`,
    type: "CHARACTER",
    suggestedLevel: 1,
    suggestedDifficulty: 1,
    score: 0,
    tags: polyphonic ? ["polyphonic"] : [],
    payload: { char, pinyin: char, imageId: `img-${char}`, theme: "world", strokes },
  });

  it("ranks characters by stroke count and poem frequency", () => {
    const candidates = [
      makeChar("山", 3, false),
      makeChar("火", 4, false),
      makeChar("爆", 19, false),
    ];
    const poemCharFreq = new Map<string, number>([["山", 10], ["火", 5], ["爆", 0]]);
    const ranked = scoreAndRankCharacters(candidates, poemCharFreq);
    // 山 has highest poem freq → highest score
    expect(ranked[0].payload.char).toBe("山");
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    // 爆 has both low freq and high strokes → lowest
    expect(ranked[2].payload.char).toBe("爆");
  });

  it("caps at targetCount", () => {
    const candidates = Array.from({ length: 100 }, (_, i) =>
      makeChar(String.fromCodePoint(0x4e00 + i), 5, false),
    );
    const poemCharFreq = new Map<string, number>();
    const ranked = scoreAndRankCharacters(candidates, poemCharFreq, 50);
    expect(ranked.length).toBe(50);
  });

  it("penalizes polyphonic characters", () => {
    const plain = makeChar("山", 3, false);
    const polyphonic = makeChar("行", 3, true);
    const ranked = scoreAndRankCharacters(
      [polyphonic, plain],
      new Map([
        ["山", 1],
        ["行", 1],
      ]),
    );

    expect(ranked[0].payload.char).toBe("山");
  });
});

describe("scoreAndRankPoems", () => {
  const poem = (
    title: string,
    lines: string[],
  ): RawPoemCandidate => ({
    importKey: `CHINESE_POETRY:${title}`,
    source: "CHINESE_POETRY",
    sourceRef: title,
    sourceHash: "hash",
    ruleVersion: "raw-corpus-v1",
    id: `sc-${title}`,
    type: "POEM",
    suggestedLevel: 1,
    suggestedDifficulty: 1,
    score: 0,
    tags: [],
    payload: { title, author: "作者", lines, charRefs: [] },
  });

  it("scores known coverage, length bands, variance, sorting, and limits", () => {
    const candidates = [
      poem("中等", ["山".repeat(10), "水".repeat(10)]),
      poem("长篇", Array.from({ length: 5 }, () => "天地".repeat(10))),
      poem("空白", ["abc", "def"]),
      poem("参差", ["山".repeat(3), "水".repeat(20)]),
    ];
    const ranked = scoreAndRankPoems(
      candidates,
      new Set(["山", "水", "天", "地"]),
    );

    expect(ranked).toHaveLength(4);
    expect(ranked[0].score).toBeGreaterThan(ranked.at(-1)!.score);
    expect(
      scoreAndRankPoems(candidates, new Set(["山"]), 2),
    ).toHaveLength(2);
    expect(
      scoreAndRankPoems(
        [poem("乙", ["山山山"]), poem("甲", ["山山山"])],
        new Set(["山"]),
      ).map(({ payload }) => payload.title),
    ).toEqual(["甲", "乙"]);
  });
});

describe("scoreAndRankIdioms", () => {
  const idiom = (
    text: string,
    meaning: string,
  ): RawIdiomCandidate => ({
    importKey: `XINHUA_IDIOM:word:${text}`,
    source: "XINHUA_IDIOM",
    sourceRef: text,
    sourceHash: "hash",
    ruleVersion: "raw-corpus-v1",
    id: `cy-${text}`,
    type: "IDIOM",
    suggestedLevel: 1,
    suggestedDifficulty: 1,
    score: 0,
    tags: [],
    payload: {
      text,
      meaning,
      headPinyin: "yi",
      tailPinyin: "yi",
    },
  });

  it("scores character coverage and all meaning length bands", () => {
    const candidates = [
      idiom("一心一意", "短"),
      idiom("三心二意", "中".repeat(100)),
      idiom("心想事成", "长".repeat(201)),
    ];
    const ranked = scoreAndRankIdioms(
      candidates,
      new Set(["一", "心", "意"]),
    );

    expect(ranked).toHaveLength(3);
    expect(ranked[0].payload.text).toBe("一心一意");
    expect(scoreAndRankIdioms(candidates, new Set(), 1)).toHaveLength(1);
    expect(
      scoreAndRankIdioms(
        [idiom("一心二用", "短"), idiom("一心一意", "短")],
        new Set(),
      ).map(({ payload }) => payload.text),
    ).toEqual(["一心二用", "一心一意"]);
  });
});

describe("deriveLevels", () => {
  it("assigns L1-L5 based on percentile", () => {
    const candidates = Array.from({ length: 100 }, (_, i) => ({
      importKey: `k${i}`,
      source: "XINHUA_WORD" as const,
      sourceRef: `r${i}`,
      sourceHash: "abc",
      ruleVersion: "raw-corpus-v1" as const,
      id: `hz-x-${i}`,
      type: "CHARACTER" as const,
      suggestedLevel: 1,
      suggestedDifficulty: 1,
      score: 100 - i,
      tags: [] as string[],
      payload: { char: "x", pinyin: "x", imageId: "x", theme: "world", strokes: 5 },
    }));
    const leveled = deriveLevels(candidates, 100);
    // Top 20% → L1
    expect(leveled.slice(0, 20).every((c) => c.suggestedLevel === 1)).toBe(true);
    // 20%-45% → L2
    expect(leveled[20].suggestedLevel).toBe(2);
    // 45%-70% → L3
    expect(leveled[45].suggestedLevel).toBe(3);
    // 70%-90% → L4
    expect(leveled[70].suggestedLevel).toBe(4);
    // 90%-100% → L5
    expect(leveled[90].suggestedLevel).toBe(5);
  });
});

describe("buildReport", () => {
  it("summarizes extraction pipeline", () => {
    const candidates: RawCharCandidate[] = [
      {
        importKey: "k1", source: "XINHUA_WORD", sourceRef: "r1", sourceHash: "abc",
        ruleVersion: "raw-corpus-v1", id: "hz-a-一", type: "CHARACTER",
        suggestedLevel: 1, suggestedDifficulty: 1, score: 100, tags: [],
        payload: { char: "一", pinyin: "yī", imageId: "img-一", theme: "world", strokes: 1 },
      },
    ];
    const report = buildReport({
      ruleVersion: "raw-corpus-v1",
      sourceTotals: { characters: 100, poems: 200, idioms: 300 },
      filtered: { characters: 50, poems: 100, idioms: 150 },
      afterDedupe: { characters: 45, poems: 90, idioms: 140 },
      output: { characters: candidates, poems: [], idioms: [] },
      rejectionReasons: { NOT_CJK_CHAR: 10, MISSING_TITLE: 5 },
    });
    expect(report.totals.sourceRecords).toBe(600);
    expect(report.totals.afterFilter).toBe(300);
    expect(report.totals.output).toBe(1);
    expect(report.byType.characters.output).toBe(1);
    expect(report.byLevel[1]).toBe(1);
    expect(report.rejectionReasons).toEqual({ NOT_CJK_CHAR: 10, MISSING_TITLE: 5 });
  });

  it("counts an unexpected suggested level without dropping output", () => {
    const candidate: RawCharCandidate = {
      importKey: "k6",
      source: "XINHUA_WORD",
      sourceRef: "r6",
      sourceHash: "hash",
      ruleVersion: "raw-corpus-v1",
      id: "hz-liu-六",
      type: "CHARACTER",
      suggestedLevel: 6,
      suggestedDifficulty: 6,
      score: 1,
      tags: [],
      payload: {
        char: "六",
        pinyin: "liù",
        imageId: "img-六",
        theme: "world",
        strokes: 4,
      },
    };

    expect(
      buildReport({
        ruleVersion: "raw-corpus-v1",
        sourceTotals: { characters: 1, poems: 0, idioms: 0 },
        filtered: { characters: 1, poems: 0, idioms: 0 },
        afterDedupe: { characters: 1, poems: 0, idioms: 0 },
        output: { characters: [candidate], poems: [], idioms: [] },
        rejectionReasons: {},
      }).byLevel[6],
    ).toBe(1);
  });
});
