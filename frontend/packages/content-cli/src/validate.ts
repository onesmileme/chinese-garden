import {
  characterSchema,
  contentLevelRulesSchema,
  idiomSchema,
  masteryRulesSchema,
  poemSchema,
  progressionRulesSchema,
  type Character,
  type Idiom,
  type Poem,
} from "@cc/content-schema";
import { validateCorpus } from "@cc/domain";
import type { ZodIssue } from "zod";
import type {
  ContentBundle,
  PublishOptions,
  ValidationIssue,
} from "./model";

function zodMessage(issues: ZodIssue[]): string {
  return issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
}

function stableCorpusIssueCode(code: string): string {
  switch (code) {
    case "DUPLICATE_ID":
      return "CONTENT_ID_DUPLICATE";
    case "POEM_CHARREF_MISSING":
      return "POEM_CHAR_REF_MISSING";
    case "IDIOM_NO_SUCCESSOR":
      return "IDIOM_CHAIN_BROKEN_AT_LEVEL";
    default:
      return code;
  }
}

export function validateBundle(
  bundle: ContentBundle,
  options: PublishOptions,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const characters: Character[] = [];
  const poems: Poem[] = [];
  const idioms: Idiom[] = [];

  for (const [index, value] of bundle.characterBank.characters.entries()) {
    const parsed = characterSchema.safeParse(value);
    if (parsed.success) {
      characters.push(parsed.data as unknown as Character);
      continue;
    }
    issues.push({
      stage: "SCHEMA",
      path: `corpus/character-bank.json.characters[${index}]`,
      code: "SCHEMA_INVALID",
      message: zodMessage(parsed.error.issues),
    });
  }

  for (const [index, value] of bundle.poemBank.poems.entries()) {
    const parsed = poemSchema.safeParse(value);
    if (parsed.success) {
      poems.push(parsed.data as unknown as Poem);
      continue;
    }
    issues.push({
      stage: "SCHEMA",
      path: `corpus/poem-bank.json.poems[${index}]`,
      code: "SCHEMA_INVALID",
      message: zodMessage(parsed.error.issues),
    });
  }

  for (const [index, value] of bundle.idiomBank.idioms.entries()) {
    const parsed = idiomSchema.safeParse(value);
    if (parsed.success) {
      idioms.push(parsed.data as unknown as Idiom);
      continue;
    }
    issues.push({
      stage: "SCHEMA",
      path: `corpus/idiom-bank.json.idioms[${index}]`,
      code: "SCHEMA_INVALID",
      message: zodMessage(parsed.error.issues),
    });
  }

  const mastery = masteryRulesSchema.safeParse(bundle.masteryRules);
  if (!mastery.success) {
    issues.push({
      stage: "SCHEMA",
      path: "rules/mastery.json",
      code: "SCHEMA_INVALID",
      message: zodMessage(mastery.error.issues),
    });
  }

  const progression = progressionRulesSchema.safeParse(bundle.progressionRules);
  if (!progression.success) {
    issues.push({
      stage: "SCHEMA",
      path: "rules/progression.json",
      code: "SCHEMA_INVALID",
      message: zodMessage(progression.error.issues),
    });
  }

  const contentLevel = contentLevelRulesSchema.safeParse(
    bundle.contentLevelRules,
  );
  if (!contentLevel.success) {
    issues.push({
      stage: "SCHEMA",
      path: "rules/content-level-v1.json",
      code: "SCHEMA_INVALID",
      message: zodMessage(contentLevel.error.issues),
    });
  }

  if (issues.length === 0) {
    for (const issue of validateCorpus({ characters, poems, idioms })) {
      issues.push({
        stage: "CORPUS",
        path: issue.entityId,
        code: stableCorpusIssueCode(issue.code),
        message: issue.message,
      });
    }

    const charactersById = new Map(
      characters.map((character) => [character.id as string, character]),
    );
    for (const poem of poems) {
      for (const reference of poem.charRefs ?? []) {
        const character = charactersById.get(reference as string);
        if (character?.status !== "ACTIVE") {
          if (character) {
            issues.push({
              stage: "CORPUS",
              path: poem.id as string,
              code: "POEM_CHAR_REF_MISSING",
              message: `charRef ${reference} not found in active character bank`,
            });
          }
        } else if (character.level > poem.level) {
          issues.push({
            stage: "CORPUS",
            path: poem.id as string,
            code: "POEM_CHAR_LEVEL_TOO_HIGH",
            message: `charRef ${reference} level exceeds poem level`,
          });
        }
      }
    }

    for (const source of idioms) {
      const matchingSuccessors = idioms.filter(
        (candidate) =>
          candidate.id !== source.id &&
          candidate.headPinyin === source.tailPinyin,
      );
      if (
        matchingSuccessors.length > 0 &&
        !matchingSuccessors.some(
          (candidate) =>
            candidate.status === "ACTIVE" && candidate.level <= source.level,
        )
      ) {
        issues.push({
          stage: "CORPUS",
          path: source.id as string,
          code: "IDIOM_CHAIN_BROKEN_AT_LEVEL",
          message: "idiom has no active chain successor at or below its level",
        });
      }
    }

    const activeCharacters = characters.filter(
      (character) => character.status === "ACTIVE",
    );
    const activePoems = poems.filter((poem) => poem.status === "ACTIVE");
    const activeIdioms = idioms.filter((idiom) => idiom.status === "ACTIVE");
    for (const level of [1, 2, 3, 4, 5] as const) {
      const includedIdioms = activeIdioms.filter(
        (idiom) => idiom.level <= level,
      );
      const actual = {
        characters: activeCharacters.filter(
          (character) => character.level <= level,
        ).length,
        poems: activePoems.filter((poem) => poem.level <= level).length,
        chainableIdioms: includedIdioms.filter((source) =>
          includedIdioms.some(
            (candidate) =>
              candidate.id !== source.id &&
              candidate.headPinyin === source.tailPinyin,
          ),
        ).length,
      };
      const minimum =
        bundle.contentLevelRules.minimumCumulativeContent[`${level}`];
      if (
        actual.characters < minimum.characters ||
        actual.poems < minimum.poems ||
        actual.chainableIdioms < minimum.chainableIdioms
      ) {
        issues.push({
          stage: "CORPUS",
          path: `level/${level}`,
          code: "LEVEL_CONTENT_INSUFFICIENT",
          message:
            `level ${level} cumulative content is insufficient: ` +
            `actual ${JSON.stringify(actual)}, minimum ${JSON.stringify(minimum)}`,
        });
      }
    }
  }

  const contentVersions = [
    bundle.characterBank.version,
    bundle.poemBank.version,
    bundle.idiomBank.version,
    bundle.questionsVector.contentVersion,
  ];
  if (contentVersions.some((version) => version !== options.version)) {
    issues.push({
      stage: "VERSION",
      path: "corpus + test-vectors/questions.json",
      code: "CONTENT_VERSION_MISMATCH",
      message: `expected ${options.version}, got ${contentVersions.join(", ")}`,
    });
  }

  if (bundle.masteryRules.ruleVersion !== options.ruleVersion) {
    issues.push({
      stage: "VERSION",
      path: "rules/mastery-v*.json",
      code: "RULE_VERSION_MISMATCH",
      message: `expected ${options.ruleVersion}, got ${bundle.masteryRules.ruleVersion}`,
    });
  }

  if (
    bundle.contentLevelRules.ruleVersion !== options.contentLevelRuleVersion
  ) {
    issues.push({
      stage: "VERSION",
      path: "rules/content-level-v1.json",
      code: "CONTENT_LEVEL_RULE_VERSION_MISMATCH",
      message: `expected ${options.contentLevelRuleVersion}, got ${bundle.contentLevelRules.ruleVersion}`,
    });
  }

  if (
    typeof bundle.progressionRules.ruleVersion !== "string" ||
    bundle.progressionRules.ruleVersion.trim() === ""
  ) {
    issues.push({
      stage: "VERSION",
      path: "rules/progression-v*.json",
      code: "PROGRESSION_RULE_VERSION_MISSING",
      message: "progression ruleVersion is required",
    });
  }

  return issues;
}
