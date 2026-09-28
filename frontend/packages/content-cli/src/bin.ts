import { fileURLToPath } from "node:url";
import { isAbsolute, resolve, basename, dirname, join } from "node:path";
import {
  copyFile,
  readFile as fsReadFile,
  writeFile as fsWriteFile,
  mkdir,
  mkdtemp,
  open,
  realpath,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream, readFileSync, readdirSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { pinyin } from "pinyin-pro";
import { createHttpAdminPort } from "./adapters/http-admin";
import { nodeFileSystem } from "./adapters/node-fs";
import { processRunner } from "./adapters/proc-runner";
import { createS3Storage } from "./adapters/s3-storage";
import type { PublishOptions } from "./model";
import { publish, publishLeveled } from "./pipeline";
import {
  importCharacters,
  importIdioms,
  importPoems,
  type CatalogCharacter,
} from "./import";
import type { BackendAdminPort, Logger, ObjectStoragePort } from "./ports";
import {
  extractCharacters,
  extractIdioms,
  extractPoems,
  scoreAndRankCharacters,
  scoreAndRankPoems,
  scoreAndRankIdioms,
  deriveLevels,
  buildReport,
  type XinhuaWord,
  type XinhuaIdiom,
  type PoetryEntry,
  type RawCharCandidate,
  type RawPoemCandidate,
  type RawIdiomCandidate,
} from "./raw-candidates";
import {
  buildIdiomCandidateManifest,
  buildIdiomCandidates,
  serializeIdiomCandidates,
  sha256Text,
} from "./idiom-candidates";
import {
  buildGuwendaoPoemCandidates,
  serializeGuwendaoPoemCandidates,
} from "./guwendao-poem-candidates";

class UsageError extends Error {}

interface Output {
  log(message: string): void;
  error(message: string): void;
}

const usage =
  "usage: cc-content publish --version <version> --rule-version <version> --content-level-rule-version <version> --min-client-version <version> --approved-by <actor> [--dry-run]";

function parseOptions(args: string[]): PublishOptions {
  if (args[0] !== "publish") {
    throw new UsageError(usage);
  }

  const values = new Map<string, string>();
  let dryRun = false;
  for (let index = 1; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--dry-run") {
      if (dryRun) throw new UsageError(`duplicate --dry-run\n${usage}`);
      dryRun = true;
      continue;
    }
    if (
      flag !== "--version" &&
      flag !== "--rule-version" &&
      flag !== "--content-level-rule-version" &&
      flag !== "--min-client-version" &&
      flag !== "--approved-by"
    ) {
      throw new UsageError(`unknown option: ${flag ?? ""}\n${usage}`);
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new UsageError(`missing value for ${flag}\n${usage}`);
    }
    if (values.has(flag))
      throw new UsageError(`duplicate option: ${flag}\n${usage}`);
    values.set(flag, value);
    index += 1;
  }

  const version = values.get("--version");
  const ruleVersion = values.get("--rule-version");
  const contentLevelRuleVersion = values.get("--content-level-rule-version");
  const minClientVersion = values.get("--min-client-version");
  const approvedBy = values.get("--approved-by");
  if (
    version === undefined ||
    ruleVersion === undefined ||
    contentLevelRuleVersion === undefined ||
    minClientVersion === undefined ||
    approvedBy === undefined
  ) {
    throw new UsageError(usage);
  }
  return {
    version,
    ruleVersion,
    contentLevelRuleVersion,
    minClientVersion,
    approvedBy,
    dryRun,
  };
}

function unavailablePort(name: string): never {
  throw new Error(`${name} must not be used during --dry-run`);
}

function dryRunStorage(): ObjectStoragePort {
  return {
    async upload() {
      return unavailablePort("object storage");
    },
  };
}

function dryRunAdmin(): BackendAdminPort {
  return {
    async register() {
      return unavailablePort("content admin");
    },
    async transition() {
      return unavailablePort("content admin");
    },
  };
}

const silentLogger: Logger = {
  info() {},
  warn() {},
  error() {},
};

function defaultRepoRoot(): string {
  return fileURLToPath(new URL("../../../../", import.meta.url));
}

const importUsage =
  "usage: cc-content import --in <source.json> [--out <staging.json>]";

interface StagingCharacter {
  version: string;
  characters: unknown[];
}

