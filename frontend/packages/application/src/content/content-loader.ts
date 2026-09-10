import type {
  Character,
  ContentLevel,
  Idiom,
  LeveledManifest,
  Poem,
} from "@cc/content-schema";
import { leveledManifestSchema } from "@cc/content-schema";

export interface RuntimeCorpus {
  /** 识字库：古文乐园不出识字题，保留为可选 plumbing，默认空。 */
  characters?: Character[];
  poems: Poem[];
  idioms: Idiom[];
}

export type LoadedContentSource = "REMOTE" | "CACHE" | "BUNDLED";
export type AuthenticationState = "AUTHENTICATED" | "GUEST";

export interface LoadedContent {
  childProfileId: string;
  authentication: AuthenticationState;
  manifest: LeveledManifest;
  corpus: RuntimeCorpus;
  source: LoadedContentSource;
}

export interface ContentCacheKey {
  childProfileId: string;
  version: string;
  abilityLevel: ContentLevel;
  sha256: string;
}

export interface ContentCacheRecord {
  childProfileId: string;
  manifest: LeveledManifest;
  bytes: Uint8Array;
}

export interface ContentSelection {
  childProfileId: string;
  authentication: AuthenticationState;
  version: string;
  abilityLevel: ContentLevel;
}

export interface ContentLoaderDeps {
  auth: { session(): Promise<{ childProfileId: string }> };
  manifests: { manifest(childProfileId: string): Promise<LeveledManifest> };
  binary: { download(url: string): Promise<Uint8Array> };
  hash: { sha256(bytes: Uint8Array): Promise<string> };
  decoder: {
    decode(
      bytes: Uint8Array,
      manifest: LeveledManifest,
    ): Promise<RuntimeCorpus>;
  };
  cache: {
    readExact(key: ContentCacheKey): Promise<ContentCacheRecord | null>;
    readPinned(
      childProfileId: string,
      selection: ContentSelection,
    ): Promise<ContentCacheRecord | null>;
    readLatest(childProfileId: string): Promise<ContentCacheRecord | null>;
    write(record: ContentCacheRecord): Promise<void>;
    remove(key: ContentCacheKey): Promise<void>;
  };
  bundled: { load(level: ContentLevel): RuntimeCorpus };
  guestIdentity: { getOrCreateChildId(): Promise<string> };
  clientVersion: { current(): string };
  diagnostics: { record(error: unknown): void };
}

export interface ContentLoader {
  load(selection?: ContentSelection): Promise<LoadedContent>;
  refreshAfterSession(): Promise<LoadedContent>;
}

export function isContentSelection(
  value: unknown,
): value is ContentSelection {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.childProfileId === "string" &&
    candidate.childProfileId !== "" &&
    (candidate.authentication === "AUTHENTICATED" ||
      candidate.authentication === "GUEST") &&
    typeof candidate.version === "string" &&
    candidate.version !== "" &&
    typeof candidate.abilityLevel === "number" &&
    Number.isInteger(candidate.abilityLevel) &&
    candidate.abilityLevel >= 1 &&
    candidate.abilityLevel <= 5
  );
}

export function contentSelectionOf(
  content: LoadedContent,
): ContentSelection {
  return {
    childProfileId: content.childProfileId,
    authentication: content.authentication,
    version: content.manifest.version,
    abilityLevel: content.manifest.abilityLevel,
  };
}

