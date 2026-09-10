import type { KnowledgePointId, QuestionType } from "@cc/content-schema";
import { corpusAtOrBelow } from "../content/levels";
import {
  generateQuestion,
  type Corpus,
  type GeneratedQuestion,
} from "../questions/generate";
import {
  makeSeededRng,
  seededShuffle,
} from "../questions/deterministic-random";
import {
  difficultyOrderForParticipant,
  dimensionQuestionTypes,
  eligibleKnowledgePoints,
  parentTargetDifficulty,
} from "./difficulty";
import type {
  ChallengeDimension,
  ChildDifficulty,
  ChineseChallengeConfig,
  Participant,
} from "./types";

export interface ChallengeDeckEntry {
  knowledgePointId: KnowledgePointId;
  questionType: QuestionType;
  questionSeed: string;
}

function compareById(left: { id: string }, right: { id: string }): number {
  if (left.id < right.id) return -1;
  if (left.id > right.id) return 1;
  return 0;
}

export function generateChallengeQuestion(
  entry: ChallengeDeckEntry,
  corpus: Corpus,
  abilityLevel: ChineseChallengeConfig["abilityLevel"] = 5,
): GeneratedQuestion {
  const leveledCorpus = corpusAtOrBelow(corpus, abilityLevel);
  const stableCorpus: Corpus = {
    poems: [...leveledCorpus.poems].sort(compareById),
    idioms: [...leveledCorpus.idioms].sort(compareById),
  };
  return generateQuestion(
    entry.questionType,
    entry.knowledgePointId,
    stableCorpus,
    entry.questionSeed,
  );
}

export class ChallengeCapacityError extends RangeError {
  constructor(
    readonly participant: Participant,
    readonly required: number,
    readonly available: number,
  ) {
    super(
      `challenge requires ${required} unique questions: ${participant}:${available}`,
    );
  }
}

function canGenerate(
  entry: ChallengeDeckEntry,
  corpus: Corpus,
): boolean {
  try {
    generateChallengeQuestion(entry, corpus);
    return true;
  } catch {
    return false;
  }
}

export function buildChallengeDeck(
  challengeId: string,
  config: ChineseChallengeConfig,
  participant: Participant,
  corpus: Corpus,
): ChallengeDeckEntry[] {
  const leveledCorpus = corpusAtOrBelow(corpus, config.abilityLevel);
  const entries: ChallengeDeckEntry[] = [];
  const used = new Set<KnowledgePointId>();
  const types = dimensionQuestionTypes(config.dimension);

  for (const level of difficultyOrderForParticipant(config, participant)) {
    const ids = [
      ...new Set(
        eligibleKnowledgePoints(
          config.dimension,
          level,
          leveledCorpus,
          config.abilityLevel,
        ),
      ),
    ].sort();
    const shuffled = seededShuffle(
      ids,
      makeSeededRng(
        `${challengeId}:${participant}:${config.dimension}:${level}`,
      ),
    );
    for (const knowledgePointId of shuffled) {
      if (used.has(knowledgePointId)) continue;
      const questionSeed = `${challengeId}:${participant}:${entries.length}`;
      const offset = entries.length % types.length;
      const orderedTypes = [
        ...types.slice(offset),
        ...types.slice(0, offset),
      ];
      const questionType = orderedTypes.find((candidate) =>
        canGenerate(
          {
            knowledgePointId,
            questionType: candidate,
            questionSeed,
          },
          leveledCorpus,
        ),
      );
      if (!questionType) continue;
      used.add(knowledgePointId);
      entries.push({ knowledgePointId, questionType, questionSeed });
    }
  }
  return entries;
}

export interface AdaptedChineseChallenge {
  dimension: ChallengeDimension;
  childDifficulty: ChildDifficulty;
  parentDifficulty: ChildDifficulty;
  childCapacity: number;
  parentCapacity: number;
}

export function adaptChineseChallenge(
  config: ChineseChallengeConfig,
  corpus: Corpus,
  challengeId = "challenge-probe",
): AdaptedChineseChallenge {
  const childCapacity = buildChallengeDeck(
    challengeId,
    config,
    "CHILD",
    corpus,
  ).length;
  const parentCapacity = buildChallengeDeck(
    challengeId,
    config,
    "PARENT",
    corpus,
  ).length;
  if (config.mode === "FIXED_RACE") {
    if (childCapacity < config.questionCount) {
      throw new ChallengeCapacityError(
        "CHILD",
        config.questionCount,
        childCapacity,
      );
    }
    if (parentCapacity < config.questionCount) {
      throw new ChallengeCapacityError(
        "PARENT",
        config.questionCount,
        parentCapacity,
      );
    }
  } else if (childCapacity === 0 || parentCapacity === 0) {
    throw new RangeError(
      `challenge dimension is not usable: ${config.dimension}`,
    );
  }
  return {
    dimension: config.dimension,
    childDifficulty: config.childDifficulty,
    parentDifficulty: parentTargetDifficulty(
      config.childDifficulty,
      config.tier,
    ),
    childCapacity,
    parentCapacity,
  };
}

const ALL_DIMENSIONS: readonly ChallengeDimension[] = ["POEM", "IDIOM"];

export function availableChallengeDimensions(
  childDifficulty: ChildDifficulty,
  corpus: Corpus,
  abilityLevel: ChineseChallengeConfig["abilityLevel"] = 5,
): ChallengeDimension[] {
  return ALL_DIMENSIONS.filter((dimension) => {
    try {
      adaptChineseChallenge(
        {
          mode: "TIMED",
          tier: "STANDARD",
          dimension,
          childDifficulty,
          abilityLevel,
          durationMs: 0,
          questionCount: 0,
          contentVersion: "",
          ruleVersion: "",
        },
        corpus,
        `challenge-availability:${dimension}`,
      );
      return true;
    } catch {
      return false;
    }
  });
}
