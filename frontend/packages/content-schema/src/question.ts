import { z } from "zod";
import type { KnowledgePointId } from "./ids";

export type ThemeId = string;

export const contentLevelSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
export type ContentLevel = z.infer<typeof contentLevelSchema>;

export const contentStatusSchema = z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]);
export type ContentStatus = z.infer<typeof contentStatusSchema>;

export interface ContentMetadata {
  level: ContentLevel;
  difficulty: ContentLevel;
  promotionRequired: boolean;
  status: ContentStatus;
  tags: string[];
  revision: number;
}

const contentMetadataShape = {
  level: contentLevelSchema,
  difficulty: contentLevelSchema,
  promotionRequired: z.boolean(),
  status: contentStatusSchema,
  tags: z.array(z.string().trim().min(1)),
  revision: z.number().int().positive(),
} as const;

// 古文乐园题型：仅诗词与成语，去除 K12（识字/拼音）题型。
export type QuestionType =
  | "POEM_FILL" // 古诗填空（复用）
  | "POEM_MATCH_NEXT" // 上下句连连看（新增）
  | "IDIOM_CHAIN" // 成语接龙（复用）
  | "IDIOM_MEANING"; // 成语释义辨析（新增）

/** 诗词重点字词注释。 */
export interface PoemAnnotation {
  char: string;
  note: string;
}

/**
 * 汉字识字实体：古文乐园产品面不使用（无识字/拼音玩法），
 * 仅作为内容管线/后端契约的底层 plumbing 保留，Corpus.characters 默认空。
 */
export interface Character extends ContentMetadata {
  id: KnowledgePointId;
  char: string;
  pinyin: string;
  imageId: string;
  theme: ThemeId;
  strokes: number;
}

export interface Idiom extends ContentMetadata {
  id: KnowledgePointId;
  text: string;
  meaning: string;
  headPinyin: string;
  tailPinyin: string;
  // 以下为面向成人的扩展字段，全部可选，向后兼容（zod optional → 值可为 undefined）。
  pinyin?: string | undefined; // 完整带调拼音（展示）
  origin?: string | undefined; // 出处/典故
  example?: string | undefined; // 例句
  synonyms?: string[] | undefined; // 近义
  antonyms?: string[] | undefined; // 反义
}

export interface Poem extends ContentMetadata {
  id: KnowledgePointId;
  title: string;
  author: string;
  lines: string[];
  charRefs?: KnowledgePointId[] | undefined; // 去 K12 后由必填改为可选
  // 以下为鉴赏扩展字段，全部可选，向后兼容（zod optional → 值可为 undefined）。
  dynasty?: string | undefined; // 朝代
  genre?: string | undefined; // 体裁（五绝/七律/词牌）
  pinyin?: string[] | undefined; // 整篇注音，按行，供小学生开关
  translation?: string | undefined; // 白话译文
  annotations?: PoemAnnotation[] | undefined; // 重点字词注释
  appreciation?: string | undefined; // 赏析/名句点评
}

export const questionTypeSchema = z.enum([
  "POEM_FILL",
  "POEM_MATCH_NEXT",
  "IDIOM_CHAIN",
  "IDIOM_MEANING",
]);

// 底层 plumbing：识字实体校验保留，供内容管线/后端契约使用（产品面不出题）。
export const characterSchema = z.object({
  id: z.string().min(1),
  char: z.string().min(1),
  pinyin: z.string().min(1),
  imageId: z.string().min(1),
  theme: z.string().min(1),
  strokes: z.number().int().positive(),
  ...contentMetadataShape,
});

export const poemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  author: z.string().min(1),
  lines: z.array(z.string().min(1)).min(1),
  charRefs: z.array(z.string().min(1)).optional(),
  dynasty: z.string().trim().min(1).optional(),
  genre: z.string().trim().min(1).optional(),
  pinyin: z.array(z.string()).optional(),
  translation: z.string().trim().min(1).optional(),
  annotations: z
    .array(
      z.object({
        char: z.string().min(1),
        note: z.string().trim().min(1),
      }),
    )
    .optional(),
  appreciation: z.string().trim().min(1).optional(),
  ...contentMetadataShape,
});

const toneFreePinyin = /^[a-z]+$/;

export const idiomSchema = z.object({
  id: z.string().regex(/^cy-[a-z0-9-]+$/),
  text: z.string().regex(/^\p{Script=Han}{4}$/u, {
    message: "idiom must contain exactly four Chinese characters",
  }),
  meaning: z.string().trim().min(1),
  headPinyin: z.string().regex(toneFreePinyin),
  tailPinyin: z.string().regex(toneFreePinyin),
  pinyin: z.string().trim().min(1).optional(),
  origin: z.string().trim().min(1).optional(),
  example: z.string().trim().min(1).optional(),
  synonyms: z.array(z.string().min(1)).optional(),
  antonyms: z.array(z.string().min(1)).optional(),
  ...contentMetadataShape,
});