export function createContentLoader(deps: ContentLoaderDeps): ContentLoader {
  const loadPinned = async (
    selection: ContentSelection,
  ): Promise<LoadedContent> => {
    let record: ContentCacheRecord | null = null;
    try {
      const bundled = bundledManifest(selection.abilityLevel);
      if (selection.version === bundled.version) {
        return ready(
          selection.childProfileId,
          selection.authentication,
          bundled,
          deps.bundled.load(selection.abilityLevel),
          "BUNDLED",
        );
      }
      record = await deps.cache.readPinned(
        selection.childProfileId,
        selection,
      );
      if (record === null) {
        throw new Error("version-pinned content cache is unavailable");
      }
      if (
        record.manifest.version !== selection.version ||
        record.manifest.abilityLevel !== selection.abilityLevel
      ) {
        throw new Error("content cache does not match session pin");
      }
      const corpus = await verifyRecord(
        deps,
        record,
        selection.childProfileId,
      );
      return ready(
        selection.childProfileId,
        selection.authentication,
        record.manifest,
        corpus,
        "CACHE",
      );
    } catch (error) {
      deps.diagnostics.record(error);
      if (record !== null) {
        await deps.cache.remove(
          cacheKey(selection.childProfileId, record.manifest),
        );
      }
      throw error;
    }
  };

  const load = async (
    selection?: ContentSelection,
  ): Promise<LoadedContent> => {
    if (selection !== undefined) return loadPinned(selection);
    let childProfileId: string | null = null;
    let manifest: LeveledManifest | null = null;
    try {
      childProfileId = (await deps.auth.session()).childProfileId;
      manifest = leveledManifestSchema.parse(
        await deps.manifests.manifest(childProfileId),
      );
      if (compareVersions(deps.clientVersion.current(), manifest.minClientVersion) < 0) {
        throw new Error("client version is below manifest minimum");
      }
      const key = cacheKey(childProfileId, manifest);
      const exact = await deps.cache.readExact(key);
      if (exact !== null) {
        try {
          const corpus = await verifyRecord(deps, exact, childProfileId, manifest);
          return ready(childProfileId, "AUTHENTICATED", manifest, corpus, "CACHE");
        } catch (cacheError) {
          deps.diagnostics.record(cacheError);
          await deps.cache.remove(key);
        }
      }
      const bytes = await deps.binary.download(manifest.artifactUrl);
      const record = { childProfileId, manifest, bytes };
      const corpus = await verifyRecord(deps, record, childProfileId, manifest);
      await deps.cache.write(record);
      return ready(childProfileId, "AUTHENTICATED", manifest, corpus, "REMOTE");
    } catch (error) {
      deps.diagnostics.record(error);
      if (childProfileId !== null) {
        const latest = await deps.cache.readLatest(childProfileId);
        if (latest !== null) {
          try {
            if (
              manifest !== null &&
              latest.manifest.abilityLevel > manifest.abilityLevel
            ) {
              throw new Error("cached content exceeds current child level");
            }
            const corpus = await verifyRecord(deps, latest, childProfileId);
            return ready(
              childProfileId,
              "AUTHENTICATED",
              latest.manifest,
              corpus,
              "CACHE",
            );
          } catch (cacheError) {
            deps.diagnostics.record(cacheError);
            await deps.cache.remove(
              cacheKey(latest.childProfileId, latest.manifest),
            );
          }
        }
        const level = manifest?.abilityLevel ?? 1;
        return ready(
          childProfileId,
          "AUTHENTICATED",
          bundledManifest(level),
          deps.bundled.load(level),
          "BUNDLED",
        );
      }
      const guestChildId = await deps.guestIdentity.getOrCreateChildId();
      return ready(
        guestChildId,
        "GUEST",
        bundledManifest(1),
        deps.bundled.load(1),
        "BUNDLED",
      );
    }
  };

  return { load, refreshAfterSession: load };
}

async function verifyRecord(
  deps: ContentLoaderDeps,
  record: ContentCacheRecord,
  expectedChildProfileId: string,
  expectedManifest?: LeveledManifest,
): Promise<RuntimeCorpus> {
  const manifest = leveledManifestSchema.parse(record.manifest);
  if (record.childProfileId !== expectedChildProfileId) {
    throw new Error("content cache belongs to another child");
  }
  if (
    expectedManifest !== undefined &&
    (manifest.version !== expectedManifest.version ||
      manifest.abilityLevel !== expectedManifest.abilityLevel ||
      manifest.sha256 !== expectedManifest.sha256)
  ) {
    throw new Error("content cache does not match manifest");
  }
  if (compareVersions(deps.clientVersion.current(), manifest.minClientVersion) < 0) {
    throw new Error("client version is below manifest minimum");
  }
  if (record.bytes.byteLength !== manifest.fileSize) {
    throw new Error("content artifact size mismatch");
  }
  if ((await deps.hash.sha256(record.bytes)) !== manifest.sha256) {
    throw new Error("content artifact hash mismatch");
  }
  const corpus = await deps.decoder.decode(record.bytes, manifest);
  for (const item of [
    ...(corpus.characters ?? []),
    ...corpus.poems,
    ...corpus.idioms,
  ]) {
    if (item.status !== "ACTIVE" || item.level > manifest.abilityLevel) {
      throw new Error("content artifact exceeds manifest level");
    }
  }
  return corpus;
}

function cacheKey(
  childProfileId: string,
  manifest: LeveledManifest,
): ContentCacheKey {
  return {
    childProfileId,
    version: manifest.version,
    abilityLevel: manifest.abilityLevel,
    sha256: manifest.sha256,
  };
}

function ready(
  childProfileId: string,
  authentication: AuthenticationState,
  manifest: LeveledManifest,
  corpus: RuntimeCorpus,
  source: LoadedContentSource,
): LoadedContent {
  return { childProfileId, authentication, manifest, corpus, source };
}

function bundledManifest(level: ContentLevel): LeveledManifest {
  return {
    version: `bundled-corpus-v5-L${level}`,
    abilityLevel: level,
    artifactUrl: "https://bundled.invalid/content.tar.gz",
    sha256: "0".repeat(64),
    fileSize: 1,
    format: "tar+gzip",
    minClientVersion: "0.0.0",
    contentLevelRuleVersion: "content-level-v1",
    masteryRuleVersion: "mastery-v1",
    progressionRuleVersion: "progression-v1",
  };
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
