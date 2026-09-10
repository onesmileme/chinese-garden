import {
  asKnowledgePointId,
  characterSchema,
  contentLevelRulesSchema,
  curriculumMapSchema,
  idiomSchema,
  masteryRulesSchema,
  poemSchema,
  progressionRulesSchema,
  type LeveledManifest,
} from "@cc/content-schema";
import type { RuntimeCorpus } from "./content-loader";
import { decodeTarGzip } from "./tar-gzip";

export async function decodeContentArtifact(
  bytes: Uint8Array,
  manifest: LeveledManifest,
): Promise<RuntimeCorpus> {
  return decodeContentFiles(await decodeTarGzip(bytes), manifest);
}

export function decodeContentFiles(
  files: ReadonlyMap<string, Uint8Array>,
  manifest: LeveledManifest,
): RuntimeCorpus {
  const characterBank = readObject(files, "corpus/character-bank.json");
  const poemBank = readObject(files, "corpus/poem-bank.json");
  const idiomBank = readObject(files, "corpus/idiom-bank.json");

  requireVersion(characterBank, manifest.version);
  requireVersion(poemBank, manifest.version);
  requireVersion(idiomBank, manifest.version);
  curriculumMapSchema.parse(readObject(files, "curriculum/curriculum-v1.json"));
  const contentLevelRules = contentLevelRulesSchema.parse(
    readObject(files, "rules/content-level-v1.json"),
  );
  const masteryRules = masteryRulesSchema.parse(
    readObject(files, "rules/mastery-v1.json"),
  );
  const progressionRules = progressionRulesSchema.parse(
    readObject(files, "rules/progression-v1.json"),
  );
  if (
    contentLevelRules.ruleVersion !== manifest.contentLevelRuleVersion ||
    masteryRules.ruleVersion !== manifest.masteryRuleVersion ||
    progressionRules.ruleVersion !== manifest.progressionRuleVersion
  ) {
    throw new Error("artifact rule version mismatch");
  }

  return {
    characters: characterSchema
      .array()
      .parse(requireArray(characterBank, "characters"))
      .map((item) => ({ ...item, id: asKnowledgePointId(item.id) })),
    poems: poemSchema
      .array()
      .parse(requireArray(poemBank, "poems"))
      .map((item) => ({
        ...item,
        id: asKnowledgePointId(item.id),
        charRefs: item.charRefs?.map(asKnowledgePointId),
      })),
    idioms: idiomSchema
      .array()
      .parse(requireArray(idiomBank, "idioms"))
      .map((item) => ({ ...item, id: asKnowledgePointId(item.id) })),
  };
}

function readObject(
  files: ReadonlyMap<string, Uint8Array>,
  path: string,
): Record<string, unknown> {
  const bytes = files.get(path);
  if (bytes === undefined) throw new Error(`missing artifact path: ${path}`);
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`artifact JSON must be an object: ${path}`);
  }
  return parsed as Record<string, unknown>;
}

function requireVersion(value: Record<string, unknown>, expected: string): void {
  if (value.version !== expected) {
    throw new Error("artifact content version mismatch");
  }
}

function requireArray(
  value: Record<string, unknown>,
  field: string,
): unknown[] {
  const entries = value[field];
  if (!Array.isArray(entries)) {
    throw new Error(`artifact field must be an array: ${field}`);
  }
  return entries;
}
