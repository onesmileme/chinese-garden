import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { describe, expect, it } from "vitest";
import { extract } from "tar-stream";
import {
  buildReleaseManifest,
  packBundle,
  packEntries,
  packRuntimeBundle,
} from "../src/pack";
import type {
  ContentBundle,
  PublishOptions,
  RuntimePackBundle,
} from "../src/model";

const text = (value: string) => new TextEncoder().encode(value);

const options: PublishOptions = {
  version: "corpus-v1",
  ruleVersion: "mastery-v1",
  contentLevelRuleVersion: "content-level-v1",
  minClientVersion: "1.0.0",
  approvedBy: "teacher-1",
  dryRun: true,
};

const bundle: ContentBundle = {
  characterBank: { version: "corpus-v1", characters: [] },
  poemBank: { version: "corpus-v1", poems: [] },
  idiomBank: {
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
  masteryRules: { ruleVersion: "mastery-v1" },
  progressionRules: { ruleVersion: "progression-v1" },
  contentLevelRules: {
    ruleVersion: "content-level-v1",
    minimumCumulativeContent: {
      "1": { characters: 10, poems: 1, chainableIdioms: 8 },
      "2": { characters: 20, poems: 3, chainableIdioms: 15 },
      "3": { characters: 40, poems: 6, chainableIdioms: 20 },
      "4": { characters: 60, poems: 10, chainableIdioms: 30 },
      "5": { characters: 80, poems: 15, chainableIdioms: 40 },
    },
  },
  questionsVector: { contentVersion: "corpus-v1", cases: [] },
  testVectors: {
    "assessment.json": {
      contentVersion: "corpus-v1",
      cases: [{ optionalMetadata: null, score: 1 }],
    },
    "mastery.json": { ruleVersion: "mastery-v1", cases: [] },
    "progression.json": { ruleVersion: "progression-v1", cases: [] },
    "questions.json": { contentVersion: "corpus-v1", cases: [] },
  },
};

async function archiveNames(bytes: Uint8Array): Promise<string[]> {
  const names: string[] = [];
  const unpack = extract();
  unpack.on("entry", (header, stream, next) => {
    names.push(header.name);
    stream.on("error", next);
    stream.on("end", next);
    stream.resume();
  });
  await pipeline(
    Readable.from([Buffer.from(bytes)]),
    createGunzip(),
    unpack,
  );
  return names;
}

describe("packEntries", () => {
  it("is byte-identical regardless of input order", async () => {
    const a = await packEntries([
      { name: "b.txt", data: text("b") },
      { name: "a.txt", data: text("a") },
    ]);
    const b = await packEntries([
      { name: "a.txt", data: text("a") },
      { name: "b.txt", data: text("b") },
    ]);

    expect(a).toEqual(b);
    expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(a.fileSize).toBe(a.bytes.length);
  });

  it("changes the digest when an entry changes", async () => {
    const a = await packEntries([{ name: "a.txt", data: text("a") }]);
    const b = await packEntries([{ name: "a.txt", data: text("b") }]);

    expect(a.sha256).not.toBe(b.sha256);
  });
});

describe("packBundle", () => {
  it("packs every vector carried by the bundle without self-referential manifest", async () => {
    const pack = await packBundle(bundle, options);

    await expect(archiveNames(pack.bytes)).resolves.toEqual([
      "corpus/character-bank.json",
      "corpus/idiom-bank.json",
      "corpus/poem-bank.json",
      "rules/content-level-v1.json",
      "rules/mastery-v1.json",
      "rules/progression-v1.json",
      "test-vectors/assessment.json",
      "test-vectors/mastery.json",
      "test-vectors/progression.json",
      "test-vectors/questions.json",
    ]);
  });

  it("packs only the seven runtime files for a leveled artifact", async () => {
    const pack = await packRuntimeBundle({
      ...bundle,
      curriculumMap: { version: "curriculum-v1", themes: [] },
    } satisfies RuntimePackBundle);

    await expect(archiveNames(pack.bytes)).resolves.toEqual([
      "corpus/character-bank.json",
      "corpus/idiom-bank.json",
      "corpus/poem-bank.json",
      "curriculum/curriculum-v1.json",
      "rules/content-level-v1.json",
      "rules/mastery-v1.json",
      "rules/progression-v1.json",
    ]);
  });

  it("creates a sidecar manifest with both rule versions and the payload digest", async () => {
    const pack = await packEntries([{ name: "corpus/character-bank.json", data: text("{}\n") }]);

    expect(buildReleaseManifest(pack, options, bundle)).toEqual({
      version: "corpus-v1",
      contentLevelRuleVersion: "content-level-v1",
      masteryRuleVersion: "mastery-v1",
      progressionRuleVersion: "progression-v1",
      sha256: pack.sha256,
      fileSize: pack.fileSize,
      minClientVersion: "1.0.0",
      approvedBy: "teacher-1",
    });
  });
});