function resolveContentRoot(env: NodeJS.ProcessEnv): {
  repoRoot: string;
  contentRoot: string;
} {
  const repoRoot = env.CONTENT_REPO_ROOT ?? defaultRepoRoot();
  const configuredRoot = env.CONTENT_ROOT ?? "frontend/content";
  const contentRoot = isAbsolute(configuredRoot)
    ? configuredRoot
    : resolve(repoRoot, configuredRoot);
  return { repoRoot, contentRoot };
}

async function runImport(
  args: string[],
  env: NodeJS.ProcessEnv,
  output: Output,
): Promise<number> {
  const values = new Map<string, string>();
  for (let index = 1; index < args.length; index += 1) {
    const flag = args[index];
    if (flag !== "--in" && flag !== "--out") {
      throw new UsageError(`unknown option: ${flag ?? ""}\n${importUsage}`);
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new UsageError(`missing value for ${flag}\n${importUsage}`);
    }
    if (values.has(flag))
      throw new UsageError(`duplicate option: ${flag}\n${importUsage}`);
    values.set(flag, value);
    index += 1;
  }
  const inArg = values.get("--in");
  if (inArg === undefined) throw new UsageError(importUsage);

  const { contentRoot } = resolveContentRoot(env);
  const inPath = isAbsolute(inArg) ? inArg : resolve(contentRoot, inArg);
  const source = JSON.parse(await fsReadFile(inPath, "utf8")) as {
    type?: string;
  };

  const stagingDir = join(contentRoot, "staging");
  const outPath =
    values.get("--out") !== undefined
      ? isAbsolute(values.get("--out")!)
        ? values.get("--out")!
        : resolve(contentRoot, values.get("--out")!)
      : join(
          stagingDir,
          `${basename(inArg).replace(/\.json$/i, "")}.draft.json`,
        );

  let payload: unknown;
  let count = 0;
  let skipped: string[] = [];
  let issues: { entityId: string; code: string; message: string }[] = [];
  if (source.type === "characters") {
    const result = importCharacters(source as never, {
      existingIds: new Set(),
    });
    payload = { version: "corpus-v5", characters: result.items };
    count = result.items.length;
    skipped = result.skipped;
    issues = result.issues;
  } else if (source.type === "idioms") {
    const bankRaw = await fsReadFile(
      join(contentRoot, "corpus", "idiom-bank.json"),
      "utf8",
    );
    const bank = JSON.parse(bankRaw) as {
      idioms: {
        id: string;
        headPinyin: string;
        tailPinyin: string;
        level: number;
        status: string;
      }[];
    };
    const idiomCatalog = bank.idioms.map((i) => ({
      id: i.id,
      headPinyin: i.headPinyin,
      tailPinyin: i.tailPinyin,
      level: i.level,
      status: i.status,
    }));
    const result = importIdioms(source as never, {
      existingIds: new Set(),
      idiomCatalog,
    });
    payload = { version: "corpus-v5", idioms: result.items };
    count = result.items.length;
    skipped = result.skipped;
    issues = result.issues;
  } else if (source.type === "poems") {
    const bankRaw = await fsReadFile(
      join(contentRoot, "corpus", "character-bank.json"),
      "utf8",
    );
    const bank = JSON.parse(bankRaw) as {
      characters: StagingCharacter["characters"];
    };
    const catalog = (bank.characters as CatalogCharacter[]).map((c) => ({
      id: c.id,
      char: c.char,
      level: c.level,
      status: c.status,
    }));
    const result = importPoems(source as never, { catalog });
    payload = { version: "corpus-v5", poems: result.items };
    count = result.items.length;
    skipped = result.skipped;
    issues = result.issues;
  } else {
    throw new UsageError(
      `unknown source type: ${source.type ?? ""}\n${importUsage}`,
    );
  }

  if (issues.length > 0) {
    for (const issue of issues) {
      output.error(`${issue.code} ${issue.entityId}: ${issue.message}`);
    }
    output.error(
      `import aborted: ${issues.length} validation issue(s); nothing staged`,
    );
    return 1;
  }

  await mkdir(stagingDir, { recursive: true });
  await fsWriteFile(outPath, `${JSON.stringify(payload, null, 2)}\n`);
  output.log(`imported=${count} skipped=${skipped.length} out=${outPath}`);
  return 0;
}

