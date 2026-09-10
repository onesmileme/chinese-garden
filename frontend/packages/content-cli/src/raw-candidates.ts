import { createHash } from "node:crypto";
import { toneFreeSyllable } from "./import";

export type RawSource = "XINHUA_WORD" | "XINHUA_IDIOM" | "CHINESE_POETRY";

export interface RawCandidateBase {
  importKey: string;
  source: RawSource;
  sourceRef: string;
  sourceHash: string;
  ruleVersion: "raw-corpus-v1";
  id: string;
  suggestedLevel: number;
  suggestedDifficulty: number;
  score: number;
  tags: string[];
}

export interface RawCharCandidate extends RawCandidateBase {
  type: "CHARACTER";
  payload: { char: string; pinyin: string; imageId: string; theme: string; strokes: number };
}

export interface RawPoemCandidate extends RawCandidateBase {
  type: "POEM";
  payload: { title: string; author: string; lines: string[]; charRefs: string[] };
}

export interface RawIdiomCandidate extends RawCandidateBase {
  type: "IDIOM";
  payload: { text: string; meaning: string; headPinyin: string; tailPinyin: string };
}

export interface RawCandidateReport {
  ruleVersion: string;
  totals: { sourceRecords: number; afterFilter: number; afterDedupe: number; output: number };
  byType: {
    characters: { sourceRecords: number; afterFilter: number; afterDedupe: number; output: number };
    poems: { sourceRecords: number; afterFilter: number; afterDedupe: number; output: number };
    idioms: { sourceRecords: number; afterFilter: number; afterDedupe: number; output: number };
  };
  byLevel: Record<number, number>;
  rejectionReasons: Record<string, number>;
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * NFC normalize, strip leading/trailing whitespace, collapse internal
 * whitespace to a single space.
 */
export function normalizeText(text: string): string {
  return text.normalize("NFC").trim().replace(/\s+/g, " ");
}

/**
 * Simplified OpenCC mapping for the most common traditional characters
 * found in Chinese poetry. Full OpenCC is a multi-megabyte dependency;
 * this mapping covers the high-frequency cases in the corpus.
 */
const TRAD_TO_SIMP: Record<string, string> = {
  見: "见", 學: "学", 國: "国", 體: "体", 書: "书", 門: "门",
  時: "时", 來: "来", 長: "长", 萬: "万", 無: "无", 為: "为",
  雲: "云", 風: "风", 馬: "马", 魚: "鱼", 鳥: "鸟", 龍: "龙",
  車: "车", 飛: "飞", 開: "开", 關: "关", 會: "会", 個: "个",
  裡: "里", 後: "后", 對: "对", 當: "当", 說: "说", 過: "过",
  頭: "头", 實: "实", 氣: "气", 愛: "爱", 東: "东", 電: "电",
  發: "发", 還: "还", 話: "话", 問: "问", 間: "间", 難: "难",
  誰: "谁", 讓: "让", 親: "亲", 請: "请", 認: "认", 記: "记",
  許: "许", 詩: "诗", 試: "试", 語: "语",
  買: "买", 賣: "卖", 路: "路", 跟: "跟", 跑: "跑", 輕: "轻",
  進: "进", 遠: "远", 連: "连", 這: "这", 那: "那", 都: "都",
  陰: "阴", 陽: "阳", 陳: "陈", 隨: "随", 隻: "只", 雙: "双",
  們: "们", 從: "从", 樣: "样", 樂: "乐", 機: "机",
  樹: "树", 條: "条", 橋: "桥", 樓: "楼", 業: "业", 極: "极",
  歲: "岁", 歷: "历", 歸: "归", 殺: "杀", 沒: "没", 河: "河",
  滿: "满", 漢: "汉", 爭: "争", 現: "现",
  盡: "尽", 眾: "众", 禮: "礼", 神: "神", 種: "种",
  稱: "称", 窮: "穷", 節: "节", 紅: "红", 紙: "纸", 經: "经",
  結: "结", 給: "给", 綠: "绿", 總: "总", 線: "线", 緣: "缘",
  織: "织", 羅: "罗", 義: "义", 聲: "声", 聽: "听", 與: "与",
  興: "兴", 舉: "举", 舊: "旧", 處: "处", 號: "号", 雖: "虽",
  術: "术", 衝: "冲", 裝: "装", 覺: "觉",
  觀: "观", 論: "论",
  調: "调", 談: "谈", 謀: "谋", 謝: "谢", 訴: "诉", 詞: "词",
  誠: "诚", 誤: "误", 課: "课", 講: "讲", 讀: "读",
  變: "变", 貓: "猫", 財: "财", 貧: "贫", 貨: "货", 資: "资",
  賓: "宾", 貴: "贵", 費: "费", 贊: "赞",
  走: "走", 起: "起", 足: "足", 身: "身", 軍: "军",
  較: "较", 載: "载", 轉: "转", 農: "农",
  運: "运", 達: "达", 適: "适",
  選: "选", 遺: "遗", 邊: "边", 醫: "医", 金: "金",
  銀: "银", 銅: "铜", 鐵: "铁", 錢: "钱", 錯: "错",
  隊: "队",
  需: "需", 靜: "静", 頁: "页",
  題: "题", 食: "食", 飯: "饭",
  鴨: "鸭", 維: "维", 罷: "罢",
};

export function toSimplified(text: string): string {
  return Array.from(text)
    .map((ch) => TRAD_TO_SIMP[ch] ?? ch)
    .join("");
}

/** Check that a string contains only CJK Unified Ideographs (U+4E00–U+9FFF). */
export function isCjkChar(ch: string): boolean {
  const cp = ch.codePointAt(0)!;
  return cp >= 0x4e00 && cp <= 0x9fff;
}

/** Check that a string consists entirely of CJK characters. */
export function isAllCjk(text: string): boolean {
  return Array.from(text).every((ch) => isCjkChar(ch));
}

export interface ExtractionOptions {
  targetCount: number;
}

export interface ExtractionResult<T> {
  candidates: T[];
  filtered: number;
  rejectionReasons: Record<string, number>;
}

export interface XinhuaWord {
  word: string;
  pinyin: string;
  strokes: number;
}

export interface XinhuaIdiom {
  word: string;
  pinyin: string;
  explanation: string;
}

export interface PoetryEntry {
  title: string;
  author: string;
  paragraphs: string[];
}

const CJK_UNIFIED_START = 0x4e00;
const CJK_UNIFIED_END = 0x9fff;

function isCjkUnified(codePoint: number): boolean {
  return codePoint >= CJK_UNIFIED_START && codePoint <= CJK_UNIFIED_END;
}

export function extractCharacters(
  words: XinhuaWord[],
  options: ExtractionOptions,
): ExtractionResult<RawCharCandidate> {
  const candidates: RawCharCandidate[] = [];
  const rejectionReasons: Record<string, number> = {};

  for (const w of words) {
    const normalized = normalizeText(w.word);
    if (normalized.length !== 1) {
      incr(rejectionReasons, "NOT_SINGLE_CHAR");
      continue;
    }
    const cp = normalized.codePointAt(0)!;
    if (!isCjkUnified(cp)) {
      if (cp >= 0x3400 && cp <= 0x4dbf) {
        incr(rejectionReasons, "EXTENSION_CHAR");
      } else {
        incr(rejectionReasons, "NOT_CJK_CHAR");
      }
      continue;
    }
    const char = normalized;
    const pinyin = normalizeText(w.pinyin);
    if (!pinyin || pinyin.length === 0) {
      incr(rejectionReasons, "MISSING_PINYIN");
      continue;
    }
    const strokes = typeof w.strokes === "string" ? parseInt(w.strokes, 10) : w.strokes;
    if (typeof strokes !== "number" || isNaN(strokes) || strokes < 1 || strokes > 30) {
      incr(rejectionReasons, "INVALID_STROKES");
      continue;
    }

    const toneFree = toneFreeSyllable(
      Array.from(pinyin).map((c) => c).join(""),
    );
    const id = `hz-${toneFree}-${char}`;
    const importKey = `XINHUA_WORD:word:${char}`;
    const sourceRef = `xinhua/word.json:${char}`;
    const sourceHash = sha256Hex(JSON.stringify({ word: char, pinyin, strokes }));

    candidates.push({
      importKey,
      source: "XINHUA_WORD",
      sourceRef,
      sourceHash,
      ruleVersion: "raw-corpus-v1",
      id,
      type: "CHARACTER",
      suggestedLevel: 1, // placeholder; real scoring in Task 2
      suggestedDifficulty: 1,
      score: 0,
      tags: [],
      payload: {
        char,
        pinyin,
        imageId: `img-${char}`,
        theme: "world",
        strokes,
      },
    });
  }

  return { candidates, filtered: words.length - candidates.length, rejectionReasons };
}

export function extractIdioms(
  idioms: XinhuaIdiom[],
  options: ExtractionOptions,
): ExtractionResult<RawIdiomCandidate> {
  const candidates: RawIdiomCandidate[] = [];
  const rejectionReasons: Record<string, number> = {};

  for (const raw of idioms) {
    const text = normalizeText(raw.word);
    if (!isAllCjk(text)) {
      incr(rejectionReasons, "NOT_CJK");
      continue;
    }
    const chars = Array.from(text);
    if (chars.length !== 4) {
      incr(rejectionReasons, "NOT_FOUR_CHARS");
      continue;
    }
    const pinyin = normalizeText(raw.pinyin);
    const syllables = pinyin.split(/\s+/);
    if (syllables.length !== 4) {
      incr(rejectionReasons, "NOT_FOUR_SYLLABLES");
      continue;
    }
    const meaning = normalizeText(raw.explanation);
    if (!meaning || meaning.length === 0) {
      incr(rejectionReasons, "MISSING_MEANING");
      continue;
    }
    if (meaning.length > 1000) {
      incr(rejectionReasons, "MEANING_TOO_LONG");
      continue;
    }

    const toneFree = syllables.map((s) => toneFreeSyllable(s));
    const id = `cy-${toneFree.join("")}`;
    const importKey = `XINHUA_IDIOM:word:${text}`;
    const sourceRef = `xinhua/idiom.json:${text}`;
    const sourceHash = sha256Hex(JSON.stringify({ word: text, pinyin, explanation: meaning }));

    candidates.push({
      importKey,
      source: "XINHUA_IDIOM",
      sourceRef,
      sourceHash,
      ruleVersion: "raw-corpus-v1",
      id,
      type: "IDIOM",
      suggestedLevel: 1,
      suggestedDifficulty: 1,
      score: 0,
      tags: [],
      payload: {
        text,
        meaning,
        headPinyin: toneFree[0]!,
        tailPinyin: toneFree[3]!,
      },
    });
  }

  return { candidates, filtered: idioms.length - candidates.length, rejectionReasons };
}

function incr(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}

export function extractPoems(
  entries: PoetryEntry[],
  options: ExtractionOptions,
): ExtractionResult<RawPoemCandidate> {
  const candidates: RawPoemCandidate[] = [];
  const rejectionReasons: Record<string, number> = {};

  for (const entry of entries) {
    const title = normalizeText(entry.title);
    if (!title) {
      incr(rejectionReasons, "MISSING_TITLE");
      continue;
    }
    const author = normalizeText(entry.author ?? "");
    if (!author) {
      incr(rejectionReasons, "MISSING_AUTHOR");
      continue;
    }
    const rawLines = (entry.paragraphs ?? []).map((l) => normalizeText(l)).filter((l) => l.length > 0);
    if (rawLines.length < 2 || rawLines.length > 16) {
      incr(rejectionReasons, "INVALID_LINE_COUNT");
      continue;
    }

    const lines = rawLines.map((l) => toSimplified(l));
    const totalChars = lines.reduce((sum, l) => sum + Array.from(l).filter(isCjkChar).length, 0);
    if (totalChars > 240) {
      incr(rejectionReasons, "TOO_MANY_CHARS");
      continue;
    }

    const hasInvalidLine = lines.some((l) => {
      const cjkCount = Array.from(l).filter(isCjkChar).length;
      return cjkCount < 3 || cjkCount > 20;
    });
    if (hasInvalidLine) {
      incr(rejectionReasons, "INVALID_LINE_LENGTH");
      continue;
    }

    const simplifiedTitle = toSimplified(title);
    const simplifiedAuthor = toSimplified(author);
    const normalizedKey = `${simplifiedAuthor}|${simplifiedTitle}|${lines.join("|")}`;
    const id = `sc-raw-${sha256Hex(normalizedKey).slice(0, 20)}`;
    const importKey = `CHINESE_POETRY:${id}`;
    const sourceRef = `chinese-poetry:${simplifiedAuthor}/${simplifiedTitle}`;
    const sourceHash = sha256Hex(JSON.stringify({ title: simplifiedTitle, author: simplifiedAuthor, lines }));

    candidates.push({
      importKey,
      source: "CHINESE_POETRY",
      sourceRef,
      sourceHash,
      ruleVersion: "raw-corpus-v1",
      id,
      type: "POEM",
      suggestedLevel: 1,
      suggestedDifficulty: 1,
      score: 0,
      tags: [],
      payload: {
        title: simplifiedTitle,
        author: simplifiedAuthor,
        lines,
        charRefs: [], // filled in later based on active character catalog
      },
    });
  }

  return { candidates, filtered: entries.length - candidates.length, rejectionReasons };
}

export function scoreAndRankCharacters(
  candidates: RawCharCandidate[],
  poemCharFreq: Map<string, number>,
  targetCount?: number,
): RawCharCandidate[] {
  const scored = candidates.map((c) => {
    let score = 0;
    // Poem frequency (log-scaled)
    const freq = poemCharFreq.get(c.payload.char) ?? 0;
    score += freq > 0 ? Math.log2(freq + 1) * 10 : 0;
    // Penalize high strokes
    score -= Math.max(0, c.payload.strokes - 8) * 0.5;
    // Penalize polyphonic
    if (c.tags.includes("polyphonic")) score -= 5;
    return { ...c, score: Math.round(score * 100) / 100 };
  });

  scored.sort((a, b) => b.score - a.score || a.payload.char.localeCompare(b.payload.char, "zh"));
  return targetCount ? scored.slice(0, targetCount) : scored;
}

export function scoreAndRankPoems(
  candidates: RawPoemCandidate[],
  activeCharIds: Set<string>,
  targetCount?: number,
): RawPoemCandidate[] {
  const scored = candidates.map((c) => {
    let score = 0;
    const text = c.payload.lines.join("");
    const chars = Array.from(text).filter(isCjkChar);
    const uniqueChars = new Set(chars);

    // Known character coverage
    const knownCount = [...uniqueChars].filter((ch) => activeCharIds.has(ch)).length;
    score += uniqueChars.size > 0 ? (knownCount / uniqueChars.size) * 50 : 0;

    // Prefer moderate length
    const len = chars.length;
    if (len >= 20 && len <= 80) score += 10;
    else if (len > 80) score -= (len - 80) * 0.1;

    // Prefer consistent line length
    const lineLengths = c.payload.lines.map((l) => Array.from(l).filter(isCjkChar).length);
    const avgLen = lineLengths.reduce((s, l) => s + l, 0) / lineLengths.length;
    const variance = lineLengths.reduce((s, l) => s + (l - avgLen) ** 2, 0) / lineLengths.length;
    score -= Math.min(variance * 0.5, 15);

    return { ...c, score: Math.round(score * 100) / 100 };
  });

  scored.sort((a, b) => b.score - a.score || a.payload.title.localeCompare(b.payload.title, "zh"));
  return targetCount ? scored.slice(0, targetCount) : scored;
}

export function scoreAndRankIdioms(
  candidates: RawIdiomCandidate[],
  activeCharIds: Set<string>,
  targetCount?: number,
): RawIdiomCandidate[] {
  const scored = candidates.map((c) => {
    let score = 0;
    // All four chars in active pool
    const chars = Array.from(c.payload.text);
    const knownCount = chars.filter((ch) => activeCharIds.has(ch)).length;
    score += knownCount * 10;

    // Meaning brevity
    if (c.payload.meaning.length <= 50) score += 5;
    else if (c.payload.meaning.length > 200) score -= 3;

    return { ...c, score: Math.round(score * 100) / 100 };
  });

  scored.sort((a, b) => b.score - a.score || a.payload.text.localeCompare(b.payload.text, "zh"));
  return targetCount ? scored.slice(0, targetCount) : scored;
}

export function deriveLevels<T extends { suggestedLevel: number; score: number }>(
  candidates: T[],
  total: number,
): T[] {
  return candidates.map((c, i) => {
    const pct = (i / total) * 100;
    let level: number;
    if (pct < 20) level = 1;
    else if (pct < 45) level = 2;
    else if (pct < 70) level = 3;
    else if (pct < 90) level = 4;
    else level = 5;
    return { ...c, suggestedLevel: level, suggestedDifficulty: level };
  });
}

export interface ReportInput {
  ruleVersion: string;
  sourceTotals: { characters: number; poems: number; idioms: number };
  filtered: { characters: number; poems: number; idioms: number };
  afterDedupe: { characters: number; poems: number; idioms: number };
  output: {
    characters: RawCharCandidate[];
    poems: RawPoemCandidate[];
    idioms: RawIdiomCandidate[];
  };
  rejectionReasons: Record<string, number>;
}

export function buildReport(input: ReportInput): RawCandidateReport {
  const byLevel: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const c of [...input.output.characters, ...input.output.poems, ...input.output.idioms]) {
    byLevel[c.suggestedLevel] = (byLevel[c.suggestedLevel] ?? 0) + 1;
  }
  return {
    ruleVersion: input.ruleVersion,
    totals: {
      sourceRecords: input.sourceTotals.characters + input.sourceTotals.poems + input.sourceTotals.idioms,
      afterFilter: input.filtered.characters + input.filtered.poems + input.filtered.idioms,
      afterDedupe: input.afterDedupe.characters + input.afterDedupe.poems + input.afterDedupe.idioms,
      output: input.output.characters.length + input.output.poems.length + input.output.idioms.length,
    },
    byType: {
      characters: {
        sourceRecords: input.sourceTotals.characters,
        afterFilter: input.filtered.characters,
        afterDedupe: input.afterDedupe.characters,
        output: input.output.characters.length,
      },
      poems: {
        sourceRecords: input.sourceTotals.poems,
        afterFilter: input.filtered.poems,
        afterDedupe: input.afterDedupe.poems,
        output: input.output.poems.length,
      },
      idioms: {
        sourceRecords: input.sourceTotals.idioms,
        afterFilter: input.filtered.idioms,
        afterDedupe: input.afterDedupe.idioms,
        output: input.output.idioms.length,
      },
    },
    byLevel,
    rejectionReasons: { ...input.rejectionReasons },
  };
}