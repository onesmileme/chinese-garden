import { createHash } from "node:crypto";
import { createGzip } from "node:zlib";
import { pack as createTar } from "tar-stream";
import type {
  ContentBundle,
  PackResult,
  PublishOptions,
  RuntimePackBundle,
} from "./model";

export interface PackEntry {
  name: string;
  data: Uint8Array;
}

export interface ReleaseManifest {
  version: string;
  contentLevelRuleVersion: string;
  masteryRuleVersion: string;
  progressionRuleVersion: string;
  sha256: string;
  fileSize: number;
  minClientVersion: string;
  approvedBy: string;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(object)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(canonicalize(value))}\n`);
}

async function tarGzip(entries: readonly PackEntry[]): Promise<Uint8Array> {
  const tar = createTar();
  const gzip = createGzip({ level: 9 });
  const chunks: Buffer[] = [];
  const completed = new Promise<Uint8Array>((resolve, reject) => {
    tar.on("error", reject);
    gzip.on("error", reject);
    gzip.on("data", (chunk: Buffer) => chunks.push(chunk));
    gzip.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    tar.pipe(gzip);
  });
  for (const entry of entries) {
    tar.entry(
      {
        name: entry.name,
        size: entry.data.length,
        mode: 0o644,
        uid: 0,
        gid: 0,
        mtime: new Date(0),
        type: "file",
      },
      Buffer.from(entry.data),
    );
  }
  tar.finalize();
  return completed;
}

export async function packEntries(
  entries: readonly PackEntry[],
): Promise<PackResult> {
  const sorted = [...entries].sort((left, right) =>
    left.name.localeCompare(right.name, "en"),
  );
  const bytes = await tarGzip(sorted);
  return {
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    fileSize: bytes.length,
  };
}

export async function packBundle(
  bundle: ContentBundle,
  _options: PublishOptions,
): Promise<PackResult> {
  return packEntries([
    {
      name: "corpus/character-bank.json",
      data: canonicalJson(bundle.characterBank),
    },
    { name: "corpus/poem-bank.json", data: canonicalJson(bundle.poemBank) },
    {
      name: "corpus/idiom-bank.json",
      data: canonicalJson(bundle.idiomBank),
    },
    {
      name: `rules/${bundle.masteryRules.ruleVersion}.json`,
      data: canonicalJson(bundle.masteryRules),
    },
    {
      name: `rules/${bundle.progressionRules.ruleVersion}.json`,
      data: canonicalJson(bundle.progressionRules),
    },
    {
      name: `rules/${bundle.contentLevelRules.ruleVersion}.json`,
      data: canonicalJson(bundle.contentLevelRules),
    },
    ...Object.entries(bundle.testVectors).map(([name, value]) => ({
      name: `test-vectors/${name}`,
      data: canonicalJson(value),
    })),
  ]);
}

export async function packRuntimeBundle(
  bundle: RuntimePackBundle,
): Promise<PackResult> {
  return packEntries([
    {
      name: "corpus/character-bank.json",
      data: canonicalJson(bundle.characterBank),
    },
    { name: "corpus/poem-bank.json", data: canonicalJson(bundle.poemBank) },
    {
      name: "corpus/idiom-bank.json",
      data: canonicalJson(bundle.idiomBank),
    },
    {
      name: "curriculum/curriculum-v1.json",
      data: canonicalJson(bundle.curriculumMap),
    },
    {
      name: `rules/${bundle.masteryRules.ruleVersion}.json`,
      data: canonicalJson(bundle.masteryRules),
    },
    {
      name: `rules/${bundle.progressionRules.ruleVersion}.json`,
      data: canonicalJson(bundle.progressionRules),
    },
    {
      name: `rules/${bundle.contentLevelRules.ruleVersion}.json`,
      data: canonicalJson(bundle.contentLevelRules),
    },
  ]);
}

export function buildReleaseManifest(
  pack: PackResult,
  options: PublishOptions,
  bundle: ContentBundle,
): ReleaseManifest {
  return {
    version: options.version,
    contentLevelRuleVersion: bundle.contentLevelRules.ruleVersion,
    masteryRuleVersion: bundle.masteryRules.ruleVersion,
    progressionRuleVersion: bundle.progressionRules.ruleVersion,
    sha256: pack.sha256,
    fileSize: pack.fileSize,
    minClientVersion: options.minClientVersion,
    approvedBy: options.approvedBy,
  };
}