const rawCandidatesUsage =
  "usage: cc-content raw-candidates --raw-root <dir> --out <dir> --characters <n> --poems <n> --idioms <n> --rule-version <v>";

const ingestUsage =
  "usage: cc-content ingest-candidates --in <candidates.ndjson> --admin-url <url> --admin-token <token>";

const idiomCandidatesUsage =
  "usage: cc-content idiom-candidates --source <THUOCL_chengyu.txt> --bank <idiom-bank.json> --out <directory> --count <n> --source-commit <sha> --fetched-at <ISO-8601>";

const guwendaoPoemCandidatesUsage =
  "usage: cc-content guwendao-poem-candidates --source <tangshi.json> --out <candidates.ndjson>";

async function runGuwendaoPoemCandidates(
  args: string[],
  output: Output,
): Promise<number> {
  const known = new Set(["--source", "--out"]);
  const values = new Map<string, string>();
  for (let index = 1; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === undefined || !known.has(flag)) {
      throw new UsageError(
        `unknown option: ${flag ?? ""}\n${guwendaoPoemCandidatesUsage}`,
      );
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new UsageError(
        `missing value for ${flag}\n${guwendaoPoemCandidatesUsage}`,
      );
    }
    if (values.has(flag)) {
      throw new UsageError(
        `duplicate option: ${flag}\n${guwendaoPoemCandidatesUsage}`,
      );
    }
    values.set(flag, value);
    index += 1;
  }

  const sourceArg = values.get("--source");
  const outArg = values.get("--out");
  if (sourceArg === undefined || outArg === undefined) {
    throw new UsageError(guwendaoPoemCandidatesUsage);
  }

  const sourcePath = resolve(sourceArg);
  const outputPath = resolve(outArg);
  const sourceRealPath = await realpath(sourcePath);
  let outputRealPath: string | undefined;
  try {
    outputRealPath = await realpath(outputPath);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw error;
    }
  }
  if (sourceRealPath === outputRealPath) {
    throw new Error("source and output must not refer to the same file");
  }

  const source = JSON.parse(await fsReadFile(sourcePath, "utf8")) as unknown;
  const candidates = buildGuwendaoPoemCandidates(source);
  const serialized = serializeGuwendaoPoemCandidates(candidates);

  await mkdir(dirname(outputPath), { recursive: true });
  const lockPath = `${outputPath}.lock`;
  const temporaryPath = join(
    dirname(outputPath),
    `.${basename(outputPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let lockHandle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    lockHandle = await open(lockPath, "wx");
    await fsWriteFile(temporaryPath, serialized, { flag: "wx" });
    await rename(temporaryPath, outputPath);
  } finally {
    try {
      await rm(temporaryPath, { force: true });
    } finally {
      if (lockHandle !== undefined) {
        try {
          await lockHandle.close();
        } finally {
          await rm(lockPath, { force: true });
        }
      }
    }
  }

  output.log(
    `guwendao-poem-candidates: count=${candidates.length} out=${outputPath}`,
  );
  return 0;
}

async function runIdiomCandidates(
  args: string[],
  output: Output,
): Promise<number> {
  const known = new Set([
    "--source",
    "--bank",
    "--out",
    "--count",
    "--source-commit",
    "--fetched-at",
  ]);
  const values = new Map<string, string>();
  for (let index = 1; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === undefined || !known.has(flag)) {
      throw new UsageError(
        `unknown option: ${flag ?? ""}\n${idiomCandidatesUsage}`,
      );
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new UsageError(
        `missing value for ${flag}\n${idiomCandidatesUsage}`,
      );
    }
    if (values.has(flag)) {
      throw new UsageError(
        `duplicate option: ${flag}\n${idiomCandidatesUsage}`,
      );
    }
    values.set(flag, value);
    index += 1;
  }

  const sourceArg = values.get("--source");
  const bankArg = values.get("--bank");
  const outArg = values.get("--out");
  const countArg = values.get("--count");
  const sourceCommit = values.get("--source-commit");
  const fetchedAt = values.get("--fetched-at");
  if (
    sourceArg === undefined ||
    bankArg === undefined ||
    outArg === undefined ||
    countArg === undefined ||
    sourceCommit === undefined ||
    fetchedAt === undefined
  ) {
    throw new UsageError(idiomCandidatesUsage);
  }

  const count = Number(countArg);
  if (
    !/^[1-9][0-9]*$/.test(countArg) ||
    !Number.isSafeInteger(count) ||
    count <= 0
  ) {
    throw new UsageError(
      `--count must be a positive integer\n${idiomCandidatesUsage}`,
    );
  }

  const sourcePath = resolve(sourceArg);
  const bankPath = resolve(bankArg);
  const outputDirectory = resolve(outArg);
  const sourceText = await fsReadFile(sourcePath, "utf8");
  const bankText = await fsReadFile(bankPath, "utf8");
  const bank = JSON.parse(bankText) as unknown;
  if (
    typeof bank !== "object" ||
    bank === null ||
    !("idioms" in bank) ||
    !Array.isArray(bank.idioms) ||
    bank.idioms.some(
      (idiom) =>
        typeof idiom !== "object" ||
        idiom === null ||
        !("text" in idiom) ||
        typeof idiom.text !== "string",
    )
  ) {
    throw new Error("invalid idiom bank: expected idioms[].text strings");
  }

  const generated = buildIdiomCandidates({
    sourceText,
    existingTexts: new Set(bank.idioms.map(({ text }) => text)),
    count,
    pinyinFor(text) {
      return pinyin(text, { type: "array", toneType: "symbol" });
    },
  });
  const candidateText = serializeIdiomCandidates(generated.candidates);
  const manifest = buildIdiomCandidateManifest({
    sourceCommit,
    sourceSha256: sha256Text(sourceText),
    bankSha256: sha256Text(bankText),
    outputSha256: sha256Text(candidateText),
    fetchedAt,
    pinyinProVersion: "3.29.4",
    count,
    stats: generated.stats,
  });
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;

  const candidateName = "idioms-thuocl-top1000.ndjson";
  const manifestName = "idioms-thuocl-top1000.manifest.json";
  const candidatePath = join(outputDirectory, candidateName);
  const manifestPath = join(outputDirectory, manifestName);
  const lockPath = join(outputDirectory, ".idioms-thuocl-top1000.lock");

  await mkdir(outputDirectory, { recursive: true });
  let lockHandle: Awaited<ReturnType<typeof open>> | undefined;
  let tempDirectory: string | undefined;
  try {
    lockHandle = await open(lockPath, "wx");
    tempDirectory = await mkdtemp(
      join(outputDirectory, ".idioms-thuocl-top1000-"),
    );
    const candidateTempPath = join(tempDirectory, candidateName);
    const manifestTempPath = join(tempDirectory, manifestName);
    const candidateBackupPath = join(tempDirectory, `${candidateName}.backup`);
    const manifestBackupPath = join(tempDirectory, `${manifestName}.backup`);

    await fsWriteFile(candidateTempPath, candidateText);
    await fsWriteFile(manifestTempPath, manifestText);
    const candidateHadBackup = await copyRegularFileIfPresent(
      candidatePath,
      candidateBackupPath,
    );
    const manifestHadBackup = await copyRegularFileIfPresent(
      manifestPath,
      manifestBackupPath,
    );

    let candidateCommitted = false;
    let manifestCommitted = false;
    try {
      await rename(candidateTempPath, candidatePath);
      candidateCommitted = true;
      await rename(manifestTempPath, manifestPath);
      manifestCommitted = true;
    } catch (error) {
      if (manifestCommitted) {
        await restoreCommittedFile(
          manifestPath,
          manifestBackupPath,
          manifestHadBackup,
        );
      }
      if (candidateCommitted) {
        await restoreCommittedFile(
          candidatePath,
          candidateBackupPath,
          candidateHadBackup,
        );
      }
      throw error;
    }
  } finally {
    try {
      if (tempDirectory !== undefined) {
        await rm(tempDirectory, { recursive: true, force: true });
      }
    } finally {
      if (lockHandle !== undefined) {
        try {
          await lockHandle.close();
        } finally {
          await rm(lockPath, { force: true });
        }
      }
    }
  }

  output.log(
    `idiom-candidates: count=${generated.candidates.length} out=${outputDirectory}`,
  );
  return 0;
}

async function copyRegularFileIfPresent(
  sourcePath: string,
  backupPath: string,
): Promise<boolean> {
  try {
    if (!(await stat(sourcePath)).isFile()) {
      return false;
    }
    await copyFile(sourcePath, backupPath);
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return false;
    }
    throw error;
  }
}

async function restoreCommittedFile(
  finalPath: string,
  backupPath: string,
  hadBackup: boolean,
): Promise<void> {
  await rm(finalPath, { force: true });
  if (hadBackup) {
    await rename(backupPath, finalPath);
  }
}

async function runIngestCandidates(
  args: string[],
  _env: NodeJS.ProcessEnv,
  output: Output,
): Promise<number> {
  const values = new Map<string, string>();
  for (let i = 1; i < args.length; i += 1) {
    const flag = args[i];
    const known = new Set(["--in", "--admin-url", "--admin-token"]);
    if (flag === undefined || !known.has(flag)) {
      throw new UsageError(`unknown option: ${flag}\n${ingestUsage}`);
    }
    const val = args[i + 1];
    if (val === undefined || val.startsWith("--")) {
      throw new UsageError(`missing value for ${flag}\n${ingestUsage}`);
    }
    values.set(flag, val);
    i += 1;
  }

  const inPath = values.get("--in");
  const adminUrl = values.get("--admin-url");
  const adminToken = values.get("--admin-token");

  if (!inPath || !adminUrl || !adminToken) {
    throw new UsageError(ingestUsage);
  }

  type RawCandidate = RawCharCandidate | RawPoemCandidate | RawIdiomCandidate;

  const raw = readFileSync(inPath, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  const candidates: RawCandidate[] = lines.map(
    (l) => JSON.parse(l) as RawCandidate,
  );

  const BATCH_SIZE = 1000;
  const totalChunks = Math.ceil(candidates.length / BATCH_SIZE);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Admin-Token": adminToken,
  };

  const adminUrlBase = adminUrl.replace(/\/+$/, "");

  // 1. Create batch
  const createRes = await fetch(`${adminUrlBase}/v1/admin/content-imports`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ruleVersion: "raw-corpus-v1",
      characters: candidates.length,
    }),
  });

  if (!createRes.ok) {
    const body = await safeText(createRes);
    output.error(`create batch failed: HTTP ${createRes.status} ${body}`);
    return 1;
  }

  const { id: batchId } = (await createRes.json()) as { id: string };

  // 2. Send chunks
  for (let chunk = 0; chunk < totalChunks; chunk += 1) {
    const chunkCandidates = candidates.slice(
      chunk * BATCH_SIZE,
      (chunk + 1) * BATCH_SIZE,
    );

    const chunkRes = await fetch(
      `${adminUrlBase}/v1/admin/content-imports/${batchId}/candidates`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(chunkCandidates),
      },
    );

    if (!chunkRes.ok) {
      const body = await safeText(chunkRes);
      output.error(
        `chunk ${chunk + 1}/${totalChunks} failed: HTTP ${chunkRes.status} ${body}`,
      );
      return 1;
    }

    const chunkResult = (await chunkRes.json()) as {
      imported: number;
      skipped: number;
      rejected: number;
    };
    output.log(
      `chunk ${chunk + 1}/${totalChunks}: ${chunkCandidates.length} candidates → imported=${chunkResult.imported} skipped=${chunkResult.skipped} rejected=${chunkResult.rejected}`,
    );
  }

  // 3. Complete batch
  const completeRes = await fetch(
    `${adminUrlBase}/v1/admin/content-imports/${batchId}/complete`,
    {
      method: "POST",
      headers,
    },
  );

  if (!completeRes.ok) {
    const body = await safeText(completeRes);
    output.error(`complete batch failed: HTTP ${completeRes.status} ${body}`);
    return 1;
  }

  return 0;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

async function runRawCandidates(
  args: string[],
  env: NodeJS.ProcessEnv,
  output: Output,
): Promise<number> {
  const values = new Map<string, string>();
  for (let i = 1; i < args.length; i += 1) {
    const flag = args[i];
    const known = new Set([
      "--raw-root",
      "--out",
      "--characters",
      "--poems",
      "--idioms",
      "--rule-version",
    ]);
    if (flag === undefined || !known.has(flag)) {
      throw new UsageError(`unknown option: ${flag}\n${rawCandidatesUsage}`);
    }
    const val = args[i + 1];
    if (val === undefined || val.startsWith("--")) {
      throw new UsageError(`missing value for ${flag}\n${rawCandidatesUsage}`);
    }
    values.set(flag, val);
    i += 1;
  }

  const rawRoot = values.get("--raw-root");
  const outDir = values.get("--out");
  const charTarget = parseInt(values.get("--characters") ?? "0", 10);
  const poemTarget = parseInt(values.get("--poems") ?? "0", 10);
  const idiomTarget = parseInt(values.get("--idioms") ?? "0", 10);
  const ruleVersion = values.get("--rule-version");

  if (!rawRoot || !outDir || !ruleVersion)
    throw new UsageError(rawCandidatesUsage);

  const { contentRoot } = resolveContentRoot(env);
  const absRawRoot = isAbsolute(rawRoot)
    ? rawRoot
    : resolve(contentRoot, rawRoot);
  const absOutDir = isAbsolute(outDir) ? outDir : resolve(contentRoot, outDir);

  // 1. Extract all candidates
  const rejectionReasons: Record<string, number> = {};

  const charResult = extractCharacters(
    readJsonArray<XinhuaWord>(join(absRawRoot, "raw", "xinhua", "word.json")),
    { targetCount: charTarget },
  );
  mergeReasons(rejectionReasons, charResult.rejectionReasons);

  const idiomResult = extractIdioms(
    readJsonArray<XinhuaIdiom>(join(absRawRoot, "raw", "xinhua", "idiom.json")),
    { targetCount: idiomTarget },
  );
  mergeReasons(rejectionReasons, idiomResult.rejectionReasons);

  const poemResult = extractPoems(
    readAllPoetryFiles(join(absRawRoot, "raw", "chinese-poetry")),
    { targetCount: poemTarget },
  );
  mergeReasons(rejectionReasons, poemResult.rejectionReasons);

  // 2. Build character frequency map from poems
  const poemCharFreq = new Map<string, number>();
  for (const p of poemResult.candidates) {
    for (const ch of Array.from(p.payload.lines.join(""))) {
      poemCharFreq.set(ch, (poemCharFreq.get(ch) ?? 0) + 1);
    }
  }

  // 3. Score and rank
  const activeCharIds = new Set<string>(); // will be populated from corpus later
  let rankedChars = scoreAndRankCharacters(
    charResult.candidates,
    poemCharFreq,
    charTarget,
  );
  let rankedPoems = scoreAndRankPoems(
    poemResult.candidates,
    activeCharIds,
    poemTarget,
  );
  let rankedIdioms = scoreAndRankIdioms(
    idiomResult.candidates,
    activeCharIds,
    idiomTarget,
  );

  // 4. Derive levels
  rankedChars = deriveLevels(rankedChars, rankedChars.length);
  rankedPoems = deriveLevels(rankedPoems, rankedPoems.length);
  rankedIdioms = deriveLevels(rankedIdioms, rankedIdioms.length);

  // 5. Write outputs
  await mkdir(absOutDir, { recursive: true });

  const allCandidates = [...rankedChars, ...rankedPoems, ...rankedIdioms];
  const ndjsonPath = join(absOutDir, "candidates.ndjson");
  const ndjsonContent =
    allCandidates.map((c) => JSON.stringify(c)).join("\n") + "\n";
  await fsWriteFile(ndjsonPath, ndjsonContent);

  const report = buildReport({
    ruleVersion,
    sourceTotals: {
      characters: charResult.candidates.length + charResult.filtered,
      poems: poemResult.candidates.length + poemResult.filtered,
      idioms: idiomResult.candidates.length + idiomResult.filtered,
    },
    filtered: {
      characters: charResult.filtered,
      poems: poemResult.filtered,
      idioms: idiomResult.filtered,
    },
    afterDedupe: {
      characters: rankedChars.length,
      poems: rankedPoems.length,
      idioms: rankedIdioms.length,
    },
    output: {
      characters: rankedChars,
      poems: rankedPoems,
      idioms: rankedIdioms,
    },
    rejectionReasons,
  });
  await fsWriteFile(
    join(absOutDir, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );

  const fileSha256 = createHash("sha256").update(ndjsonContent).digest("hex");
  const manifest = {
    ruleVersion,
    generatedAt: new Date().toISOString(),
    fileSha256,
    totals: report.totals,
  };
  await fsWriteFile(
    join(absOutDir, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );

  output.log(
    `raw-candidates: chars=${rankedChars.length} poems=${rankedPoems.length} idioms=${rankedIdioms.length} out=${absOutDir}`,
  );
  return 0;
}

function readJsonArray<T>(path: string): T[] {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T[];
  } catch {
    return [];
  }
}

function readAllPoetryFiles(baseDir: string): PoetryEntry[] {
  const entries: PoetryEntry[] = [];
  try {
    const files = readdirSync(baseDir, {
      recursive: true,
      withFileTypes: true,
    });
    for (const f of files) {
      if (!f.isFile() || !f.name.endsWith(".json")) continue;
      const fullPath = join(f.parentPath ?? baseDir, f.name);
      try {
        const data = JSON.parse(readFileSync(fullPath, "utf8"));
        const arr = Array.isArray(data) ? data : [data];
        for (const item of arr) {
          if (item.title && item.paragraphs) {
            entries.push(item as PoetryEntry);
          }
        }
      } catch {
        // skip unparseable files
      }
    }
  } catch {
    // base dir missing → empty
  }
  return entries;
}

function mergeReasons(
  target: Record<string, number>,
  source: Record<string, number>,
): void {
  for (const [key, count] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + count;
  }
}

export async function run(
  args: string[],
  env: NodeJS.ProcessEnv,
  output: Output,
): Promise<number> {
  try {
    if (args[0] === "import") {
      return await runImport(args, env, output);
    }
    if (args[0] === "raw-candidates") {
      return await runRawCandidates(args, env, output);
    }
    if (args[0] === "ingest-candidates") {
      return await runIngestCandidates(args, env, output);
    }
    if (args[0] === "idiom-candidates") {
      return await runIdiomCandidates(args, output);
    }
    if (args[0] === "guwendao-poem-candidates") {
      return await runGuwendaoPoemCandidates(args, output);
    }
    if (args[0] !== "publish") {
      throw new UsageError(usage);
    }
    const options = parseOptions(args);
    const { repoRoot, contentRoot } = resolveContentRoot(env);

    const storage = options.dryRun
      ? dryRunStorage()
      : createS3Storage({
          bucket: env.CONTENT_S3_BUCKET ?? "",
          region: env.CONTENT_S3_REGION ?? "",
          ...(env.CONTENT_S3_ENDPOINT === undefined
            ? {}
            : { endpoint: env.CONTENT_S3_ENDPOINT }),
          ...(env.CONTENT_PUBLIC_BASE_URL === undefined
            ? {}
            : { publicBaseUrl: env.CONTENT_PUBLIC_BASE_URL }),
        });
    const admin = options.dryRun
      ? dryRunAdmin()
      : createHttpAdminPort({
          baseUrl: env.CONTENT_ADMIN_BASE_URL ?? "",
          token: env.CONTENT_ADMIN_TOKEN ?? "",
        });

    const publishDeps = {
      fs: nodeFileSystem,
      storage,
      admin,
      runner: processRunner,
      logger: silentLogger,
      contentRoot,
      repoRoot,
    };
    const outcome = options.dryRun
      ? await publish(publishDeps, options)
      : await publishLeveled(
          {
            ...publishDeps,
            admin: createHttpAdminPort({
              baseUrl: env.CONTENT_ADMIN_BASE_URL ?? "",
              token: env.CONTENT_ADMIN_TOKEN ?? "",
            }),
          },
          options,
        );
    if (!outcome.ok) {
      for (const issue of outcome.issues) {
        output.error(`${issue.stage}:${issue.code}: ${issue.message}`);
      }
      return 1;
    }
    const digest =
      "sha256" in outcome
        ? outcome.sha256
        : outcome.artifacts.map((artifact) => artifact.sha256).join(",");
    output.log(
      `version=${outcome.version} sha256=${digest} status=${outcome.finalStatus ?? "DRY_RUN"}`,
    );
    return 0;
  } catch (error) {
    output.error(
      error instanceof Error ? error.message : "content publish failed",
    );
    return error instanceof UsageError ? 2 : 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const code = await run(process.argv.slice(2), process.env, console);
  process.exitCode = code;
}
