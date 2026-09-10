import type { Corpus } from "./generate";
import { canGeneratePoemFill } from "./generate";
import { stripTone } from "./pinyin";

export interface CorpusIssue {
  entityId: string;
  code: string;
  message: string;
}

export function validateCorpus(corpus: Corpus): CorpusIssue[] {
  const issues: CorpusIssue[] = [];
  const add = (entityId: string, code: string, message: string) =>
    issues.push({ entityId, code, message });

  const characters = corpus.characters ?? [];
  const charById = new Map(characters.map((c) => [c.id as string, c]));

  // 唯一 id（诗库 + 成语库 + 可选字库共用知识点命名空间）
  const seen = new Set<string>();
  for (const entity of [...characters, ...corpus.poems, ...corpus.idioms]) {
    const id = entity.id as string;
    if (seen.has(id))
      add(id, "DUPLICATE_ID", `duplicate knowledge point id: ${id}`);
    seen.add(id);
  }

  for (const c of characters) {
    if (c.difficulty < 1 || c.difficulty > 5)
      add(
        c.id as string,
        "DIFFICULTY_OUT_OF_RANGE",
        `character difficulty ${c.difficulty} not in 1..5`,
      );
    // 底层 plumbing 校验：字库若存在，拼音仍需含可识别声调标记。
    if (stripTone(c.pinyin).tone === 0)
      add(
        c.id as string,
        "PINYIN_TONE_MALFORMED",
        `character pinyin "${c.pinyin}" has no recognizable tone`,
      );
  }

  for (const p of corpus.poems) {
    if (p.difficulty < 1 || p.difficulty > 5)
      add(
        p.id as string,
        "DIFFICULTY_OUT_OF_RANGE",
        `poem difficulty ${p.difficulty} not in 1..5`,
      );
    if (p.lines.length === 0)
      add(p.id as string, "POEM_EMPTY_LINES", "poem has no lines");
    if (p.lines.length > 0 && !canGeneratePoemFill(p))
      add(
        p.id as string,
        "POEM_FILL_NO_CANDIDATE",
        "poem has too few unique characters to generate POEM_FILL",
      );
    for (const ref of p.charRefs ?? []) {
      if (!charById.has(ref as string))
        add(
          p.id as string,
          "POEM_CHARREF_MISSING",
          `charRef ${ref} not found in character bank`,
        );
    }
  }

  const toneFreePinyin = /^[a-z]+$/;
  for (const idiom of corpus.idioms) {
    if (!/^\p{Script=Han}{4}$/u.test(idiom.text)) {
      add(
        idiom.id as string,
        "IDIOM_NOT_FOUR_CHARS",
        `idiom "${idiom.text}" must contain four characters`,
      );
    }
    if (
      !toneFreePinyin.test(idiom.headPinyin) ||
      !toneFreePinyin.test(idiom.tailPinyin)
    ) {
      add(
        idiom.id as string,
        "IDIOM_PINYIN_INVALID",
        "idiom chain pinyin must be lowercase and tone-free",
      );
    }
    if (idiom.difficulty < 1 || idiom.difficulty > 5) {
      add(
        idiom.id as string,
        "IDIOM_DIFFICULTY_OUT_OF_RANGE",
        `idiom difficulty ${idiom.difficulty} not in 1..5`,
      );
    }
    const hasSuccessor = corpus.idioms.some(
      (next) =>
        next.id !== idiom.id && next.headPinyin === idiom.tailPinyin,
    );
    if (!hasSuccessor) {
      add(
        idiom.id as string,
        "IDIOM_NO_SUCCESSOR",
        `idiom "${idiom.text}" has no chain successor`,
      );
    }
  }

  return issues;
}
