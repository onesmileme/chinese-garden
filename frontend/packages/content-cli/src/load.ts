import type {
  CharacterBank,
  ContentBundle,
  IdiomBank,
  PoemBank,
} from "./model";
import type { FileSystemPort } from "./ports";

async function requiredJson<T>(
  fs: FileSystemPort,
  path: string,
): Promise<T> {
  if (!(await fs.exists(path))) {
    throw new Error(`required content file missing: ${path}`);
  }

  return JSON.parse(
    new TextDecoder().decode(await fs.readFile(path)),
  ) as T;
}

export async function loadBundle(
  fs: FileSystemPort,
  contentRoot: string,
  masteryRuleVersion: string,
  contentLevelRuleVersion: string,
): Promise<ContentBundle> {
  const progressionRuleVersion = "progression-v1";
  const characterBank = await requiredJson<CharacterBank>(
    fs,
    `${contentRoot}/corpus/character-bank.json`,
  );
  const poemBank = await requiredJson<PoemBank>(
    fs,
    `${contentRoot}/corpus/poem-bank.json`,
  );
  const idiomBank = await requiredJson<IdiomBank>(
    fs,
    `${contentRoot}/corpus/idiom-bank.json`,
  );
  const masteryRules = await requiredJson<ContentBundle["masteryRules"]>(
    fs,
    `${contentRoot}/rules/${masteryRuleVersion}.json`,
  );
  const progressionRules =
    await requiredJson<ContentBundle["progressionRules"]>(
    fs,
    `${contentRoot}/rules/${progressionRuleVersion}.json`,
  );
  const contentLevelRules =
    await requiredJson<ContentBundle["contentLevelRules"]>(
      fs,
      `${contentRoot}/rules/${contentLevelRuleVersion}.json`,
    );
  const testVectors = Object.fromEntries(
    (await fs.readJsonDir(`${contentRoot}/test-vectors`)).map(
      ({ name, json }) => [name, json],
    ),
  );
  const questionsVector = testVectors["questions.json"];
  if (questionsVector === undefined) {
    throw new Error(
      `required content file missing: ${contentRoot}/test-vectors/questions.json`,
    );
  }

  return {
    characterBank,
    poemBank,
    idiomBank,
    masteryRules,
    progressionRules,
    contentLevelRules,
    questionsVector: questionsVector as ContentBundle["questionsVector"],
    testVectors,
  };
}
