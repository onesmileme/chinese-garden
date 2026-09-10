import { z } from "zod";
import { characterSchema, idiomSchema, poemSchema } from "@cc/content-schema";
import type { ContentLevel } from "@cc/content-schema";

export type ImportedCharacter = z.infer<typeof characterSchema>;
export type ImportedPoem = z.infer<typeof poemSchema>;
export type ImportedIdiom = z.infer<typeof idiomSchema>;

/**
 * Strip tone marks from a single pinyin syllable and lowercase it, mapping the
 * "ü" family to the ASCII digraph "v" so ids and tone-free fields stay within
 * `[a-z]`. The importer only normalizes; it never invents readings.
 */
export function toneFreeSyllable(syllable: string): string {
  const toneMap: Record<string, string> = {
    ā: "a", á: "a", ǎ: "a", à: "a",
    ē: "e", é: "e", ě: "e", è: "e",
    ī: "i", í: "i", ǐ: "i", ì: "i",
    ō: "o", ó: "o", ǒ: "o", ò: "o",
    ū: "u", ú: "u", ǔ: "u", ù: "u",
    ǖ: "v", ǘ: "v", ǚ: "v", ǜ: "v", ü: "v",
  };
  return Array.from(syllable.trim().toLowerCase())
    .map((ch) => toneMap[ch] ?? ch)
    .join("");
}

type Level = ContentLevel;

export interface CharacterSource {
  type: "characters";
  level: Level;
  items: CharacterSourceItem[];
}

export interface CharacterSourceItem {
  char: string;
  pinyin: string;
  strokes: number;
  theme: string;
  difficulty?: Level;
  promotionRequired?: boolean;
  imageId?: string;
  source?: string;
  sourceRef?: string;
}

export interface PoemSource {
  type: "poems";
  level: Level;
  items: PoemSourceItem[];
}

export interface PoemSourceItem {
  id: string;
  title: string;
  author: string;
  lines: string[];
  charRefs?: string[];
  difficulty?: Level;
  promotionRequired?: boolean;
  source?: string;
  sourceRef?: string;
}

export interface IdiomSource {
  type: "idioms";
  level: Level;
  items: IdiomSourceItem[];
}

export interface IdiomSourceItem {
  text: string;
  meaning: string;
  pinyin: string;
  difficulty?: Level;
  promotionRequired?: boolean;
  source?: string;
  sourceRef?: string;
}

export interface CatalogCharacter {
  id: string;
  char: string;
  level: number;
  status: string;
}

export interface CatalogIdiom {
  id: string;
  headPinyin: string;
  tailPinyin: string;
  level: number;
  status: string;
}

/**
 * A referential-integrity problem found while importing. These mirror the
 * publish-time gate (see content-cli `validate.ts`) so bad source data is
 * caught up front instead of at release time. An import that produces issues
 * must not be staged.
 */
export interface ImportIssue {
  entityId: string;
  code: string;
  message: string;
}

export interface ImportResult<T> {
  items: T[];
  skipped: string[];
  issues: ImportIssue[];
}

interface BaseOptions {
  existingIds?: Set<string>;
}

interface PoemOptions extends BaseOptions {
  catalog: CatalogCharacter[];
}

interface IdiomOptions extends BaseOptions {
  idiomCatalog?: CatalogIdiom[];
}

function fullPinyin(pinyin: string): string {
  return Array.from(pinyin.trim())
    .map((ch) => toneFreeSyllable(ch))
    .join("");
}

export function importCharacters(
  source: CharacterSource,
  options: BaseOptions = {},
): ImportResult<ImportedCharacter> {
  const seen = new Set(options.existingIds ?? []);
  const items: ImportedCharacter[] = [];
  const skipped: string[] = [];
  for (const raw of source.items) {
    const id = `hz-${fullPinyin(raw.pinyin)}-${raw.char}`;
    if (seen.has(id)) {
      skipped.push(id);
      continue;
    }
    seen.add(id);
    const character = characterSchema.parse({
      id,
      char: raw.char,
      pinyin: raw.pinyin,
      imageId: raw.imageId ?? `img-${raw.char}`,
      theme: raw.theme,
      strokes: raw.strokes,
      level: source.level,
      difficulty: raw.difficulty ?? source.level,
      promotionRequired: raw.promotionRequired ?? true,
      status: "DRAFT",
      tags: [],
      revision: 1,
    });
    items.push(character);
  }
  return { items, skipped, issues: [] };
}

