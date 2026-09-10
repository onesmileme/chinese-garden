# 古文乐园 · 内容 Schema 与判题契约

> 状态:草案(评审中) · 版本:v0.1 · 日期:2026-09-09
> 蓝本:`child-chinese/frontend/packages/content-schema/src/question.ts`

## 1. QuestionType(收敛 + 新增)

```ts
export type QuestionType =
  | "POEM_FILL"        // 古诗填空(复用)
  | "POEM_MATCH_NEXT"  // 上下句连连看(新增)
  | "IDIOM_CHAIN"      // 成语接龙(复用)
  | "IDIOM_MEANING";   // 成语释义辨析(新增)
```
> 移除 `CHAR_TO_PINYIN`、`CHAR_TO_TONE`。

## 2. Poem(扩展,新增字段全部可选,向后兼容)

```ts
export interface PoemAnnotation { char: string; note: string; }

export interface Poem extends ContentMetadata {
  id: KnowledgePointId;           // 前缀 sc-
  title: string;
  author: string;
  lines: string[];
  charRefs?: KnowledgePointId[];  // 由必填改为可选(去 K12)
  dynasty?: string;               // 朝代
  genre?: string;                 // 体裁(五绝/七律/词牌)
  pinyin?: string[];              // 整篇注音,按行,供小学生开关
  translation?: string;           // 白话译文
  annotations?: PoemAnnotation[]; // 重点字词注释
  appreciation?: string;          // 赏析/名句点评
}

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
    .array(z.object({ char: z.string().min(1), note: z.string().trim().min(1) }))
    .optional(),
  appreciation: z.string().trim().min(1).optional(),
  ...contentMetadataShape,
});
```

## 3. Idiom(扩展)

```ts
export interface Idiom extends ContentMetadata {
  id: KnowledgePointId;           // ^cy-[a-z0-9-]+$
  text: string;                   // 正好 4 汉字
  meaning: string;
  headPinyin: string;             // 无调,接龙首
  tailPinyin: string;             // 无调,接龙尾
  pinyin?: string;                // 完整带调拼音(展示)
  origin?: string;                // 出处/典故
  example?: string;               // 例句
  synonyms?: string[];            // 近义
  antonyms?: string[];            // 反义
}

export const idiomSchema = z.object({
  id: z.string().regex(/^cy-[a-z0-9-]+$/),
  text: z.string().regex(/^\p{Script=Han}{4}$/u),
  meaning: z.string().trim().min(1),
  headPinyin: z.string().regex(/^[a-z]+$/),
  tailPinyin: z.string().regex(/^[a-z]+$/),
  pinyin: z.string().trim().min(1).optional(),
  origin: z.string().trim().min(1).optional(),
  example: z.string().trim().min(1).optional(),
  synonyms: z.array(z.string().min(1)).optional(),
  antonyms: z.array(z.string().min(1)).optional(),
  ...contentMetadataShape,
});
```

## 4. Corpus 三元组改造

```ts
// 原: { characters, poems, idioms }
export interface Corpus {
  poems: Poem[];
  idioms: Idiom[];
  characters?: Character[]; // 去 K12 后可选,默认 []
}
```
影响点:`domain/questions/generate.ts`、`content/levels.ts`(`corpusAtOrBelow`)、`content/src/index.ts`、`content-cli/src/model.ts`、后端 content 模块。POEM_FILL 候选字取自诗句本身,无需 characters。

## 5. 新题型判题契约(TS 与 Java 双端复算)

### POEM_MATCH_NEXT(上下句连连看)
- **生成**:选定诗 `p`,随机取相邻两句 `lines[i]`(prompt)与 `lines[i+1]`(正确答案);干扰项从**其它诗**的诗句中 `seededShuffle` 取 3 条,去重。
- **答案**:`correctAnswer = lines[i+1]`;`options = seededShuffle([correct, ...3 干扰])`。
- **判题**:`chosenAnswer === correctAnswer`(纯查表,seed 决定选句与干扰)。
- **生成前提**:`canGeneratePoemMatch(poem)` 要求 `lines.length >= 2`。

### IDIOM_MEANING(成语释义辨析)
- **生成**:成语 `s`,prompt = `s.text`;`correctAnswer = s.meaning`;干扰项取**同难度其它成语的 meaning** `seededShuffle` 3 条(不足时放宽到全部成语)。
- **判题**:`chosenAnswer === correctAnswer`。

### 保留契约(不变)
- `POEM_FILL`:`serializePoemFill` → `index=字|index=字`;`isPoemFillCorrect` 每空匹配。
- `IDIOM_CHAIN`:`findIdiomSuccessors` 以 `headPinyin===tailPinyin` 匹配;`generateIdiomChainCandidates`。
- 种子:`makeSeededRng(`${type}:${kpId}:${seed}`)`。

## 6. 黄金向量(test-vectors/questions.json)

为 4 种题型各补充确定性向量:给定 `(type, kpId, seed, corpus 版本)` → 期望的 `prompt/options/correctAnswer`。TS 单测与 Java 集成测试同时消费,保证 `contentVersion` 下 TS/Java 判题零漂移。

## 7. content-level 规则调整(rules/content-level-v1.json)

移除 `characters` 门槛,保留 `poems` 与 `chainableIdioms`(可再加 `meaningfulIdioms`/`matchablePoems`):

```json
{
  "ruleVersion": "content-level-v1",
  "minimumCumulativeContent": {
    "1": { "poems": 1, "chainableIdioms": 8 },
    "3": { "poems": 6, "chainableIdioms": 20 },
    "5": { "poems": 15, "chainableIdioms": 40 }
  }
}
```
