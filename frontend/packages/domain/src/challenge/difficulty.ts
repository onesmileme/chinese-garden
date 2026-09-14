import type {
  ContentLevel,
  KnowledgePointId,
  QuestionType,
} from "@cc/content-schema";
import { corpusAtOrBelow } from "../content/levels";
import type { Corpus } from "../questions/generate";
import { canGeneratePoemMatch } from "../questions/generate";
import { findIdiomSuccessors } from "../questions/idiom-chain";
import type {
  ChallengeDimension,
  ChildDifficulty,
  ChineseChallengeConfig,
  ParentTier,
  Participant,
} from "./types";

/** 家长目标难度：标准档固定 L4，高手档固定 L5。 */
export function parentTargetDifficulty(
  _childDifficulty: ChildDifficulty,
  tier: ParentTier,
): ChildDifficulty {
  return tier === "STANDARD" ? 4 : 5;
}

export function difficultyOrderForParticipant(
  config: ChineseChallengeConfig,
  participant: Participant,
): ChildDifficulty[] {
  const target =
    participant === "PARENT"
      ? parentTargetDifficulty(config.childDifficulty, config.tier)
      : config.childDifficulty;
  const higher = Array.from(
    { length: 5 - target },
    (_, index) => (target + index + 1) as ChildDifficulty,
  );
  const lower = Array.from(
    { length: target - 1 },
    (_, index) => (target - index - 1) as ChildDifficulty,
  );
  // 家长优先出目标难度,其次向上加难,最后逐级向下兜底,让低等级语料也能凑齐;
  // 孩子仍优先目标难度,先向下兜底再向上加难。
  return participant === "PARENT"
    ? [target, ...higher, ...lower]
    : [target, ...lower, ...higher];
}

/** 某回合参与者的目标难度：孩子用 childDifficulty，家长按 tier 抬档。 */
export function difficultyForParticipant(
  config: ChineseChallengeConfig,
  participant: Participant,
): ChildDifficulty {
  return participant === "CHILD"
    ? config.childDifficulty
    : parentTargetDifficulty(config.childDifficulty, config.tier);
}

/** 维度对应的可选题型集合（诗词/成语各含复用 + 新增题型，题内混排）。 */
export function dimensionQuestionTypes(
  dimension: ChallengeDimension,
): readonly QuestionType[] {
  if (dimension === "POEM") return ["POEM_FILL", "POEM_MATCH_NEXT"];
  return ["IDIOM_CHAIN", "IDIOM_MEANING"];
}

/**
 * 指定维度、目标难度下的可出题知识点（按语料顺序，稳定）。
 * - POEM：该难度且至少两句可供上下句连连看的诗词
 * - IDIOM：该难度且存在后继的成语（成语接龙的最强约束，释义题总能生成）
 */
export function eligibleKnowledgePoints(
  dimension: ChallengeDimension,
  difficulty: ChildDifficulty,
  corpus: Corpus,
  abilityLevel: ContentLevel = 5,
): KnowledgePointId[] {
  const eligibleCorpus = corpusAtOrBelow(corpus, abilityLevel);
  if (dimension === "POEM") {
    return eligibleCorpus.poems
      .filter(
        (poem) =>
          poem.difficulty === difficulty && canGeneratePoemMatch(poem),
      )
      .map((poem) => poem.id);
  }
  return eligibleCorpus.idioms
    .filter(
      (idiom) =>
        idiom.difficulty === difficulty &&
        findIdiomSuccessors(idiom, eligibleCorpus.idioms).length > 0,
    )
    .map((idiom) => idiom.id);
}