export function importPoems(
  source: PoemSource,
  options: PoemOptions,
): ImportResult<ImportedPoem> {
  const seen = new Set(options.existingIds ?? []);
  const items: ImportedPoem[] = [];
  const skipped: string[] = [];
  const issues: ImportIssue[] = [];
  const catalogById = new Map(options.catalog.map((c) => [c.id, c]));
  for (const raw of source.items) {
    if (seen.has(raw.id)) {
      skipped.push(raw.id);
      continue;
    }
    seen.add(raw.id);
    const text = raw.lines.join("");
    const charRefs =
      raw.charRefs ??
      options.catalog
        .filter(
          (c) =>
            c.status === "ACTIVE" &&
            c.level <= source.level &&
            text.includes(c.char),
        )
        .map((c) => c.id);
    // Auto-derived refs are already ACTIVE + in-level; only explicit overrides
    // can violate the invariants, so validate against the catalog either way.
    if (raw.charRefs !== undefined) {
      for (const ref of raw.charRefs) {
        const character = catalogById.get(ref);
        if (character?.status !== "ACTIVE") {
          issues.push({
            entityId: raw.id,
            code: "POEM_CHAR_REF_MISSING",
            message: `charRef ${ref} not found in active character catalog`,
          });
        } else if (character.level > source.level) {
          issues.push({
            entityId: raw.id,
            code: "POEM_CHAR_LEVEL_TOO_HIGH",
            message: `charRef ${ref} level ${character.level} exceeds poem level ${source.level}`,
          });
        }
      }
    }
    const poem = poemSchema.parse({
      id: raw.id,
      title: raw.title,
      author: raw.author,
      lines: raw.lines,
      charRefs,
      level: source.level,
      difficulty: raw.difficulty ?? source.level,
      promotionRequired: raw.promotionRequired ?? true,
      status: "DRAFT",
      tags: [],
      revision: 1,
    });
    items.push(poem);
  }
  return { items, skipped, issues };
}

export function importIdioms(
  source: IdiomSource,
  options: IdiomOptions = {},
): ImportResult<ImportedIdiom> {
  const seen = new Set(options.existingIds ?? []);
  const items: ImportedIdiom[] = [];
  const skipped: string[] = [];
  for (const raw of source.items) {
    const chars = Array.from(raw.text);
    if (chars.length !== 4) {
      throw new Error(`idiom text must be four Han characters: ${raw.text}`);
    }
    const syllables = raw.pinyin.trim().split(/\s+/);
    if (syllables.length !== 4) {
      throw new Error(
        `idiom pinyin must have four syllables: ${raw.pinyin}`,
      );
    }
    const toneFree = syllables.map((s) => toneFreeSyllable(s));
    const id = `cy-${toneFree.join("")}`;
    if (seen.has(id)) {
      skipped.push(id);
      continue;
    }
    seen.add(id);
    const idiom = idiomSchema.parse({
      id,
      text: raw.text,
      meaning: raw.meaning,
      headPinyin: toneFree[0],
      tailPinyin: toneFree[3],
      level: source.level,
      difficulty: raw.difficulty ?? source.level,
      promotionRequired: raw.promotionRequired ?? true,
      status: "DRAFT",
      tags: [],
      revision: 1,
    });
    items.push(idiom);
  }
  // Chain closure mirrors the publish gate: an idiom whose tail sound is a head
  // sound somewhere in the pool must have at least one ACTIVE successor at or
  // below its level. A tail no other idiom starts from is a valid chain end.
  // Imported items count as ACTIVE-to-be so a batch can be self-sufficient.
  const pool: CatalogIdiom[] = [
    ...(options.idiomCatalog ?? []),
    ...items.map((i) => ({
      id: i.id as string,
      headPinyin: i.headPinyin,
      tailPinyin: i.tailPinyin,
      level: i.level,
      status: "ACTIVE",
    })),
  ];
  const issues: ImportIssue[] = [];
  for (const idiom of items) {
    const matchingSuccessors = pool.filter(
      (candidate) =>
        candidate.id !== (idiom.id as string) &&
        candidate.headPinyin === idiom.tailPinyin,
    );
    if (
      matchingSuccessors.length > 0 &&
      !matchingSuccessors.some(
        (candidate) =>
          candidate.status === "ACTIVE" && candidate.level <= idiom.level,
      )
    ) {
      issues.push({
        entityId: idiom.id as string,
        code: "IDIOM_CHAIN_BROKEN_AT_LEVEL",
        message: `idiom "${idiom.text}" has no active chain successor at or below level ${idiom.level}`,
      });
    }
  }
  return { items, skipped, issues };
}
