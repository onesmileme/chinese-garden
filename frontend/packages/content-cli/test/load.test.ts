import { describe, expect, it } from "vitest";
import { loadBundle } from "../src/load";
import type { FileSystemPort } from "../src/ports";

const json = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value));

function fs(files: Record<string, unknown>): FileSystemPort {
  return {
    async readFile(path) {
      const value = files[path];
      if (value === undefined) throw new Error(`ENOENT ${path}`);
      return json(value);
    },
    async readJsonDir(dir) {
      return Object.entries(files)
        .filter(([path]) => path.startsWith(`${dir}/`))
        .map(([path, value]) => ({
          name: path.slice(dir.length + 1),
          json: value,
        }));
    },
    async exists(path) {
      return files[path] !== undefined;
    },
    async writeFile() {
      throw new Error("not used");
    },
  };
}

describe("loadBundle", () => {
  it("loads every test vector and preserves questions as the version source", async () => {
    const bundle = await loadBundle(
      fs({
        "content/corpus/character-bank.json": {
          version: "corpus-v1",
          characters: [],
        },
        "content/corpus/poem-bank.json": { version: "corpus-v1", poems: [] },
        "content/corpus/idiom-bank.json": {
          version: "corpus-v1",
          idioms: [
            {
              id: "cy-madaochenggong",
              text: "马到成功",
              meaning: "事情顺利，很快取得成功",
              headPinyin: "ma",
              tailPinyin: "gong",
              difficulty: 1,
            },
          ],
        },
        "content/rules/mastery-v1.json": { ruleVersion: "mastery-v1" },
        "content/rules/progression-v1.json": { ruleVersion: "progression-v1" },
        "content/rules/content-level-v1.json": {
          ruleVersion: "content-level-v1",
          minimumCumulativeContent: {
            "1": { characters: 10, poems: 1, chainableIdioms: 8 },
            "2": { characters: 20, poems: 3, chainableIdioms: 15 },
            "3": { characters: 40, poems: 6, chainableIdioms: 20 },
            "4": { characters: 60, poems: 10, chainableIdioms: 30 },
            "5": { characters: 80, poems: 15, chainableIdioms: 40 },
          },
        },
        "content/test-vectors/questions.json": {
          contentVersion: "corpus-v1",
          cases: [],
        },
        "content/test-vectors/assessment.json": { cases: [] },
        "content/test-vectors/mastery.json": { ruleVersion: "mastery-v1" },
        "content/test-vectors/progression.json": {
          ruleVersion: "progression-v1",
        },
      }),
      "content",
      "mastery-v1",
      "content-level-v1",
    );

    expect(bundle.characterBank.version).toBe("corpus-v1");
    expect(bundle.idiomBank.idioms).toEqual([
      expect.objectContaining({ id: "cy-madaochenggong" }),
    ]);
    expect(bundle.progressionRules.ruleVersion).toBe("progression-v1");
    expect(bundle.contentLevelRules.ruleVersion).toBe("content-level-v1");
    expect(Object.keys(bundle.testVectors).sort()).toEqual([
      "assessment.json",
      "mastery.json",
      "progression.json",
      "questions.json",
    ]);
    expect(bundle.questionsVector).toBe(bundle.testVectors["questions.json"]);
  });

  it("fails before validation when a required file is absent", async () => {
    await expect(
      loadBundle(fs({}), "content", "mastery-v1", "content-level-v1"),
    ).rejects.toThrow("character-bank.json");
  });

  it("fails when questions.json is absent from the vector directory", async () => {
    await expect(
      loadBundle(
        fs({
          "content/corpus/character-bank.json": {
            version: "corpus-v1",
            characters: [],
          },
          "content/corpus/poem-bank.json": {
            version: "corpus-v1",
            poems: [],
          },
          "content/corpus/idiom-bank.json": {
            version: "corpus-v1",
            idioms: [],
          },
          "content/rules/mastery-v1.json": { ruleVersion: "mastery-v1" },
          "content/rules/progression-v1.json": {
            ruleVersion: "progression-v1",
          },
          "content/rules/content-level-v1.json": {
            ruleVersion: "content-level-v1",
            minimumCumulativeContent: {
              "1": { characters: 10, poems: 1, chainableIdioms: 8 },
              "2": { characters: 20, poems: 3, chainableIdioms: 15 },
              "3": { characters: 40, poems: 6, chainableIdioms: 20 },
              "4": { characters: 60, poems: 10, chainableIdioms: 30 },
              "5": { characters: 80, poems: 15, chainableIdioms: 40 },
            },
          },
          "content/test-vectors/mastery.json": {
            ruleVersion: "mastery-v1",
          },
        }),
        "content",
        "mastery-v1",
        "content-level-v1",
      ),
    ).rejects.toThrow("questions.json");
  });
});
